'use strict';

const {
  app, BrowserWindow, Tray, Menu, ipcMain, screen,
  nativeImage, shell, systemPreferences, session
} = require('electron');
const path = require('path');

const config = require('./config');
const { captureSelection } = require('./selection');
const { streamChat } = require('./providers');
const { startTrigger } = require('./trigger');

const POPUP_WIDTH = 420;
const POPUP_HEIGHT = 360;

let popup = null;
let tray = null;
let stopTrigger = null;
let currentAbort = null;
let triggersPaused = false;

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.whenReady().then(onReady);
}

function onReady() {
  // The popup renders only local files; nothing should ever ask for camera,
  // notifications, etc. Deny all permission requests outright.
  session.defaultSession.setPermissionRequestHandler((_wc, _permission, callback) => callback(false));

  if (process.platform === 'darwin') {
    app.dock.hide();
    // Prompts the user to grant Accessibility access (needed to watch for the
    // Ctrl gesture and to simulate the copy keystroke).
    systemPreferences.isTrustedAccessibilityClient(true);
  }

  createPopup();
  createTray();

  stopTrigger = startTrigger(
    () => config.load(),
    () => triggersPaused || (popup && popup.isVisible() && popup.isFocused()),
    (point) => triggerCapture(point),
    () => liveSelectionUpdate(),
    (point) => openAnywhere(point)
  );
}

function createPopup() {
  popup = new BrowserWindow({
    width: POPUP_WIDTH,
    height: POPUP_HEIGHT,
    show: false,
    frame: false,
    transparent: true,
    // The pixel theme is opaque — no vibrancy. transparent stays true so the
    // 9px OS corner mask (matched by the shell's CSS radius) renders clean.
    resizable: true,
    minWidth: 360,
    minHeight: 300,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    hasShadow: true,
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      spellcheck: false
    }
  });
  popup.loadFile(path.join(__dirname, '..', 'renderer', 'popup.html'));
  popup.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });

  // The window has the preload bridge (and the user's questions); never let
  // remote content load inside it. Links open in the system browser.
  popup.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  popup.webContents.on('will-navigate', (e, url) => {
    if (url !== popup.webContents.getURL()) e.preventDefault();
  });

  popup.on('close', (e) => {
    e.preventDefault();
    hidePopup();
  });
}

function hidePopup() {
  if (currentAbort) { currentAbort.abort(); currentAbort = null; }
  if (popup && popup.isVisible()) popup.hide();
}

function showPopupAt(point, payload) {
  const display = screen.getDisplayNearestPoint(point);
  const wa = display.workArea;
  const [w, h] = popup.getSize();
  const x = Math.min(Math.max(point.x + 12, wa.x), wa.x + wa.width - w - 8);
  const y = Math.min(Math.max(point.y + 16, wa.y), wa.y + wa.height - h - 8);
  popup.setPosition(Math.round(x), Math.round(y));
  popup.webContents.send('session', payload);
  popup.show();
  popup.focus();
}

const DEBUG = !!process.env.REX_DEBUG;

async function triggerCapture(point) {
  try {
    if (DEBUG) console.log('[rex] trigger', point && point.reason);
    const text = await captureSelection();
    if (DEBUG) console.log('[rex] captured', text ? `${text.length} chars` : 'nothing');
    if (!text) return;
    // Keyboard events carry no coordinates — fall back to the live cursor.
    const p = point && Number.isFinite(point.x) && Number.isFinite(point.y)
      ? { x: point.x, y: point.y }
      : screen.getCursorScreenPoint();
    const append = popup && popup.isVisible();
    if (append) {
      // Don't yank a visible popup around the screen; just feed it context.
      popup.webContents.send('session', { type: 'ask', selection: text, append: true });
      popup.focus();
    } else {
      showPopupAt(p, { type: 'ask', selection: text, append: false });
    }
  } catch (err) {
    console.error('capture failed', err);
  }
}

// While the popup is open, a plain drag-selection anywhere refreshes the
// pending context — no Ctrl needed.
let liveTimer = null;
function liveSelectionUpdate() {
  if (!popup || !popup.isVisible() || popup.isFocused() || triggersPaused) return;
  clearTimeout(liveTimer);
  liveTimer = setTimeout(async () => {
    try {
      const text = await captureSelection();
      if (DEBUG) console.log('[rex] live selection', text ? `${text.length} chars` : 'nothing');
      if (text) {
        popup.webContents.send('session', { type: 'ask', selection: text, append: true, live: true });
      }
    } catch { /* stay quiet for live updates */ }
  }, 250);
}

function captureAtCursor() {
  const p = screen.getCursorScreenPoint();
  triggerCapture(p);
}

// Double-tap Ctrl (or the tray item): open Rex with nothing selected — the
// conversation resumes if one is going, otherwise it's a blank ask box.
function openAnywhere(point) {
  try {
    if (DEBUG) console.log('[rex] open', (point && point.reason) || 'tray');
    if (popup && popup.isVisible()) {
      popup.webContents.send('session', { type: 'ask', append: true });
      popup.focus();
      return;
    }
    const p = point && Number.isFinite(point.x) && Number.isFinite(point.y)
      ? { x: point.x, y: point.y }
      : screen.getCursorScreenPoint();
    showPopupAt(p, { type: 'ask', append: true });
  } catch (err) {
    console.error('open failed', err);
  }
}

// Debug harness: `kill -USR2 <pid>` simulates the trigger firing, entering
// the same path as a Ctrl tap (including the no-coordinates fallback).
if (DEBUG && process.platform !== 'win32') {
  process.on('SIGUSR2', () => triggerCapture({ reason: 'debug-signal' }));
}

function openSettings() {
  const p = screen.getCursorScreenPoint();
  showPopupAt(p, { type: 'settings' });
}

function createTray() {
  const iconName = process.platform === 'darwin' ? 'trayTemplate.png' : 'tray.png';
  const icon = nativeImage.createFromPath(path.join(__dirname, '..', '..', 'assets', iconName));
  tray = new Tray(icon);
  tray.setToolTip('Rex — select text, tap Ctrl, ask the dino');
  const rebuild = () => {
    tray.setContextMenu(Menu.buildFromTemplate([
      { label: 'Open Rex', click: () => openAnywhere() },
      { label: 'Ask about current selection', click: captureAtCursor },
      { type: 'separator' },
      {
        label: 'Pause triggers',
        type: 'checkbox',
        checked: triggersPaused,
        click: (item) => { triggersPaused = item.checked; }
      },
      { label: 'Settings…', click: openSettings },
      { type: 'separator' },
      { label: 'GitHub', click: () => shell.openExternal('https://github.com/MoustafaTech/rex') },
      { label: 'Quit Rex', click: () => { app.exit(0); } }
    ]));
  };
  rebuild();
}

// ---------- IPC ----------

ipcMain.handle('config:get', () => {
  const cfg = config.load();
  // Never hand the renderer full keys; mask for display.
  const masked = {};
  for (const [k, v] of Object.entries(cfg.apiKeys || {})) {
    masked[k] = v ? `${'•'.repeat(8)}${v.slice(-4)}` : '';
  }
  return { ...cfg, apiKeys: masked };
});

ipcMain.handle('config:set', (_e, patch) => {
  const cfg = config.load();
  if (patch.apiKeys) {
    // Only overwrite keys the user actually retyped (masked values echo back).
    const merged = { ...cfg.apiKeys };
    for (const [k, v] of Object.entries(patch.apiKeys)) {
      if (v === '' ) merged[k] = '';
      else if (v && !v.startsWith('••')) merged[k] = v.trim();
    }
    patch.apiKeys = merged;
  }
  config.save(patch);
  return true;
});

ipcMain.handle('ask', async (e, messages) => {
  if (currentAbort) currentAbort.abort();
  const abort = new AbortController();
  currentAbort = abort;
  const cfg = config.load();
  const wc = e.sender;
  try {
    await streamChat(
      cfg,
      cfg.systemPrompt ? [{ role: 'system', content: cfg.systemPrompt }, ...messages] : messages,
      (delta) => { if (!abort.signal.aborted) wc.send('chunk', delta); },
      abort.signal
    );
    if (!abort.signal.aborted) wc.send('done');
  } catch (err) {
    if (!abort.signal.aborted) wc.send('stream-error', String(err.message || err));
  } finally {
    if (currentAbort === abort) currentAbort = null;
  }
});

ipcMain.on('stop', () => {
  if (currentAbort) { currentAbort.abort(); currentAbort = null; }
});

ipcMain.on('close-popup', hidePopup);

ipcMain.on('open-external', (_e, url) => {
  if (/^https?:\/\//i.test(url)) shell.openExternal(url);
});

app.on('will-quit', () => {
  if (stopTrigger) stopTrigger();
});

app.on('window-all-closed', () => { /* keep running in the tray */ });
