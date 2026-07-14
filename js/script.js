// ══════════════════════════════════════════════
//  Alfie Test Portal — Main Script
// ══════════════════════════════════════════════

const HAS_API = ('serial' in navigator);
let port = null, writer = null;
let tsState = 'on';

// ── Command definitions ──
// Alfie No is inserted where {A} appears; {D} = door/param input
const CMD_MAP = {
  reset:        _a => `t00F17c`,
  standardMode: a => `t${a}F45711FFFF`,
  selfDetect:   a => `t${a}F144`,
  openAll:      a => `t${a}F24f2a`,
  openDoor:     (a, d) => `t${a}F24f${decToHex(d)}`,
  statusAll:    a => `t${a}F2512a`,
  statusDoor:   (a, d) => `t${a}F251${decToHex(d)}`,
  readParam:    (a, d, dlc) => `t${a}F${dlc}52${d}`,
  editParam:    (a, id, val, dlc) => `t${a}F${dlc}57${id}${val}`,
};

const NEEDS_INPUT = ['openDoor','statusDoor','readParam','editParam'];
const NEEDS_DLC   = ['readParam'];

function getAlfie() {
  return document.getElementById('alfieSelect').value;
}

function getInput(key) {
  const el = document.getElementById('in-' + key);
  return el ? el.value.trim() : '';
}

function buildCmd(key) {
  const a = getAlfie();
  const d = getInput(key);
  const fn = CMD_MAP[key];
  if (key === 'readParam') {
    const dlc = (document.getElementById('in-dlc') ? document.getElementById('in-dlc').value.trim() : '2') || '2';
    return fn ? fn(a, d, dlc) : '';
  }
  if (key === 'editParam') {
    const id  = (document.getElementById('in-editId')  ? document.getElementById('in-editId').value.trim()  : '') ;
    const val = (document.getElementById('in-editVal') ? document.getElementById('in-editVal').value.trim() : '') ;
    const dlc = (document.getElementById('in-editDlc') ? document.getElementById('in-editDlc').value.trim() : '4') || '4';
    return fn ? fn(a, id, val, dlc) : '';
  }
  return fn ? fn(a, d) : '';
}

function eolSuffix() {
  const v = document.getElementById('eolSelect').value;
  if (v === 'CR')   return '\r';
  if (v === 'LF')   return '\n';
  return '\r\n';
}

function eolLabel() {
  return document.getElementById('eolSelect').value;
}

// ── Fire a command ──
async function fireCmd(key) {
  // ── Read Parameter: ID required + even hex ──
  if (key === 'readParam') {
    const idEl  = document.getElementById('in-readParam');
    const idStr = idEl ? idEl.value.trim() : '';
    if (!idStr) {
      addLog('WARN', 'Read Parameter: ID is required.');
      if (idEl) { idEl.focus(); idEl.style.borderColor = 'var(--red)'; }
      return;
    }
    if (idStr.length % 2 !== 0) {
      addLog('WARN', 'Read Parameter: ID must be an even number of hex characters.');
      if (idEl) { idEl.focus(); idEl.style.borderColor = 'var(--red)'; }
      return;
    }
  }

  // ── Edit Parameter: ID + VALUE required + even hex ──
  if (key === 'editParam') {
    const idEl  = document.getElementById('in-editId');
    const valEl = document.getElementById('in-editVal');
    const idStr  = idEl  ? idEl.value.trim()  : '';
    const valStr = valEl ? valEl.value.trim() : '';
    if (!idStr) {
      addLog('WARN', 'Edit Parameter: ID is required.');
      if (idEl) { idEl.focus(); idEl.style.borderColor = 'var(--red)'; }
      return;
    }
    if (idStr.length % 2 !== 0) {
      addLog('WARN', 'Edit Parameter: ID must be an even number of hex characters.');
      if (idEl) { idEl.focus(); idEl.style.borderColor = 'var(--red)'; }
      return;
    }
    if (!valStr) {
      addLog('WARN', 'Edit Parameter: VALUE is required.');
      if (valEl) { valEl.focus(); valEl.style.borderColor = 'var(--red)'; }
      return;
    }
    if (valStr.length % 2 !== 0) {
      addLog('WARN', 'Edit Parameter: VALUE must be an even number of hex characters.');
      if (valEl) { valEl.focus(); valEl.style.borderColor = 'var(--red)'; }
      return;
    }
  }

  // ── Door commands: door number required ──
  if (key === 'openDoor' || key === 'statusDoor') {
    const el = document.getElementById('in-' + key);
    const val = el ? el.value.trim() : '';
    if (!val) {
      addLog('WARN', `${key === 'openDoor' ? 'Open Door' : 'Door Status'}: Door number is required.`);
      if (el) { el.focus(); el.style.borderColor = 'var(--red)'; setTimeout(() => el.style.borderColor = '', 1200); }
      return;
    }
  }
  const cmd = buildCmd(key);
  await sendCmd(cmd);
}

async function sendCmd(raw) {
  const eol = eolSuffix();
  const full = raw + eol;
  const encoded = new TextEncoder().encode(full);
  if (writer) {
    await writer.write(encoded);
    addLog('CMD', `> ${raw}`);
  } else {
    addLog('CMD', `[preview] ${raw}`);
  }
}

// ── Live previews ──
// Auto-calculate DLC = (ID hex chars / 2) + 1
// ID must be even number of hex chars (each byte = 2 chars)
function autoUpdateDLC() {
  const idEl  = document.getElementById('in-readParam');
  const dlcEl = document.getElementById('in-dlc');
  const errEl = document.getElementById('dlc-err');
  if (!idEl || !dlcEl) return;
  const idStr = idEl.value.trim().replace(/\s+/g, '');
  if (idStr.length === 0) {
    dlcEl.value = '2';
    idEl.style.borderColor = '';
    if (errEl) errEl.style.display = 'none';
    return;
  }
  if (idStr.length % 2 !== 0) {
    idEl.style.borderColor = 'var(--red)';
    if (errEl) errEl.style.display = 'block';
    return;
  }
  idEl.style.borderColor = 'var(--green)';
  if (errEl) errEl.style.display = 'none';
  const byteLen = idStr.length / 2;
  dlcEl.value = byteLen + 1;
}

// Auto-calculate Edit DLC = bytes(ID) + bytes(VALUE) + 1
function autoUpdateEditDLC() {
  const idEl  = document.getElementById('in-editId');
  const valEl = document.getElementById('in-editVal');
  const dlcEl = document.getElementById('in-editDlc');
  const errEl = document.getElementById('edit-err');
  if (!idEl || !valEl || !dlcEl) return;

  const idStr  = idEl.value.trim();
  const valStr = valEl.value.trim();
  let errors = [];

  if (idStr.length > 0 && idStr.length % 2 !== 0) {
    idEl.style.borderColor = 'var(--red)';
    errors.push('ID must be even hex chars');
  } else {
    idEl.style.borderColor = idStr.length > 0 ? 'var(--green)' : '';
  }

  if (valStr.length > 0 && valStr.length % 2 !== 0) {
    valEl.style.borderColor = 'var(--red)';
    errors.push('VALUE must be even hex chars');
  } else {
    valEl.style.borderColor = valStr.length > 0 ? 'var(--green)' : '';
  }

  if (errors.length > 0) {
    errEl.textContent = '\u26a0 ' + errors.join(' \u00b7 ');
    errEl.style.display = 'block';
  } else {
    errEl.style.display = 'none';
  }

  if (idStr.length % 2 === 0 && valStr.length % 2 === 0) {
    const idBytes  = idStr.length  > 0 ? idStr.length  / 2 : 0;
    const valBytes = valStr.length > 0 ? valStr.length / 2 : 0;
    if (idBytes === 0 && valBytes === 0) { dlcEl.value = '4'; return; }
    dlcEl.value = idBytes + valBytes + 1;
  }
}

function refreshPreviews() {
  const alfie = getAlfie();
  document.getElementById('alfieBadge').textContent = 'Alfie ' + alfie;

  const all = Object.keys(CMD_MAP);
  all.forEach(key => {
    const el = document.getElementById('prev-' + key);
    if (!el) return;
    const d = getInput(key);
    const fn = CMD_MAP[key];
    let preview = '';
    if (key === 'readParam') {
      const dlc = (document.getElementById('in-dlc') ? document.getElementById('in-dlc').value.trim() : '2') || '2';
      preview = fn ? fn(alfie, d || '?', dlc) : '';
    } else if (key === 'editParam') {
      const id  = (document.getElementById('in-editId')  ? document.getElementById('in-editId').value.trim()  : '?') || '?';
      const val = (document.getElementById('in-editVal') ? document.getElementById('in-editVal').value.trim() : '?') || '?';
      const dlc = (document.getElementById('in-editDlc') ? document.getElementById('in-editDlc').value.trim() : '4') || '4';
      preview = fn ? fn(alfie, id, val, dlc) : '';
    } else {
      preview = fn ? fn(alfie, d || '?') : '';
    }
    el.textContent = preview + '  [+' + eolLabel() + ']';
  });
}

// ── Timestamp ──
async function toggleTimestamp() {
  const turningOff = (tsState === 'on');
  const cmds = turningOff ? ['C','Z0','O'] : ['C','Z1','O'];
  for (const c of cmds) {
    await sendCmd(c);
    await delay(150);
  }
  tsState = turningOff ? 'off' : 'on';
  updateTsBtn();
  addLog('OK', `Timestamp turned ${tsState.toUpperCase()}`);
}

function updateTsBtn() {
  const btn = document.getElementById('tsBtn');
  btn.textContent = `\u23f1 Timestamp: ${tsState.toUpperCase()}`;
  btn.className = tsState === 'on' ? 'tb-btn ts-on' : 'tb-btn ts-off';
}

// ── Port ──
let readerLoopActive = false;

async function openPort() {
  if (!HAS_API) { addLog('ERR', 'Web Serial API unavailable \u2014 use Chrome, Edge, or Firefox 151+ on HTTPS or localhost.'); return; }
  try {
    addLog('INFO', 'Requesting port from browser\u2026');
    port = await navigator.serial.requestPort();
    const baud = parseInt(document.getElementById('baudSelect').value);
    await port.open({ baudRate: baud });
    const info = port.getInfo();
    writer = port.writable.getWriter();
    addLog('OK', `Port opened \u2014 VID:0x${hex(info.usbVendorId)} PID:0x${hex(info.usbProductId)} @ ${baud} baud`);
    setConnected(true);
    startReader();
  } catch(e) {
    addLog('ERR', 'Failed to open port: ' + e.message);
    port = null; writer = null;
  }
}

// Keep a reference to the active reader so closePort can cancel it directly.
let activeReader = null;
let readerDone = Promise.resolve();

function startReader() {
  readerDone = (async () => {
    readerLoopActive = true;
    let lineBuffer = '';
    let flushTimer = null;
    const pendingLines = [];

    function splitOnT(str) {
      return str.split(/(?=[Tt])/).map(s => s.trim()).filter(s => s.length > 0);
    }

    function scheduleFlush() {
      if (flushTimer) clearTimeout(flushTimer);
      flushTimer = setTimeout(() => {
        if (lineBuffer.trim()) {
          splitOnT(lineBuffer.trim()).forEach(seg => pendingLines.push(seg));
          lineBuffer = '';
        }
        if (pendingLines.length) {
          pendingLines.forEach(l => {
            addLog('RX', l);
            if (rxCallback) rxCallback(l);
          });
          pendingLines.length = 0;
        }
        flushTimer = null;
      }, 100);
    }

    try {
      while (port && port.readable && readerLoopActive) {
        activeReader = port.readable.getReader();
        try {
          while (true) {
            const { value, done } = await activeReader.read();
            if (done) break;
            if (!value) continue;
            const chunk = new TextDecoder().decode(value);
            for (const ch of chunk) {
              if (ch === '\r') continue;
              if (ch === '\n') {
                if (lineBuffer.trim()) {
                  splitOnT(lineBuffer.trim()).forEach(seg => pendingLines.push(seg));
                }
                lineBuffer = '';
              } else {
                lineBuffer += ch;
              }
            }
            scheduleFlush();
          }
        } catch (err) {
          if (readerLoopActive && err.name !== 'AbortError') {
            addLog('ERR', 'Read error: ' + err.message);
          }
        } finally {
          try { activeReader.releaseLock(); } catch(_) {}
          activeReader = null;
        }
      }
    } catch(e) {
      if (readerLoopActive) addLog('ERR', 'Reader loop error: ' + e.message);
    }
    readerLoopActive = false;
  })();
}

// ── Color loop state ──
let colorLoopRunning = false;
let colorLoopStop    = false;
// rxCallback: set by color loop to intercept incoming RX lines
let rxCallback = null;

const COLOR_HEX = {
  red:   'FF000000',
  green: '00FF0000',
  blue:  '000FF000',
};

const CABINET_COLOR = {
  red:   'FF0000',
  green: '00FF00',
  blue:  '0000FF',
};

function getColorMode() {
  return document.getElementById('colorModeSelect').value;
}

async function handleColorCmd(color) {
  if (getColorMode() === 'cabinet') {
    await fireCabinetColor(color);
  } else {
    await startColorLoop(color);
  }
}

async function fireCabinetColor(color) {
  if (!port || !writer) {
    addLog('WARN', 'Connect a COM port before running color commands.');
    return;
  }
  const alfie = getAlfie();
  const rgb = CABINET_COLOR[color];
  const cmd = `t${alfie}F74CFFFFFE${rgb}`;
  setColorBtnActive(color);
  await sendCmd(cmd);
  const colorName = color.charAt(0).toUpperCase() + color.slice(1);
  addLog('OK', `Cabinet Test \u2192 All latches (1\u201317) \u2192 ${colorName}`);
  setTimeout(() => setColorBtnActive(null), 600);
}

// ── Quick commands (mode buttons) ──
const QUICK_CMD_MAP = {
  oldRgb:     a => `t${a}F5571601FFFF`,
  waterfall:  a => `t${a}F55716010300`,
  standalone: a => `t${a}F4571D0000`,
  rgbw:       a => `t${a}F4571D0100`,
  rgb:        a => `t${a}F4571D0200`,
  rgbWon:     a => `t${a}F4571D0300`,
};

const QUICK_CMD_LABELS = {
  oldRgb:     'OLD RGB Mode',
  waterfall:  'Waterfall Mode',
  standalone: 'STANDALONE',
  rgbw:       'RGBW',
  rgb:        'RGB',
  rgbWon:     'RGB & W ON',
};

async function fireQuickCmd(key) {
  const alfie = getAlfie();
  const fn = QUICK_CMD_MAP[key];
  if (!fn) return;
  const cmd = fn(alfie);
  await sendCmd(cmd);
  addLog('OK', `${QUICK_CMD_LABELS[key]} sent`);
}

function decToHex2(n) {
  return n.toString(16).padStart(2, '0').toUpperCase();
}

function getStopSignal() {
  const a = getAlfie();
  return `t${a}F366726D`.toLowerCase();
}

function setColorStatus(msg, color) {
  const el = document.getElementById('color-status');
  if (!el) return;
  if (!msg) { el.style.display = 'none'; return; }
  el.style.display = 'block';
  el.style.color = color || 'var(--text-muted)';
  el.textContent = msg;
}

function setColorBtnActive(color) {
  ['red','green','blue'].forEach(c => {
    const b = document.getElementById('btn-' + c);
    if (b) b.classList.toggle('active', c === color);
  });
}

async function startColorLoop(color) {
  if (!port || !writer) {
    addLog('WARN', 'Connect a COM port before running color commands.');
    return;
  }
  if (colorLoopRunning) {
    colorLoopStop = true;
    return;
  }

  colorLoopRunning = true;
  colorLoopStop    = false;
  setColorBtnActive(color);
  const alfie    = getAlfie();
  const colorVal = COLOR_HEX[color];
  const stopSig  = getStopSignal();
  addLog('INFO', `Starting ${color.toUpperCase()} color loop for up to 16 latches\u2026`);

  for (let latch = 1; latch <= 16; latch++) {
    if (colorLoopStop) {
      addLog('INFO', `Color loop stopped early at latch ${latch}.`);
      break;
    }

    const latchHex = decToHex2(latch);
    const cmd = `t${alfie}F7576D${latchHex}${colorVal}`;
    setColorStatus(`Sending latch ${latch}/16 (${latchHex})\u2026`, 'var(--amber)');

    await sendCmd(cmd);

    const stopped = await waitForStopSignal(stopSig, 800);
    if (stopped) {
      addLog('OK', `Stop signal received at latch ${latch} \u2014 color loop complete.`);
      colorLoopStop = true;
      break;
    }
  }

  colorLoopRunning = false;
  colorLoopStop    = false;
  rxCallback       = null;
  setColorBtnActive(null);
  setColorStatus('', null);
}

// Returns a promise that resolves true if stopSignal is seen within timeoutMs, else false.
function waitForStopSignal(stopSig, timeoutMs) {
  return new Promise(resolve => {
    let resolved = false;

    const timer = setTimeout(() => {
      if (!resolved) { resolved = true; rxCallback = null; resolve(false); }
    }, timeoutMs);

    rxCallback = (line) => {
      if (line.toLowerCase().includes(stopSig.toLowerCase())) {
        if (!resolved) {
          resolved = true;
          clearTimeout(timer);
          rxCallback = null;
          resolve(true);
        }
      }
    };
  });
}

async function closePort() {
  readerLoopActive = false;

  if (activeReader) {
    try { await activeReader.cancel(); } catch(_) {}
  }

  await readerDone;

  try {
    if (writer) {
      try { writer.releaseLock(); } catch(_) {}
      writer = null;
    }
    if (port) {
      try { await port.close(); } catch(e) {
        addLog('ERR', 'Error closing port: ' + e.message);
      }
      port = null;
    }
    addLog('INFO', 'Port closed.');
  } catch(e) {
    addLog('ERR', 'Disconnect error: ' + e.message);
  }

  setConnected(false);
}

function setConnected(open) {
  document.getElementById('connectBtn').style.display    = open ? 'none' : '';
  document.getElementById('disconnectBtn').style.display = open ? '' : 'none';
  document.getElementById('statusDot').className = 'status-dot' + (open ? ' open' : '');
}

// ── Log ──
function addLog(type, msg) {
  const wrap = document.getElementById('logWrap');
  const t = type.toUpperCase();

  let lastRow = null;
  for (let i = wrap.children.length - 1; i >= 0; i--) {
    if (wrap.children[i].dataset.type) { lastRow = wrap.children[i]; break; }
  }
  const lastType = lastRow ? lastRow.dataset.type : null;

  const needsDivider =
    (t === 'CMD' && lastType !== null) ||
    (t === 'RX'  && lastType !== 'RX') ||
    (t !== 'RX'  && t !== 'CMD' && lastType === 'RX');

  if (needsDivider) {
    const div = document.createElement('div');
    div.className = 'log-divider';
    wrap.appendChild(div);
  }

  const row = document.createElement('div');
  row.className = 'log-row';
  row.dataset.type = t;
  row.innerHTML = `
    <span class="log-ts">${nowStr()}</span>
    <span class="log-type ${t}">${t}</span>
    <span class="log-msg ${t.toLowerCase()}-msg">${esc(msg)}</span>
  `;
  wrap.appendChild(row);
  wrap.scrollTop = wrap.scrollHeight;
}

function clearLog() {
  document.getElementById('logWrap').innerHTML = '';
  addLog('INFO', 'Log cleared.');
}

function downloadLog() {
  const rows = [...document.querySelectorAll('#logWrap .log-row')];
  const text = rows.map(r => [...r.querySelectorAll('span')].map(s => s.textContent).join('  ')).join('\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type: 'text/plain' }));
  a.download = `alfie-log-${Date.now()}.txt`;
  a.click();
}

// ── Helpers ──
function hex(v)   { return (v||0).toString(16).padStart(4,'0').toUpperCase(); }

function decToHex(d) {
  const n = parseInt(d, 10);
  if (isNaN(n)) return d;
  return n.toString(16).padStart(2, '0').toUpperCase();
}

function nowStr() {
  const d = new Date();
  const date = d.toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' });
  const time = d.toLocaleTimeString('en-GB', { hour12: false });
  return date + '  ' + time;
}

function esc(s) { return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
function delay(ms) { return new Promise(r => setTimeout(r, ms)); }

// ── Theme toggle ──
function toggleTheme() {
  const html = document.documentElement;
  const isDark = html.getAttribute('data-theme') === 'dark';
  const newTheme = isDark ? 'light' : 'dark';
  html.setAttribute('data-theme', newTheme);
  updateThemeBtn(newTheme);
  try { localStorage.setItem('alfie-theme', newTheme); } catch(_) {}
}

function updateThemeBtn(theme) {
  const btn = document.getElementById('themeBtn');
  if (btn) btn.innerHTML = theme === 'dark'
    ? '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3a7 7 0 0 0 9.79 9.79z"/></svg>'
    : '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>';
  const logo = document.getElementById('headerLogo');
  if (logo) logo.src = theme === 'dark' ? 'images/signifi-logo-white.png' : 'images/signifi-logo.png';
}

function applyStoredTheme() {
  let theme = 'light';
  try { theme = localStorage.getItem('alfie-theme') || 'light'; } catch(_) {}
  if (theme === 'dark') document.documentElement.setAttribute('data-theme', 'dark');
  updateThemeBtn(theme);
}
applyStoredTheme();

// ── Init ──
window.addEventListener('DOMContentLoaded', () => {
  const badge = document.getElementById('apiBadge');
  if (!HAS_API) {
    badge.textContent = 'API unavailable';
    badge.style.borderColor = '#D4980A';
    badge.style.color = 'var(--amber)';
    document.getElementById('apiWarn').style.display = 'block';
  } else {
    badge.textContent = 'API ready';
    badge.style.borderColor = 'var(--green)';
    badge.style.color = 'var(--green)';
  }
  updateTsBtn();
  autoUpdateDLC();
  autoUpdateEditDLC();
  refreshPreviews();
  addLog('INFO', 'Ready \u2014 open a COM port to begin.');
});

// ── Customized Command ──
async function fireCustomCmd() {
  const el = document.getElementById('customCmd');
  const raw = el.value;
  if (!raw.trim()) {
    el.style.borderColor = 'var(--red)';
    setTimeout(() => el.style.borderColor = '', 1200);
    addLog('WARN', 'Custom command is empty.');
    return;
  }
  await sendCmd(raw.trim());
}

// ── Unified Command (Color Change) ──
function decodeUnifiedCmd(raw) {
  const s = raw.trim();
  if (s.length < 19) return null;
  // t{AA}F4C7{B1}{B2}{B3}{RR}{GG}{BB}
  const b1  = parseInt(s.substring(7, 9), 16);
  const b2  = parseInt(s.substring(9, 11), 16);
  const b3  = parseInt(s.substring(11, 13), 16);
  const rHex = s.substring(13, 15).toUpperCase();
  const gHex = s.substring(15, 17).toUpperCase();
  const bHex = s.substring(17, 19).toUpperCase();
  if (isNaN(b1) || isNaN(b2) || isNaN(b3)) return null;

  const affected = [];
  for (let i = 0; i < 8; i++) { if (b1 & (1 << i)) affected.push(i + 1); }
  for (let i = 0; i < 8; i++) { if (b2 & (1 << i)) affected.push(i + 9); }
  if (b3 & 1) affected.push(17);

  const r = parseInt(rHex, 16), g = parseInt(gHex, 16), b = parseInt(bHex, 16);
  let colorName = `RGB(${r},${g},${b})`;
  let colorCSS  = `rgb(${r},${g},${b})`;
  if (r > 200 && g < 50 && b < 50)  colorName = 'Red';
  else if (r < 50 && g > 200 && b < 50)  colorName = 'Green';
  else if (r < 50 && g < 50 && b > 200)  colorName = 'Blue';
  else if (r > 200 && g > 200 && b < 50) colorName = 'Yellow';
  else if (r > 200 && g < 50 && b > 200) colorName = 'Magenta';
  else if (r < 50 && g > 200 && b > 200) colorName = 'Cyan';
  else if (r > 200 && g > 200 && b > 200) colorName = 'White';
  else if (r === 0 && g === 0 && b === 0) colorName = 'Off (Black)';

  return { affected, rHex, gHex, bHex, colorName, colorCSS };
}

function decodeUnifiedPreview() {
  const el = document.getElementById('unifiedCmd');
  const box = document.getElementById('unified-decode');
  const raw = el.value.trim();
  if (raw.length < 19) { box.style.display = 'none'; return; }
  const info = decodeUnifiedCmd(raw);
  if (!info || info.affected.length === 0) {
    box.style.display = 'block';
    box.innerHTML = '<span style="color:var(--text-dim);">No latches affected (all bits = 0)</span>';
    return;
  }
  const latchList = info.affected.map(n => `<b>${n}</b>`).join(', ');
  const swatch = `<span style="display:inline-block;width:12px;height:12px;border-radius:3px;background:${info.colorCSS};border:1px solid var(--border-md);vertical-align:middle;margin:0 3px;"></span>`;
  box.style.display = 'block';
  box.innerHTML =
    `<span style="color:var(--text-muted);">Latch(es):</span> ${latchList}<br>` +
    `<span style="color:var(--text-muted);">Color:</span> ${swatch} <b>${esc(info.colorName)}</b> <span style="color:var(--text-dim);">(R:${info.rHex} G:${info.gHex} B:${info.bHex})</span>`;
}

async function fireUnifiedCmd() {
  const el = document.getElementById('unifiedCmd');
  const raw = el.value.trim();
  if (!raw) {
    el.style.borderColor = 'var(--red)';
    setTimeout(() => el.style.borderColor = '', 1200);
    addLog('WARN', 'Unified command is empty.');
    return;
  }
  await sendCmd(raw);
  const info = decodeUnifiedCmd(raw);
  if (info && info.affected.length > 0) {
    const latchStr = info.affected.join(', ');
    addLog('OK', `Latch ${latchStr} \u2192 ${info.colorName} (R:${info.rHex} G:${info.gHex} B:${info.bHex})`);
  } else if (info && info.affected.length === 0) {
    addLog('INFO', 'No latches affected (all bits = 0).');
  }
}

// ── Keyboard shortcuts ──
document.addEventListener('DOMContentLoaded', () => {
  // Custom command: Enter to send
  document.getElementById('customCmd').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); fireCustomCmd(); }
  });

  // Unified command: Enter to send
  document.getElementById('unifiedCmd').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); fireUnifiedCmd(); }
  });

  // Open Door: Enter on door input
  document.getElementById('in-openDoor').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); fireCmd('openDoor'); }
  });

  // Door Status: Enter on door input
  document.getElementById('in-statusDoor').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); fireCmd('statusDoor'); }
  });

  // Read Parameter: Enter on either DLC or ID input fires the read
  document.getElementById('in-dlc').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); fireCmd('readParam'); }
  });
  document.getElementById('in-readParam').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); fireCmd('readParam'); }
  });

  // Edit Parameter: Enter on any field fires the command
  document.getElementById('in-editVal').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); fireCmd('editParam'); }
  });
  document.getElementById('in-editId').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); fireCmd('editParam'); }
  });
  document.getElementById('in-editDlc').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); fireCmd('editParam'); }
  });

  // Ctrl+L / Cmd+L: clear log
  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'l') {
      e.preventDefault();
      clearLog();
    }
  });
});