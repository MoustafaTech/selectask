'use strict';

// Global input detection. Two gestures, both configurable:
//   1. ctrlSelect  — hold Ctrl and select text with the mouse; fires on mouse-up.
//   2. doubleCtrl  — select text however you like, then tap Ctrl twice quickly.
// Either way the callback receives the current mouse position.

const DRAG_THRESHOLD_PX = 6;
const DOUBLE_TAP_MS = 400;

function startTrigger(getConfig, shouldIgnore, onTrigger) {
  let uIOhook, UiohookKey;
  try {
    ({ uIOhook, UiohookKey } = require('uiohook-napi'));
  } catch (err) {
    console.error('uiohook-napi failed to load; falling back to hotkey only.', err);
    return () => {};
  }

  const CTRL_CODES = new Set([UiohookKey.Ctrl, UiohookKey.CtrlRight]);

  let ctrlDown = false;
  let otherKeyWhileCtrl = false;
  let lastCtrlTap = 0;
  let mouseDownPos = null;
  let dragged = false;

  uIOhook.on('keydown', (e) => {
    if (CTRL_CODES.has(e.keycode)) {
      ctrlDown = true;
      otherKeyWhileCtrl = false;
    } else if (ctrlDown) {
      // Ctrl+C, Ctrl+T, ... — a shortcut, not our gesture.
      otherKeyWhileCtrl = true;
      lastCtrlTap = 0;
    } else {
      lastCtrlTap = 0;
    }
  });

  uIOhook.on('keyup', (e) => {
    if (!CTRL_CODES.has(e.keycode)) return;
    ctrlDown = false;
    const cfg = getConfig();
    if (!cfg.trigger.doubleCtrl || otherKeyWhileCtrl || shouldIgnore()) return;
    const now = Date.now();
    if (now - lastCtrlTap < DOUBLE_TAP_MS) {
      lastCtrlTap = 0;
      onTrigger({ x: e.x, y: e.y, reason: 'double-ctrl' });
    } else {
      lastCtrlTap = now;
    }
  });

  uIOhook.on('mousedown', (e) => {
    mouseDownPos = { x: e.x, y: e.y };
    dragged = false;
    lastCtrlTap = 0;
  });

  uIOhook.on('mousedrag', (e) => {
    if (!mouseDownPos) return;
    if (Math.abs(e.x - mouseDownPos.x) + Math.abs(e.y - mouseDownPos.y) > DRAG_THRESHOLD_PX) {
      dragged = true;
    }
  });

  uIOhook.on('mouseup', (e) => {
    const wasDrag = dragged && mouseDownPos;
    mouseDownPos = null;
    dragged = false;
    if (!wasDrag || !ctrlDown) return;
    const cfg = getConfig();
    if (!cfg.trigger.ctrlSelect || shouldIgnore()) return;
    otherKeyWhileCtrl = true; // the gesture consumed this Ctrl hold
    onTrigger({ x: e.x, y: e.y, reason: 'ctrl-select' });
  });

  try {
    uIOhook.start();
  } catch (err) {
    // On macOS this means Accessibility access is not granted yet. The
    // hotkey still works; gestures activate on next launch after granting.
    console.error(
      'Could not watch global input (on macOS: grant Accessibility access in ' +
      'System Settings → Privacy & Security → Accessibility, then relaunch). ' +
      'The global hotkey still works.', String(err.message || err)
    );
    return () => {};
  }
  return () => { try { uIOhook.stop(); } catch { /* already stopped */ } };
}

module.exports = { startTrigger };
