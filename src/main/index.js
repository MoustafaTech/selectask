'use strict';

const {
  app, BrowserWindow, Tray, Menu, ipcMain, screen,
  globalShortcut, nativeImage, shell, systemPreferences
} = require('electron');
const path = require('path');

const config = require('./config');
const { captureSelection } = require('./selection');
const { streamChat } = require('./providers');
const { startTrigger } = require('./trigger');

const POPUP_WIDTH = 480;
const POPUP_HEIGHT = 420;

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
  if (process.platform === 'darwin') {
    app.dock.hide();
    // Prompts the user to grant Accessibility access (needed to watch for the
    // Ctrl gesture and to simulate the copy keystroke).
    systemPreferences.isTrustedAccessibilityClient(true);
  }

  createPopup();
  createTray();
  registerHotkey();

  stopTrigger = startTrigger(
    () => config.load(),
    () => triggersPaused || (popup && popup.isVisible() && popup.isFocused()),
    (point) => triggerCapture(point)
  );
}

function createPopup() {
  popup = new BrowserWindow({
    width: POPUP_WIDTH,
    height: POPUP_HEIGHT,
    show: false,
    frame: false,
    transparent: true,
    resizable: true,
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

  popup.on('blur', () => {
    if (config.load().closeOnBlur && !popup.webContents.isDevToolsOpened()) {
      hidePopup();
    }
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

async function triggerCapture(point) {
  try {
    const text = await captureSelection();
    if (!text) return;
    showPopupAt({ x: point.x, y: point.y }, { type: 'ask', selection: text });
  } catch (err) {
    console.error('capture failed', err);
  }
}

function captureAtCursor() {
  const p = screen.getCursorScreenPoint();
  triggerCapture(p);
}

function openSettings() {
  const p = screen.getCursorScreenPoint();
  showPopupAt(p, { type: 'settings' });
}

function registerHotkey() {
  const cfg = config.load();
  globalShortcut.unregisterAll();
  if (cfg.trigger.hotkey) {
    try {
      globalShortcut.register(cfg.trigger.hotkey, captureAtCursor);
    } catch (err) {
      console.error('hotkey registration failed', err);
    }
  }
}

function createTray() {
  const iconName = process.platform === 'darwin' ? 'trayTemplate.png' : 'tray.png';
  const icon = nativeImage.createFromPath(path.join(__dirname, '..', '..', 'assets', iconName));
  tray = new Tray(icon);
  tray.setToolTip('SelectAsk — select text, ask AI');
  const rebuild = () => {
    tray.setContextMenu(Menu.buildFromTemplate([
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
      { label: 'GitHub', click: () => shell.openExternal('https://github.com/MoustafaTech/selectask') },
      { label: 'Quit SelectAsk', click: () => { app.exit(0); } }
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
  const saved = config.save(patch);
  registerHotkey();
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
      messages,
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
  globalShortcut.unregisterAll();
  if (stopTrigger) stopTrigger();
});

app.on('window-all-closed', () => { /* keep running in the tray */ });
