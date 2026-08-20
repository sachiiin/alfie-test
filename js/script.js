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
  resetAllParam: a => `t${a}F150`,
};

// UBEI commands: different protocol from Alfie, uses t{No.}A instead of t{No.}F
const UBEI_CMD_MAP = {
  reset:           _a => `t00A17C`,
  allDeviceStatus: _a => `t00A153`,
  deviceStatus:    (a) => `t${a}A153`,
  portStatus:      (a, p) => `t${a}A250${p}`,
  powerSources:    (val) => `t${val}A156`,
  autoAddress:     _a => `t00A24101`,
  readParam:       (a, d, dlc) => `t${a}A${dlc}52${d}`,
  editParam:       (a, id, val, dlc) => `t${a}A${dlc}57${id}${val}`,
  bootloader:      _a => `t00A123`,
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

// ── UBEI command firing ──
function numToHex2(val) {
  const n = parseInt(val, 10);
  if (isNaN(n) || n < 0) return '00';
  return n.toString(16).padStart(2, '0');
}

async function fireUbeiCmd(key) {
  if (key === 'readParam') {
    const idEl = document.getElementById('in-u-readParam');
    const idStr = idEl ? idEl.value.trim() : '';
    if (!idStr) { addLog('WARN', 'Read Register: ID is required.'); return; }
    if (idStr.length % 2 !== 0) { addLog('WARN', 'Read Register: ID must be even hex chars.'); return; }
  }
  if (key === 'editParam') {
    const idEl = document.getElementById('in-u-editId');
    const valEl = document.getElementById('in-u-editVal');
    if (!idEl || !idEl.value.trim()) { addLog('WARN', 'Write Register: ID is required.'); return; }
    if (idEl.value.trim().length % 2 !== 0) { addLog('WARN', 'Write Register: ID must be even hex chars.'); return; }
    if (!valEl || !valEl.value.trim()) { addLog('WARN', 'Write Register: VALUE is required.'); return; }
    if (valEl.value.trim().length % 2 !== 0) { addLog('WARN', 'Write Register: VALUE must be even hex chars.'); return; }
  }
  const cmd = buildUbeiCmd(key);
  await sendCmd(cmd);
}

function getUbeiAddr() {
  const el = document.getElementById('ubeiInput');
  const num = parseInt(el ? el.value : '1', 10);
  if (isNaN(num) || num < 0) return '00';
  return num.toString(16).padStart(2, '0');
}

function buildUbeiCmd(key) {
  const a = getUbeiAddr();
  if (key === 'allDeviceStatus') return UBEI_CMD_MAP.allDeviceStatus(a);
  if (key === 'deviceStatus') {
    const v = document.getElementById('in-u-deviceStatus').value;
    return UBEI_CMD_MAP.deviceStatus(numToHex2(v));
  }
  if (key === 'portStatus') {
    const p = document.getElementById('in-u-portStatus').value;
    return UBEI_CMD_MAP.portStatus(a, numToHex2(p));
  }
  if (key === 'powerSources') {
    const v = document.getElementById('in-u-powerSources').value;
    return UBEI_CMD_MAP.powerSources(numToHex2(v));
  }
  if (key === 'readParam') {
    const d   = document.getElementById('in-u-readParam').value.trim();
    const dlc = document.getElementById('in-u-dlc').value.trim();
    return UBEI_CMD_MAP.readParam(a, d, dlc);
  }
  if (key === 'editParam') {
    const id  = document.getElementById('in-u-editId').value.trim();
    const val = document.getElementById('in-u-editVal').value.trim();
    const dlc = document.getElementById('in-u-editDlc').value.trim();
    return UBEI_CMD_MAP.editParam(a, id, val, dlc);
  }
  return UBEI_CMD_MAP[key](a);
}

function autoUpdateUbeiDLC() {
  const idEl  = document.getElementById('in-u-readParam');
  const dlcEl = document.getElementById('in-u-dlc');
  if (!idEl || !dlcEl) return;
  const idStr = idEl.value.trim().replace(/\s+/g, '');
  if (idStr.length === 0) { dlcEl.value = '2'; return; }
  dlcEl.value = String((idStr.length / 2) + 1);
}

function autoUpdateUbeiEditDLC() {
  const idEl  = document.getElementById('in-u-editId');
  const valEl = document.getElementById('in-u-editVal');
  const dlcEl = document.getElementById('in-u-editDlc');
  if (!idEl || !valEl || !dlcEl) return;
  const idLen  = idEl.value.trim().replace(/\s+/g, '').length;
  const valLen = valEl.value.trim().replace(/\s+/g, '').length;
  dlcEl.value = String((idLen + valLen) / 2 + 1);
}

function validateUbeiHex() {
  const el  = document.getElementById('in-u-readParam');
  const err = document.getElementById('u-dlc-err');
  if (!el || !err) return;
  const v = el.value.trim().replace(/\s+/g, '');
  err.style.display = (v.length > 0 && v.length % 2 !== 0) ? 'block' : 'none';
}

function validateUbeiEditHex() {
  const idEl  = document.getElementById('in-u-editId');
  const valEl = document.getElementById('in-u-editVal');
  const err   = document.getElementById('u-edit-err');
  if (!idEl || !valEl || !err) return;
  const idV  = idEl.value.trim().replace(/\s+/g, '');
  const valV = valEl.value.trim().replace(/\s+/g, '');
  const msgs = [];
  if (idV.length > 0 && idV.length % 2 !== 0) msgs.push('⚠ ID must be even hex chars');
  if (valV.length > 0 && valV.length % 2 !== 0) msgs.push('⚠ VALUE must be even hex chars');
  err.innerHTML = msgs.join('<br>');
  err.style.display = msgs.length ? 'block' : 'none';
}

// ── Collapsible section toggle (accordion) ──
function toggleSection(id) {
  const sections = ['alfie', 'ubei'];
  sections.forEach(s => {
    const body  = document.getElementById(s + '-body');
    const arrow = document.getElementById(s + '-arrow');
    if (!body) return;
    if (s === id) {
      body.classList.toggle('collapsed');
    } else {
      body.classList.add('collapsed');
    }
    arrow.textContent = body.classList.contains('collapsed') ? '▶' : '▼';
  });
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

  // UBEI previews
  const ubei = getUbeiAddr();
  const uKeys = Object.keys(UBEI_CMD_MAP);
  uKeys.forEach(key => {
    const el = document.getElementById('prev-u-' + key);
    if (!el) return;
    let preview = '';
    if (key === 'allDeviceStatus') {
      preview = UBEI_CMD_MAP.allDeviceStatus(ubei);
    } else if (key === 'deviceStatus') {
      const v = document.getElementById('in-u-deviceStatus') ? document.getElementById('in-u-deviceStatus').value : '1';
      preview = UBEI_CMD_MAP.deviceStatus(numToHex2(v));
    } else if (key === 'portStatus') {
      const p = document.getElementById('in-u-portStatus') ? document.getElementById('in-u-portStatus').value : '1';
      preview = UBEI_CMD_MAP.portStatus(ubei, numToHex2(p));
    } else if (key === 'powerSources') {
      const v = document.getElementById('in-u-powerSources') ? document.getElementById('in-u-powerSources').value : '0';
      preview = UBEI_CMD_MAP.powerSources(numToHex2(v));
    } else if (key === 'readParam') {
      const d   = (document.getElementById('in-u-readParam') ? document.getElementById('in-u-readParam').value.trim() : '00') || '?';
      const dlc = (document.getElementById('in-u-dlc') ? document.getElementById('in-u-dlc').value.trim() : '2') || '2';
      preview = UBEI_CMD_MAP.readParam(ubei, d, dlc);
    } else if (key === 'editParam') {
      const id  = (document.getElementById('in-u-editId')  ? document.getElementById('in-u-editId').value.trim()  : '?') || '?';
      const val = (document.getElementById('in-u-editVal') ? document.getElementById('in-u-editVal').value.trim() : '?') || '?';
      const dlc = (document.getElementById('in-u-editDlc') ? document.getElementById('in-u-editDlc').value.trim() : '4') || '4';
      preview = UBEI_CMD_MAP.editParam(ubei, id, val, dlc);
    } else {
      preview = UBEI_CMD_MAP[key] ? UBEI_CMD_MAP[key](ubei) : '';
    }
    el.textContent = preview + '  [+' + eolLabel() + ']';
  });
}

// ── Timestamp ──
async function toggleTimestamp() {
  const cmds = ['C','Z0','O'];
  for (const c of cmds) {
    await sendCmd(c);
    await delay(150);
  }
  tsState = 'off';
  updateTsBtn();
  addLog('OK', 'Timestamp turned OFF');
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

// ── Report Frame parsing ──
const REPORT_FRAMES = {
  '73': { label: 'INFO REPORT',    cls: 'rf-info' },
  '77': { label: 'WARNING REPORT', cls: 'rf-warn' },
  '66': { label: 'FAILURE REPORT', cls: 'rf-fail' },
  '72': { label: 'REGISTER REPORT',cls: 'rf-reg'  },
};

// UBEI-specific report frames
const UBEI_REPORT_FRAMES = {
  '69': { label: 'INFO REPORT',     cls: 'rf-info' },
  '72': { label: 'REGISTER REPORT', cls: 'rf-reg'  },
  '77': { label: 'WARNING REPORT',  cls: 'rf-warn' },
  '66': { label: 'FAILURE REPORT',  cls: 'rf-fail' },
  '23': { label: 'BOOTLOADER',      cls: 'rf-warn' },
  '4f': { label: 'ADDR ASSIGNED',   cls: 'rf-info' },
  '62': { label: 'FAILURE REPORT',  cls: 'rf-fail' },
};

// ── UBEI Connection lookup ──
const UBEI_CONN = {
  '00': 'Nothing Connected',
  '01': 'Sink Device Connected',
  '02': 'No Device, Noise CC1',
  '03': 'Device Connected Right-side Up',
  '04': 'No Device, Noise CC2',
  '05': 'Device Connected Upside Down',
  '06': 'No Device, Noise CC1 CC2',
  '07': 'Device No PD Connected',
};

// ── UBEI Port State lookup ──
const UBEI_PORT_STATE = {
  '00': 'Idle No Connection',
  '01': 'Sink Connected',
  '02': 'Charged',
  '03': 'Charging',
  '04': 'Short',
};

// ── 69 UBEI Info Report decoder ──
function decodeUbeiInfoReport(s) {
  if (s.length < 9) return '';
  const addr    = s.substring(1, 3);
  const subCode = s.substring(7, 9).toLowerCase();

  switch (subCode) {
    case '21': {
      // RESET_CAUSE
      const cause = s.length >= 17 ? s.substring(9, 17).toUpperCase() : '';
      if (cause === 'E00003DF') return `UBEI ${addr} Soft Reset`;
      if (cause === 'E0000043') return `UBEI ${addr} Reset Itself`;
      if (cause === 'E00002DF') return `UBEI ${addr} Reset After Bootloader Mode`;
      return `UBEI ${addr} Reset (${cause})`;
    }
    case '70': {
      // PORT_STATUS: {Port}{State}{Conn}{Voltage}{AmpHi}{AmpLo}
      if (s.length < 21) return '';
      const port = parseInt(s.substring(9, 11), 16);
      const stateHex = s.substring(11, 13).toLowerCase();
      const connHex  = s.substring(13, 15).toLowerCase();
      const voltage  = parseInt(s.substring(15, 17), 16);
      const ampHi    = parseInt(s.substring(17, 19), 16);
      const ampLo    = parseInt(s.substring(19, 21), 16);
      if (isNaN(port)) return '';
      const state = UBEI_PORT_STATE[stateHex] || stateHex;
      const conn  = UBEI_CONN[connHex] || connHex;
      const volts = (voltage / 10).toFixed(1);
      const mA    = (ampHi << 8) | ampLo;
      return `UBEI ${addr} Port ${port} ${state}, ${conn}, ${volts}V, ${mA}mA`;
    }
    case '73': {
      // DEVICE_STATUS: {State}{Layout}
      if (s.length < 13) return '';
      const stateHex  = s.substring(9, 11).toLowerCase();
      const layoutHex = parseInt(s.substring(11, 13), 16);
      let status = 'No Problems';
      if (stateHex === '01') status = 'Warnings';
      else if (stateHex === '02') status = 'Failures';
      // Decode port layout bitmap (lower 4 bits)
      const ports = [];
      if (layoutHex & 1) ports.push('1');
      if (layoutHex & 2) ports.push('2');
      if (layoutHex & 4) ports.push('3');
      if (layoutHex & 8) ports.push('4');
      const layout = ports.length ? `Port ${ports.join(', ')} Connected` : 'No Port Connected';
      return `UBEI ${addr} ${status}, ${layout}`;
    }
    case '63': {
      // CONNECTION_STATUS: {Port}{Conn}
      if (s.length < 13) return '';
      const port    = parseInt(s.substring(9, 11), 16);
      const connHex = s.substring(11, 13).toLowerCase();
      if (isNaN(port)) return '';
      const conn = UBEI_CONN[connHex] || connHex;
      return `UBEI ${addr} Port ${port} ${conn}`;
    }
    case '56': {
      // POWER_SUPPLY_STATUS: {USB}{RJ45}
      if (s.length < 13) return '';
      const usb  = s.substring(9, 11) === '01';
      const rj45 = s.substring(11, 13) === '01';
      let src = 'No Power';
      if (usb && rj45) src = 'Both [USB, RJ45]';
      else if (usb)    src = 'USB Only';
      else if (rj45)   src = 'RJ45 Only';
      return `UBEI ${addr} Power Source: ${src}`;
    }
    default:
      return '';
  }
}

// ── UBEI Register Report decoder (big-endian, no byte swap) ──
function decodeUbeiRegReport(s) {
  if (s.length < 9) return '';
  const regId = s.substring(7, 9).toLowerCase();
  const valueHex = s.length > 9 ? s.substring(9) : '';

  if (regId === '73') {
    // Serial Number: 4 bytes big-endian
    return `Serial Number: ${valueHex.toUpperCase()}`;
  }
  if (regId === '00') {
    // Firmware Version: Major Minor BuildHi BuildLo (big-endian)
    if (valueHex.length < 8) return `Firmware Version: ${valueHex.toUpperCase()}`;
    const major = parseInt(valueHex.substring(0, 2), 16);
    const minor = parseInt(valueHex.substring(2, 4), 16);
    const build = parseInt(valueHex.substring(4, 8), 16);
    return `Firmware Version: ${major}.${minor}.${build}`;
  }
  // Generic register: 2 bytes big-endian
  if (valueHex.length >= 4) {
    const regIdDec = parseInt(regId, 16);
    const val = parseInt(valueHex.substring(0, 4), 16);
    return `Register ${regIdDec} (0x${regId.toUpperCase()}): ${val}`;
  }
  return `Register 0x${regId.toUpperCase()}: ${valueHex.toUpperCase()}`;
}

// ── Register ID Map ──
const REGISTER_MAP = {
  '00': { name: 'Power On Delay',                     unit: 'ms' },
  '01': { name: 'Short-circuit Fault Limit',           unit: 'num' },
  '02': { name: 'Group ID',                            unit: 'num' },
  '03': { name: 'CAN Bit Rate',                        unit: 'num' },
  '04': { name: 'ARGBW LED Strip Bit Rate',            unit: 'num' },
  '05': { name: 'Current Sensor Sensitivity',          unit: 'mvpa' },
  '06': { name: 'Current Sensor Baseline',             unit: 'mv' },
  '07': { name: 'Sensor Voltage Multiplier',           unit: 'num' },
  '08': { name: 'Sensor Voltage Divisor',              unit: 'num' },
  '09': { name: 'Voltage Under Limit',                 unit: 'mv' },
  '0a': { name: 'Voltage Over Limit',                  unit: 'mv' },
  '0b': { name: 'Voltage Monitor Alert Enabled',       unit: 'bool' },
  '0c': { name: 'Latch Pulse Duration',                unit: 'ms' },
  '0d': { name: 'Latch Over-Load Current Limit',       unit: 'ma' },
  '0e': { name: 'Latch Current Test Time',             unit: 'ms' },
  '0f': { name: 'Latch Open-Circuit Current Limit',    unit: 'ma' },
  '10': { name: 'Latch Feedback Debounce Period',      unit: 'ms' },
  '11': { name: 'Total Active Latches',                unit: 'latches' },
  '12': { name: 'Active Latches Map Array',            unit: 'bitmap' },
  '13': { name: 'Latch Feedback Check Delay',          unit: 'ms' },
  '14': { name: 'Latch Feedback Check Period',         unit: 'ms' },
  '15': { name: 'Latch Monitors Map Array',            unit: 'bitmap' },
  '16': { name: 'Latch PCB Module Map Array',          unit: 'bitmap' },
  '17': { name: 'Latch Striker Check Period',          unit: 'ms' },
  '18': { name: 'Latch Tamper Check Period',           unit: 'ms' },
  '19': { name: 'Current Limit Switch Retries Limit',  unit: 'num' },
  '1a': { name: 'Current Limit Switch Check Period',   unit: 'ms' },
  '1b': { name: 'Current Limit Switch Retry Off Time', unit: 'ms' },
  '1c': { name: 'Current Limit Switch Retry On Delay', unit: 'ms' },
  '1d': { name: 'LED Strip Mode',                      unit: 'ledmode' },
  '1e': { name: 'Latch Self Detect Delay',             unit: 'ms' },
  '23': { name: 'Serial Number',                       unit: 'serial' },
  '41': { name: 'Instant Voltage',                     unit: 'mv' },
  '42': { name: 'Average Voltage',                     unit: 'mv' },
  '43': { name: 'Peak Voltage',                        unit: 'mv' },
  '56': { name: 'Bootloader Version',                  unit: 'version' },
  '61': { name: 'Total Instant Current',               unit: 'ma' },
  '62': { name: 'Total Average Current',               unit: 'ma' },
  '63': { name: 'Total Peak Current',                  unit: 'ma' },
  '64': { name: 'Latch Last Current',                  unit: 'pos_ma' },
  '65': { name: 'Latch Peak Current',                  unit: 'pos_ma' },
  '66': { name: 'Latch Average Current',               unit: 'pos_ma' },
  '6d': { name: 'RGBW LED',                            unit: 'pos_rgb' },
  '6c': { name: 'ARGBW LED Strip Count',               unit: 'num' },
  '6e': { name: 'Run Time',                            unit: 'sec' },
  '76': { name: 'Firmware Version',                    unit: 'version' },
  // ── Multi-byte Register IDs ──
  '1601': { name: 'RGB LED Mode',                      unit: 'rgbledmode' },
};

function getRegName(id) {
  const key = id.toLowerCase();
  return REGISTER_MAP[key] ? REGISTER_MAP[key].name : null;
}

// Look up register: try 4-char ID first, then 2-char
function lookupRegister(dataHex) {
  const try4 = dataHex.substring(0, 4).toLowerCase();
  if (REGISTER_MAP[try4]) return { reg: REGISTER_MAP[try4], idLen: 4 };
  const try2 = dataHex.substring(0, 2).toLowerCase();
  if (REGISTER_MAP[try2]) return { reg: REGISTER_MAP[try2], idLen: 2 };
  return null;
}

// Reverse bytes of a hex string (little-endian → big-endian)
function swapBytesHex(hex) {
  const bytes = [];
  for (let i = 0; i < hex.length; i += 2) bytes.push(hex.substring(i, i + 2));
  return bytes.reverse().join('');
}

// Format seconds into human-readable
function formatRunTime(totalSec) {
  if (totalSec < 60) return `${totalSec}s`;
  const d = Math.floor(totalSec / 86400);
  const h = Math.floor((totalSec % 86400) / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  const parts = [];
  if (d) parts.push(`${d}d`);
  if (h) parts.push(`${h}h`);
  if (m) parts.push(`${m}m`);
  if (s || parts.length === 0) parts.push(`${s}s`);
  return parts.join(' ');
}

// Detect color name from RGB values
function rgbToColorName(r, g, b) {
  if (r === 0 && g === 0 && b === 0) return 'Off (Black)';
  if (r > 200 && g > 200 && b > 200) return 'White';
  if (r > 200 && g < 50 && b < 50)   return 'Red';
  if (r < 50 && g > 200 && b < 50)   return 'Green';
  if (r < 50 && g < 50 && b > 200)   return 'Blue';
  if (r > 200 && g > 200 && b < 50)  return 'Yellow';
  if (r > 200 && g < 50 && b > 200)  return 'Magenta';
  if (r < 50 && g > 200 && b > 200)  return 'Cyan';
  if (r > 200 && g > 100 && g < 200 && b < 50) return 'Orange';
  return `RGB(${r}, ${g}, ${b})`;
}

// Decode a register value based on unit type
function decodeRegValue(unit, valueHex) {
  switch (unit) {
    case 'mv': {
      const raw = parseInt(swapBytesHex(valueHex.substring(0, 4)), 16);
      if (isNaN(raw)) return valueHex.toUpperCase();
      return `${raw}mV`;
    }
    case 'ma': {
      const raw = parseInt(swapBytesHex(valueHex.substring(0, 4)), 16);
      if (isNaN(raw)) return valueHex.toUpperCase();
      return `${raw}mA`;
    }
    case 'mvpa': {
      const raw = parseInt(swapBytesHex(valueHex.substring(0, 4)), 16);
      if (isNaN(raw)) return valueHex.toUpperCase();
      return `${raw} mV/A`;
    }
    case 'ms': {
      const raw = parseInt(swapBytesHex(valueHex.substring(0, 4)), 16);
      if (isNaN(raw)) return valueHex.toUpperCase();
      return `${raw}ms`;
    }
    case 'sec': {
      const raw = parseInt(swapBytesHex(valueHex.substring(0, 8)), 16);
      if (isNaN(raw)) return valueHex.toUpperCase();
      return `${formatRunTime(raw)} (${raw}s)`;
    }
    case 'num': {
      const raw = parseInt(swapBytesHex(valueHex.substring(0, 4)), 16);
      if (isNaN(raw)) return valueHex.toUpperCase();
      return `${raw}`;
    }
    case 'latches': {
      const rawHex = valueHex.substring(0, 4).toUpperCase();
      if (rawHex === 'FFFF') return 'Standard Mode (All Active)';
      const raw = parseInt(swapBytesHex(rawHex), 16);
      if (isNaN(raw)) return rawHex;
      return `${raw}`;
    }
    case 'bool': {
      const raw = parseInt(swapBytesHex(valueHex.substring(0, 4)), 16);
      return raw ? 'Enabled' : 'Disabled';
    }
    case 'ledmode': {
      const raw = parseInt(swapBytesHex(valueHex.substring(0, 4)), 16);
      const modes = { 0: 'Standalone', 1: 'RGBW', 2: 'RGB', 3: 'RGB & W always ON' };
      return modes[raw] !== undefined ? modes[raw] : `Unknown (${raw})`;
    }
    case 'rgbledmode': {
      const raw = valueHex.substring(0, 4).toUpperCase();
      if (raw === 'FFFF') return 'Single RGB LED Mode';
      if (raw === '0300') return 'Waterfall LED Mode';
      return `Unknown (${raw})`;
    }
    case 'version': {
      // Byte 0: Major, Byte 1: Minor, Bytes 2-3: Build (little-endian)
      if (valueHex.length < 8) return valueHex.toUpperCase();
      const major = parseInt(valueHex.substring(0, 2), 16);
      const minor = parseInt(valueHex.substring(2, 4), 16);
      const build = parseInt(swapHex16(valueHex.substring(4, 8)), 16);
      if (isNaN(major) || isNaN(minor) || isNaN(build)) return valueHex.toUpperCase();
      return `${major}.${minor}.${build}`;
    }
    case 'serial': {
      if (valueHex.length < 8) return valueHex.toUpperCase();
      return swapBytesHex(valueHex.substring(0, 8)).toUpperCase();
    }
    case 'bitmap': {
      // 3-byte bitmap: latches 1-8, 9-16, 17
      if (valueHex.length < 6) return valueHex.toUpperCase();
      const b1 = parseInt(valueHex.substring(0, 2), 16);
      const b2 = parseInt(valueHex.substring(2, 4), 16);
      const b3 = parseInt(valueHex.substring(4, 6), 16);
      if (isNaN(b1) || isNaN(b2) || isNaN(b3)) return valueHex.toUpperCase();
      const active = [];
      for (let i = 0; i < 8; i++) { if (b1 & (1 << i)) active.push(i + 1); }
      for (let i = 0; i < 8; i++) { if (b2 & (1 << i)) active.push(i + 9); }
      if (b3 & 1) active.push(17);
      return active.length ? `Latches: ${active.join(', ')}` : 'None';
    }
    case 'pos_ma': {
      // Position (2 hex) + Current (4 hex LE)
      if (valueHex.length < 6) return valueHex.toUpperCase();
      const pos = parseInt(valueHex.substring(0, 2), 16);
      const mA = parseInt(swapBytesHex(valueHex.substring(2, 6)), 16);
      if (isNaN(pos) || isNaN(mA)) return valueHex.toUpperCase();
      return `Latch ${pos}: ${mA}mA`;
    }
    case 'pos_rgb': {
      // Position (2 hex) + R (2 hex) + G (2 hex) + B (2 hex)
      if (valueHex.length < 8) return valueHex.toUpperCase();
      const pos = parseInt(valueHex.substring(0, 2), 16);
      const r = parseInt(valueHex.substring(2, 4), 16);
      const g = parseInt(valueHex.substring(4, 6), 16);
      const b = parseInt(valueHex.substring(6, 8), 16);
      if (isNaN(pos) || isNaN(r) || isNaN(g) || isNaN(b)) return valueHex.toUpperCase();
      const colorName = rgbToColorName(r, g, b);
      return `Latch ${pos}: ${colorName}`;
    }
    default:
      return valueHex.toUpperCase();
  }
}

// ── 72 Register Report decoder ──
function decodeRegReport(s) {
  if (s.length < 9) return '';
  const dataAfterFrame = s.substring(7); // everything after report frame (72)
  const match = lookupRegister(dataAfterFrame);

  if (!match) {
    const regId = s.substring(7, 9).toUpperCase();
    return `Unknown Register (ID: ${regId})`;
  }

  const { reg, idLen } = match;
  const valueHex = dataAfterFrame.length > idLen ? dataAfterFrame.substring(idLen) : '';

  if (!valueHex) return reg.name;

  const decoded = decodeRegValue(reg.unit, valueHex);
  return `${reg.name}: ${decoded}`;
}

// ── 66 UBEI Failure Report decoder ──
function decodeUbeiFailReport(s) {
  if (s.length < 9) return '';
  const addr    = s.substring(1, 3);
  const subCode = s.substring(7, 9).toLowerCase();

  switch (subCode) {
    case '77': {
      // FAIL_PARAMETER_UPDATE: {RegID}{ValueHi}{ValueLo}{Reason}
      if (s.length < 17) return '';
      const regId  = parseInt(s.substring(9, 11), 16);
      const valHi  = parseInt(s.substring(11, 13), 16);
      const valLo  = parseInt(s.substring(13, 15), 16);
      const reason = s.substring(15, 17).toLowerCase();
      const val    = (valHi << 8) | valLo;
      const reasons = {
        '6f': 'Read Only Register',
        '0b': 'Register Out of Bounds',
        '1e': 'Invalid Value for Register ID',
        'ff': 'Flash Write Fail',
      };
      const reasonMsg = reasons[reason] || `Unknown (0x${reason.toUpperCase()})`;
      return `UBEI ${addr} Register ${regId} (Value: ${val}) fails to be written because ${reasonMsg}`;
    }
    case '24':
      return `UBEI ${addr} Frame Received is Unknown`;
    case '6b':
      return `UBEI ${addr} Frame Received is Unknown`;
    case '6c':
      return `UBEI ${addr} Frame Received is Unknown`;
    default:
      return '';
  }
}

function parseReportFrame(line) {
  // Response format: t{AA}{F|A}{D}{FF}{SubCode}{Data...}
  const s = line.trim();
  if (s.length < 7) return null;
  if (s[0].toLowerCase() !== 't') return null;
  const devType = s[3].toUpperCase();
  if (devType !== 'F' && devType !== 'A') return null;
  const frameCode = s.substring(5, 7).toLowerCase();
  const isUbei = devType === 'A';

  // Pick the right frame map
  const rf = isUbei ? UBEI_REPORT_FRAMES[frameCode] : REPORT_FRAMES[frameCode];
  if (!rf) return null;

  let decodedMsg = '';
  if (isUbei) {
    // UBEI decoders
    if (frameCode === '69') {
      decodedMsg = decodeUbeiInfoReport(s);
    } else if (frameCode === '72') {
      decodedMsg = decodeUbeiRegReport(s);
    } else if (frameCode === '77') {
      // No UBEI warning sub-codes defined yet
      decodedMsg = '';
    } else if (frameCode === '66') {
      decodedMsg = decodeUbeiFailReport(s);
    } else if (frameCode === '23') {
      decodedMsg = `UBEI ${s.substring(1, 3)} Entered Bootloader Mode`;
    } else if (frameCode === '4f') {
      const addr = s.substring(1, 3);
      const addrDec = parseInt(addr, 16);
      decodedMsg = `UBEI Assigned Address: 0x${addr.toUpperCase()} (${addrDec})`;
    } else if (frameCode === '62') {
      decodedMsg = `UBEI ${s.substring(1, 3)} Entered Bootloader Mode`;
    }
  } else {
    // Alfie decoders
    if (frameCode === '73') {
      decodedMsg = decodeInfoReport(s);
    } else if (frameCode === '77') {
      decodedMsg = decodeWarnReport(s);
    } else if (frameCode === '66') {
      decodedMsg = decodeFailReport(s);
    } else if (frameCode === '72') {
      decodedMsg = decodeRegReport(s);
    }
  }

  return { ...rf, decodedMsg };
}

// ── 73 Information Report sub-code decoder ──
function decodeInfoReport(s) {
  if (s.length < 9) return '';
  const alfie   = s.substring(1, 3);
  const subCode = s.substring(7, 9).toLowerCase();
  const data    = s.length >= 11 ? s.substring(9, 11) : '';

  switch (subCode) {
    case '71': {
      // Latches Detected — data = count in hex
      const count = parseInt(data, 16);
      return isNaN(count) ? '' : `${count} Latches Detected`;
    }
    case '50':
      // Factory Reset
      return 'Factory Reset';
    case '6f': {
      // Latch Opened — data = latch number in hex
      const latch = parseInt(data, 16);
      return isNaN(latch) ? '' : `Latch ${latch} Opened`;
    }
    case '63': {
      // Latch Closed — data = latch number in hex
      const latch = parseInt(data, 16);
      return isNaN(latch) ? '' : `Latch ${latch} Closed`;
    }
    case '5e':
      // Bootloader Mode
      return `Alfie ${alfie} Entered in Bootloader Mode`;
    case '7c': {
      // Alfie Reset — 4 bytes (8 hex chars) reset cause
      const cause = s.length >= 17 ? s.substring(9, 17).toUpperCase() : '';
      let causeMsg = 'Reset Itself';
      if (cause === '40000000') causeMsg = 'Soft Reset';
      else if (cause === 'C0000000') causeMsg = 'Hard Reset';
      return `Alfie ${alfie} ${causeMsg}`;
    }
    case '2a': {
      // All Latch State — 3-byte bitmap (bit 1 = Closed, bit 0 = Open)
      if (s.length < 15) return '';
      const b1 = parseInt(s.substring(9, 11), 16);
      const b2 = parseInt(s.substring(11, 13), 16);
      const b3 = parseInt(s.substring(13, 15), 16);
      if (isNaN(b1) || isNaN(b2) || isNaN(b3)) return '';
      const openList = [], closeList = [];
      for (let i = 0; i < 8; i++) { (b1 & (1 << i) ? closeList : openList).push(i + 1); }
      for (let i = 0; i < 8; i++) { (b2 & (1 << i) ? closeList : openList).push(i + 9); }
      (b3 & 1 ? closeList : openList).push(17);
      const parts = [];
      if (openList.length)  parts.push(openList.join(', ') + ' Open');
      if (closeList.length) parts.push(closeList.join(', ') + ' Closed');
      return parts.join(' and ');
    }

    // ── Door status ──
    case '75': {
      // Door Unlocked (also Latch Strike Out — same sub-code)
      if (s.length < 11) return '';
      const door = parseInt(s.substring(9, 11), 16);
      return isNaN(door) ? '' : `Door ${door} Unlocked`;
    }
    case '6b': {
      const door = parseInt(s.substring(9, 11), 16);
      return isNaN(door) ? '' : `Door ${door} Locked`;
    }
    case '70': {
      const door = parseInt(s.substring(9, 11), 16);
      return isNaN(door) ? '' : `Door ${door} Partially Unlocked`;
    }
    case '73': {
      const door = parseInt(s.substring(9, 11), 16);
      return isNaN(door) ? '' : `Door ${door} Partially Locked`;
    }

    // ── Compartment status ──
    case '29': {
      const pos = parseInt(s.substring(9, 11), 16);
      return isNaN(pos) ? '' : `Compartment ${pos} Unoccupied`;
    }
    case '28': {
      const pos = parseInt(s.substring(9, 11), 16);
      return isNaN(pos) ? '' : `Compartment ${pos} Occupied`;
    }

    // ── Latch Strike ──
    case '69': {
      const pos = parseInt(s.substring(9, 11), 16);
      return isNaN(pos) ? '' : `Latch ${pos} Strike In`;
    }

    default:
      return '';
  }
}

// ── Little-endian byte swap for 2-byte (4 hex char) values ──
function swapHex16(hex4) {
  if (hex4.length !== 4) return hex4;
  return hex4.substring(2, 4) + hex4.substring(0, 2);
}

// ── 77 Warning Report sub-code decoder ──
function decodeWarnReport(s) {
  if (s.length < 9) return '';
  const alfie   = s.substring(1, 3);
  const subCode = s.substring(7, 9).toLowerCase();

  switch (subCode) {
    case '30': {
      // WARN_OVERCURRENT — latch no (2 hex) + current (4 hex, little-endian, mA)
      if (s.length < 15) return '';
      const latch = parseInt(s.substring(9, 11), 16);
      const rawHex = s.substring(11, 15);
      const mA = parseInt(swapHex16(rawHex), 16);
      if (isNaN(latch) || isNaN(mA)) return '';
      return `Over Current on Latch ${latch} ${mA}mA`;
    }
    case '31': {
      // WARN_OVERVOLTAGE — voltage (4 hex, little-endian, mV)
      if (s.length < 13) return '';
      const rawHex = s.substring(9, 13);
      const mV = parseInt(swapHex16(rawHex), 16);
      if (isNaN(mV)) return '';
      return `Over Voltage ${mV}mV`;
    }
    case '32': {
      // WARN_UNDERVOLTAGE — voltage (4 hex, little-endian, mV)
      if (s.length < 13) return '';
      const rawHex = s.substring(9, 13);
      const mV = parseInt(swapHex16(rawHex), 16);
      if (isNaN(mV)) return '';
      return `Under Voltage ${mV}mV`;
    }
    case '33': {
      // WARN_LATCH_SHORT_CIRCUIT — latch no (2 hex)
      if (s.length < 11) return '';
      const latch = parseInt(s.substring(9, 11), 16);
      return isNaN(latch) ? '' : `Latch ${latch} Short Circuit`;
    }
    case '64': {
      // Light warnings — 1 byte sub-type
      if (s.length < 11) return '';
      const sub = s.substring(9, 11).toLowerCase();
      if (sub === '6d') return 'Lights Count Mismatch';
      if (sub === '62') return 'Light Broken or Disconnected';
      if (sub === '63') return 'Frame CRC Fail';
      return '';
    }
    case '74': {
      // Latch Tempered — latch no (2 hex)
      if (s.length < 11) return '';
      const latch = parseInt(s.substring(9, 11), 16);
      return isNaN(latch) ? '' : `Latch ${latch} Tempered`;
    }
    case '6d': {
      // Memory/Page warnings — 1 byte cause code
      if (s.length < 11) return '';
      const cause = s.substring(9, 11).toLowerCase();
      if (cause === '70') return 'Page Write Fail';
      if (cause === '76') return 'Page Verify Fail';
      return '';
    }
    case '6f': {
      // Fail to Open Latch — latch no (2 hex)
      if (s.length < 11) return '';
      const latch = parseInt(s.substring(9, 11), 16);
      return isNaN(latch) ? '' : `Fail to Open Latch ${latch}, Trying Again`;
    }
    case '6c': {
      // Fatal Current Limit Switch Fault — switch no (2 hex) + retry count (2 hex)
      if (s.length < 11) return '';
      const sw = parseInt(s.substring(9, 11), 16);
      const retry = s.length >= 13 ? parseInt(s.substring(11, 13), 16) : 0;
      if (isNaN(sw)) return '';
      return `Switch ${sw} Fatal Current Limit Fault, Count ${retry || 1}`;
    }
    default:
      return '';
  }
}

// ── 66 Failure Report sub-code decoder ──
function decodeFailReport(s) {
  if (s.length < 9) return '';
  const alfie   = s.substring(1, 3);
  const subCode = s.substring(7, 9).toLowerCase();
  const data    = s.length >= 11 ? s.substring(9, 11) : '';
  const data4   = s.length >= 13 ? s.substring(9, 13) : '';

  switch (subCode) {
    // ── Latch failures (Position) ──
    case '6f': {
      const latch = parseInt(data, 16);
      return isNaN(latch) ? '' : `Latch ${latch} Open Failure`;
    }
    case '3f': {
      const latch = parseInt(data, 16);
      return isNaN(latch) ? '' : `Latch ${latch} State Unknown`;
    }
    case '78': {
      // Latch Connection Broken — position (2 hex) + current (4 hex, little-endian, mA)
      if (s.length < 15) { const l = parseInt(data, 16); return isNaN(l) ? '' : `Latch ${l} Connection Broken`; }
      const latch = parseInt(data, 16);
      const rawHex = s.substring(11, 15);
      const mA = parseInt(swapHex16(rawHex), 16);
      if (isNaN(latch)) return '';
      if (isNaN(mA)) return `Latch ${latch} Connection Broken`;
      return `Latch ${latch} Connection Broken ${mA}mA`;
    }
    case '3e': {
      // Latch Over-current — position (2 hex) + current (4 hex, little-endian, mA)
      if (s.length < 15) { const l = parseInt(data, 16); return isNaN(l) ? '' : `Latch ${l} Over-current`; }
      const latch = parseInt(data, 16);
      const rawHex = s.substring(11, 15);
      const mA = parseInt(swapHex16(rawHex), 16);
      if (isNaN(latch)) return '';
      if (isNaN(mA)) return `Latch ${latch} Over-current`;
      return `Latch ${latch} Over-current ${mA}mA`;
    }
    case '7b': {
      const latch = parseInt(data, 16);
      return isNaN(latch) ? '' : `Latch ${latch} Out of Range`;
    }
    case '79': {
      const latch = parseInt(data, 16);
      return isNaN(latch) ? '' : `Latch ${latch} Busy Failure`;
    }
    case '33': {
      const latch = parseInt(data, 16);
      return isNaN(latch) ? '' : `Latch ${latch} Short Circuit`;
    }
    case '6c': {
      // Fatal Current Limit Switch Fault — switch no (2 hex) + retry count (2 hex)
      const sw = parseInt(data, 16);
      const retry = s.length >= 13 ? parseInt(s.substring(11, 13), 16) : 0;
      if (isNaN(sw)) return '';
      return `Switch ${sw} Fatal Current Limit Fault, Count ${retry || 1}`;
    }

    // ── Short Circuit Fatal (no data) ──
    case '21':
      return 'Short Circuit Fatal';

    // ── Register failures ──
    case '5b': {
      if (!data) return 'Read Register Unknown';
      const rn = getRegName(data);
      return rn ? `Read Register Unknown: ${rn} (ID: ${data.toUpperCase()})` : `Read Register Unknown (ID: ${data.toUpperCase()})`;
    }
    case '72': {
      const regId = data;
      const val = s.length >= 13 ? s.substring(11).toUpperCase() : '';
      const rn = getRegName(regId);
      const name = rn ? `: ${rn}` : '';
      return val ? `Write Register Out of Range${name} (ID: ${regId.toUpperCase()}, Value: ${val})` : `Write Register Out of Range${name} (ID: ${regId.toUpperCase()})`;
    }
    case '69': {
      return data ? `Register Index Unknown (Index: ${data.toUpperCase()})` : 'Register Index Unknown';
    }
    case '49': {
      if (!data) return 'Register Index Missing';
      const rn = getRegName(data);
      return rn ? `Register Index Missing: ${rn} (ID: ${data.toUpperCase()})` : `Register Index Missing (ID: ${data.toUpperCase()})`;
    }
    case '28': {
      if (!data) return 'Register Out of Bound';
      const rn = getRegName(data);
      return rn ? `Register Out of Bound: ${rn} (ID: ${data.toUpperCase()})` : `Register Out of Bound (ID: ${data.toUpperCase()})`;
    }

    // ── Frame failures ──
    case '4c': {
      return data ? `Invalid Frame Length (Frame: ${data.toUpperCase()})` : 'Invalid Frame Length';
    }
    case '24': {
      return data ? `Frame ID Unknown (ID: ${data.toUpperCase()})` : 'Frame ID Unknown';
    }
    case '2d':
      return 'Frame Attribute Unsupported';

    // ── Flash / Memory ──
    case '6e': {
      if (!data) return 'Flash Write Error';
      const rn = getRegName(data);
      return rn ? `Flash Write Error: ${rn} (Register: ${data.toUpperCase()})` : `Flash Write Error (Register: ${data.toUpperCase()})`;
    }

    // ── Door failures ──
    case '75': {
      const door = parseInt(data, 16);
      return isNaN(door) ? '' : `Door ${door} Unlock Failure`;
    }
    case '7d': {
      const door = parseInt(data, 16);
      return isNaN(door) ? '' : `Door ${door} Out of Range`;
    }
    case '7a': {
      const door = parseInt(data, 16);
      return isNaN(door) ? '' : `Door ${door} Busy Failure`;
    }

    // ── Compartment ──
    case '5d': {
      const pos = parseInt(data, 16);
      return isNaN(pos) ? '' : `Compartment ${pos} Out of Range`;
    }

    default:
      return '';
  }
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
  let rfBadge = '';
  if (t === 'RX') {
    const rf = parseReportFrame(msg);
    if (rf) {
      rfBadge = ` <span class="rf-badge ${rf.cls}">${rf.label}</span>`;
      if (rf.decodedMsg) {
        rfBadge += `<span class="rf-decoded ${rf.cls}-text">${rf.decodedMsg}</span>`;
      }
    }
  }
  row.innerHTML = `
    <span class="log-ts">${nowStr()}</span>
    <span class="log-type ${t}">${t}</span>
    <span class="log-msg ${t.toLowerCase()}-msg">${esc(msg)}${rfBadge}</span>
  `;
  wrap.appendChild(row);
  wrap.scrollTop = wrap.scrollHeight;
}

function clearLog() {
  document.getElementById('logWrap').innerHTML = '';
  addLog('INFO', 'Log cleared.');
}

function loadJsPDF() {
  return new Promise((resolve, reject) => {
    if (window.jspdf && window.jspdf.jsPDF) { resolve(window.jspdf.jsPDF); return; }
    const urls = [
      'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.2/jspdf.umd.min.js',
      'https://unpkg.com/jspdf@2.5.2/dist/jspdf.umd.min.js'
    ];
    let idx = 0;
    function tryNext() {
      if (idx >= urls.length) { reject(new Error('Could not load PDF library')); return; }
      const s = document.createElement('script');
      s.src = urls[idx++];
      s.onload = () => {
        if (window.jspdf && window.jspdf.jsPDF) resolve(window.jspdf.jsPDF);
        else tryNext();
      };
      s.onerror = () => tryNext();
      document.head.appendChild(s);
    }
    tryNext();
  });
}

async function downloadLog() {
  const rows = [...document.querySelectorAll('#logWrap .log-row')];
  if (rows.length === 0) { addLog('WARN', 'No log entries to export.'); return; }

  let jsPDF;
  try {
    addLog('INFO', 'Loading PDF library\u2026');
    jsPDF = await loadJsPDF();
  } catch (e) {
    addLog('WARN', 'PDF library unavailable. Exporting as text.');
    downloadLogText();
    return;
  }

  try {

  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const marginL = 10, marginR = 10, marginT = 20, marginB = 12;
  const usableW = pageW - marginL - marginR;
  const lineH = 5.5;

  // Colors per log type
  const TYPE_COLORS = {
    CMD:  [26, 95, 168],
    INFO: [112, 110, 104],
    OK:   [42, 122, 75],
    ERR:  [176, 48, 48],
    WARN: [138, 90, 0],
    RX:   [123, 63, 168],
  };
  const BG_COLORS = {
    CMD:  [232, 240, 251],
    RX:   [245, 232, 255],
  };

  // Column widths (mm)
  const colTs = 52, colType = 14;
  const colMsg = usableW - colTs - colType;

  function drawHeader(pageNum, totalText) {
    // Header bar
    doc.setFillColor(255, 255, 255);
    doc.rect(0, 0, pageW, 14, 'F');
    doc.setDrawColor(200, 197, 188);
    doc.line(0, 14, pageW, 14);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(28, 27, 24);
    doc.text('Alfie Test Portal', marginL, 9);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(112, 110, 104);
    doc.text('Activity Log Export', marginL + 42, 9);

    // Right side: date + page
    const dateStr = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) +
      '  ' + new Date().toLocaleTimeString('en-GB', { hour12: false });
    doc.text(dateStr, pageW - marginR, 9, { align: 'right' });

    // Column headers
    doc.setFillColor(237, 234, 227);
    doc.rect(marginL, 15, usableW, 5, 'F');
    doc.setFont('courier', 'bold');
    doc.setFontSize(7);
    doc.setTextColor(112, 110, 104);
    doc.text('TIMESTAMP', marginL + 1, 18.5);
    doc.text('TYPE', marginL + colTs + 1, 18.5);
    doc.text('MESSAGE', marginL + colTs + colType + 1, 18.5);
  }

  // Parse rows
  const entries = rows.map(r => {
    const spans = r.querySelectorAll('span');
    const ts = spans[0]?.textContent || '';
    const type = spans[1]?.textContent?.trim() || '';
    const msg = spans[2]?.textContent || '';
    return { ts, type, msg };
  });

  let y = marginT + 2;
  let page = 1;
  drawHeader(page);

  entries.forEach((entry, idx) => {
    // Check page break
    if (y + lineH > pageH - marginB) {
      doc.addPage();
      page++;
      drawHeader(page);
      y = marginT + 2;
    }

    // Row background for CMD and RX
    const bgColor = BG_COLORS[entry.type];
    if (bgColor) {
      doc.setFillColor(...bgColor);
      doc.rect(marginL, y - 3.5, usableW, lineH, 'F');
    }

    // Divider line between different types
    if (idx > 0) {
      const prevType = entries[idx - 1].type;
      const needsDivider =
        (entry.type === 'CMD' && prevType !== null) ||
        (entry.type === 'RX' && prevType !== 'RX') ||
        (entry.type !== 'RX' && entry.type !== 'CMD' && prevType === 'RX');
      if (needsDivider) {
        doc.setDrawColor(200, 197, 188);
        doc.setLineWidth(0.2);
        doc.line(marginL, y - 4.2, marginL + usableW, y - 4.2);
      }
    }

    // Timestamp
    doc.setFont('courier', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(155, 152, 145);
    doc.text(entry.ts, marginL + 1, y);

    // Type badge
    const tc = TYPE_COLORS[entry.type] || [112, 110, 104];
    doc.setFont('courier', 'bold');
    doc.setFontSize(7);
    doc.setTextColor(...tc);
    doc.text(entry.type, marginL + colTs + 1, y);

    // Message - handle long text with wrapping
    doc.setFont('courier', entry.type === 'CMD' || entry.type === 'RX' ? 'bold' : 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(...tc);
    const msgX = marginL + colTs + colType + 1;
    const maxMsgW = colMsg - 2;
    const msgLines = doc.splitTextToSize(entry.msg, maxMsgW);
    doc.text(msgLines[0] || '', msgX, y);

    // Extra wrapped lines
    for (let i = 1; i < msgLines.length; i++) {
      y += lineH;
      if (y + lineH > pageH - marginB) {
        doc.addPage();
        page++;
        drawHeader(page);
        y = marginT + 2;
      }
      if (bgColor) {
        doc.setFillColor(...bgColor);
        doc.rect(marginL, y - 3.5, usableW, lineH, 'F');
      }
      doc.text(msgLines[i], msgX, y);
    }

    y += lineH;
  });

  // Footer on all pages
  const totalPages = doc.internal.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(155, 152, 145);
    doc.text(`Page ${i} of ${totalPages}`, pageW - marginR, pageH - 5, { align: 'right' });
    doc.text('Signifi — Alfie Test Portal', marginL, pageH - 5);
  }

  doc.save(`alfie-log-${Date.now()}.pdf`);
  addLog('OK', `Log exported as PDF (${entries.length} entries, ${totalPages} page${totalPages > 1 ? 's' : ''}).`);
  } catch (e) {
    addLog('ERR', 'PDF export failed: ' + e.message + '. Exporting as text.');
    downloadLogText();
  }
}

// Fallback text export
function downloadLogText() {
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

// ── Custom Command Decode Preview ──
function decodeCustomPreview() {
  const el = document.getElementById('customCmd');
  const box = document.getElementById('custom-decode');
  const raw = el.value.trim();

  if (raw.length < 5) { box.style.display = 'none'; return; }
  const devType = raw[3].toUpperCase();
  if (raw[0].toLowerCase() !== 't' || (devType !== 'F' && devType !== 'A')) {
    box.style.display = 'none';
    return;
  }

  const addr = raw.substring(1, 3);
  const isUbei = devType === 'A';
  const dlc = raw[4];
  const cmdData = raw.length > 5 ? raw.substring(5) : '';
  const cmdCode = cmdData.length >= 2 ? cmdData.substring(0, 2).toLowerCase() : '';

  const lines = [];
  let bgType = '';
  const devLabel = isUbei ? 'UBEI' : 'ALFIE';
  lines.push(`<span class="cd-label">${devLabel}</span> <span class="cd-val">${addr}</span>`);
  lines.push(`<span class="cd-label">DLC</span> <span class="cd-val">${dlc}</span>`);

  // Check if it's a response (report frame) — works for both Alfie & UBEI via parseReportFrame
  const ubeiReportCodes = ['69','72','77','66','23','4f','62'];
  const alfieReportCodes = ['73','77','66','72'];
  const isReport = isUbei ? ubeiReportCodes.includes(cmdCode) : alfieReportCodes.includes(cmdCode);

  if (isReport) {
    const rf = parseReportFrame(raw);
    if (rf) {
      let badgeCls = '';
      if (rf.cls === 'rf-info')  { bgType = 'cdbg-info'; badgeCls = 'cd-badge-info'; }
      else if (rf.cls === 'rf-warn')  { bgType = 'cdbg-warn'; badgeCls = 'cd-badge-warn'; }
      else if (rf.cls === 'rf-fail')  { bgType = 'cdbg-error'; badgeCls = 'cd-badge-error'; }
      else if (rf.cls === 'rf-reg')   { bgType = 'cdbg-register'; badgeCls = 'cd-badge-register'; }
      lines.push(`<span class="cd-badge ${badgeCls}">${rf.label}</span>`);
      if (rf.decodedMsg) lines.push(`<span class="cd-val">${esc(rf.decodedMsg)}</span>`);
    }
    box.className = bgType;
    box.innerHTML = lines.join('<br>');
    box.style.display = 'block';
    return;
  }

  // ── UBEI Commands ──
  if (isUbei) {
    switch (cmdCode) {
      case '7c':
        bgType = 'cdbg-info';
        lines.push(`<span class="cd-badge cd-badge-info">RESET</span> <span class="cd-val">Reset UBEI</span>`);
        break;
      case '73':
        bgType = 'cdbg-read';
        lines.push(`<span class="cd-badge cd-badge-read">READ</span> <span class="cd-val">Read Serial Number</span>`);
        break;
      case '53':
        bgType = 'cdbg-read';
        lines.push(`<span class="cd-badge cd-badge-read">STATUS</span> <span class="cd-val">${addr === '00' ? 'All Device Status' : `Device Status ${addr} (${parseInt(addr, 16)})`}</span>`);
        break;
      case '50': {
        bgType = 'cdbg-read';
        const port = cmdData.length >= 4 ? parseInt(cmdData.substring(2, 4), 16) : '?';
        lines.push(`<span class="cd-badge cd-badge-read">PORT STATUS</span> <span class="cd-val">Port ${port}</span>`);
        break;
      }
      case '56':
        bgType = 'cdbg-read';
        lines.push(`<span class="cd-badge cd-badge-read">POWER SOURCES</span> <span class="cd-val">Device ${addr} (${parseInt(addr, 16)})</span>`);
        break;
      case '41': {
        bgType = 'cdbg-info';
        const sub = cmdData.length >= 4 ? cmdData.substring(2, 4) : '';
        if (sub === '01') {
          lines.push(`<span class="cd-badge cd-badge-info">AUTO ADDRESS</span> <span class="cd-val">Enter Auto Address UBEI</span>`);
        } else {
          lines.push(`<span class="cd-badge cd-badge-info">COMMAND 41</span> <span class="cd-val">Data: ${cmdData.substring(2).toUpperCase()}</span>`);
        }
        break;
      }
      case '23':
        bgType = 'cdbg-warn';
        lines.push(`<span class="cd-badge cd-badge-warn">BOOTLOADER</span> <span class="cd-val">Enter Bootloader Mode</span>`);
        break;
      case '52': {
        bgType = 'cdbg-read';
        const regData = cmdData.substring(2);
        lines.push(`<span class="cd-badge cd-badge-read">READ REGISTER</span>`);
        if (regData) {
          lines.push(`<span class="cd-label">REGISTER ID</span> <span class="cd-val">0x${regData.toUpperCase()} (${parseInt(regData, 16)})</span>`);
        }
        break;
      }
      case '57': {
        bgType = 'cdbg-write';
        const regData = cmdData.substring(2);
        lines.push(`<span class="cd-badge cd-badge-write">WRITE REGISTER</span>`);
        if (regData.length >= 2) {
          const regId = regData.substring(0, 2);
          const val = regData.length > 2 ? regData.substring(2) : '';
          lines.push(`<span class="cd-label">REGISTER ID</span> <span class="cd-val">0x${regId.toUpperCase()} (${parseInt(regId, 16)})</span>`);
          if (val) {
            const valDec = parseInt(val, 16);
            lines.push(`<span class="cd-label">VALUE</span> <span class="cd-val">0x${val.toUpperCase()} (${valDec})</span>`);
          }
        }
        break;
      }
      default:
        if (cmdCode) {
          lines.push(`<span class="cd-label">COMMAND</span> <span class="cd-val">${cmdCode.toUpperCase()}</span>`);
          if (cmdData.length > 2) {
            lines.push(`<span class="cd-label">DATA</span> <span class="cd-val">${cmdData.substring(2).toUpperCase()}</span>`);
          }
        }
    }
    box.className = bgType;
    box.innerHTML = lines.join('<br>');
    box.style.display = 'block';
    return;
  }

  // ── Alfie Commands ──
  switch (cmdCode) {
    case '7c':
      bgType = 'cdbg-info';
      lines.push(`<span class="cd-badge cd-badge-info">RESET</span> <span class="cd-val">Reset Alfie</span>`);
      break;

    case '44':
      bgType = 'cdbg-info';
      lines.push(`<span class="cd-badge cd-badge-info">SELF DETECT</span> <span class="cd-val">Self Detect Latches</span>`);
      break;

    case '50':
      bgType = 'cdbg-error';
      lines.push(`<span class="cd-badge cd-badge-error">FACTORY RESET</span> <span class="cd-val">Reset All Parameters</span>`);
      break;

    case '4f': {
      bgType = 'cdbg-write';
      const target = cmdData.substring(2).toLowerCase();
      if (target === '2a') {
        lines.push(`<span class="cd-badge cd-badge-write">OPEN</span> <span class="cd-val">Open All Doors</span>`);
      } else if (target.length >= 2) {
        const door = parseInt(target.substring(0, 2), 16);
        lines.push(`<span class="cd-badge cd-badge-write">OPEN</span> <span class="cd-val">Open Door ${isNaN(door) ? target : door}</span>`);
      }
      break;
    }

    case '51': {
      bgType = 'cdbg-read';
      const target = cmdData.substring(2).toLowerCase();
      if (target === '2a') {
        lines.push(`<span class="cd-badge cd-badge-read">STATUS</span> <span class="cd-val">Door Status All</span>`);
      } else if (target.length >= 2) {
        const door = parseInt(target.substring(0, 2), 16);
        lines.push(`<span class="cd-badge cd-badge-read">STATUS</span> <span class="cd-val">Door Status ${isNaN(door) ? target : door}</span>`);
      }
      break;
    }

    case '52': {
      // Read Parameter
      bgType = 'cdbg-read';
      const regData = cmdData.substring(2);
      if (!regData) { lines.push(`<span class="cd-badge cd-badge-read">READ</span>`); break; }
      const match = lookupRegister(regData);
      lines.push(`<span class="cd-badge cd-badge-read">READ PARAMETER</span>`);
      if (match) {
        const idHex = regData.substring(0, match.idLen).toUpperCase();
        lines.push(`<span class="cd-label">REGISTER</span> <span class="cd-val">${match.reg.name} (ID: ${idHex})</span>`);
      } else {
        lines.push(`<span class="cd-label">REGISTER ID</span> <span class="cd-val">${regData.toUpperCase()}</span>`);
      }
      break;
    }

    case '57': {
      // Write Parameter
      bgType = 'cdbg-write';
      const regData = cmdData.substring(2);
      if (!regData) { lines.push(`<span class="cd-badge cd-badge-write">WRITE</span>`); break; }
      const match = lookupRegister(regData);
      lines.push(`<span class="cd-badge cd-badge-write">WRITE PARAMETER</span>`);
      if (match) {
        const idHex = regData.substring(0, match.idLen).toUpperCase();
        const valueHex = regData.substring(match.idLen);
        lines.push(`<span class="cd-label">REGISTER</span> <span class="cd-val">${match.reg.name} (ID: ${idHex})</span>`);
        if (valueHex) {
          const decoded = decodeRegValue(match.reg.unit, valueHex);
          lines.push(`<span class="cd-label">VALUE</span> <span class="cd-val">${esc(decoded)}</span>`);
        }
      } else {
        lines.push(`<span class="cd-label">DATA</span> <span class="cd-val">${regData.toUpperCase()}</span>`);
      }
      break;
    }

    case '4c': {
      // Color command (cabinet / unified)
      bgType = 'cdbg-write';
      lines.push(`<span class="cd-badge cd-badge-write">COLOR CHANGE</span>`);
      if (cmdData.length >= 14) {
        // Unified: 4C{B1}{B2}{B3}{RR}{GG}{BB}
        // But full string positions: bitmap starts at cmdData[2], which is raw position 7
        const info = decodeUnifiedCmd(raw);
        if (info && info.affected.length > 0) {
          lines.push(`<span class="cd-label">LATCHES</span> <span class="cd-val">${info.affected.join(', ')}</span>`);
          const colorName = rgbToColorName(
            parseInt(info.rHex, 16),
            parseInt(info.gHex, 16),
            parseInt(info.bHex, 16)
          );
          lines.push(`<span class="cd-label">COLOR</span> <span class="cd-val">${esc(colorName)}</span>`);
        } else if (info) {
          lines.push(`<span class="cd-val">No latches affected</span>`);
        }
      }
      break;
    }

    default:
      if (cmdCode) {
        lines.push(`<span class="cd-label">COMMAND</span> <span class="cd-val">${cmdCode.toUpperCase()}</span>`);
        if (cmdData.length > 2) {
          lines.push(`<span class="cd-label">DATA</span> <span class="cd-val">${cmdData.substring(2).toUpperCase()}</span>`);
        }
      }
  }

  box.className = bgType;
  box.innerHTML = lines.join('<br>');
  box.style.display = 'block';
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

  // ── UBEI Enter key listeners ──
  // Device Status
  const uDevStatus = document.getElementById('in-u-deviceStatus');
  if (uDevStatus) uDevStatus.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); fireUbeiCmd('deviceStatus'); }
  });
  // Port Status
  const uPortStatus = document.getElementById('in-u-portStatus');
  if (uPortStatus) uPortStatus.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); fireUbeiCmd('portStatus'); }
  });
  // Power Sources
  const uPower = document.getElementById('in-u-powerSources');
  if (uPower) uPower.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); fireUbeiCmd('powerSources'); }
  });
  // UBEI Read Register
  const uReadId = document.getElementById('in-u-readParam');
  if (uReadId) uReadId.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); fireUbeiCmd('readParam'); }
  });
  const uReadDlc = document.getElementById('in-u-dlc');
  if (uReadDlc) uReadDlc.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); fireUbeiCmd('readParam'); }
  });
  // UBEI Write Register
  const uEditId = document.getElementById('in-u-editId');
  if (uEditId) uEditId.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); fireUbeiCmd('editParam'); }
  });
  const uEditVal = document.getElementById('in-u-editVal');
  if (uEditVal) uEditVal.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); fireUbeiCmd('editParam'); }
  });
  const uEditDlc = document.getElementById('in-u-editDlc');
  if (uEditDlc) uEditDlc.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); fireUbeiCmd('editParam'); }
  });

  // Ctrl+L / Cmd+L: clear log
  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'l') {
      e.preventDefault();
      clearLog();
    }
  });
});