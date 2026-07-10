'use strict';

// Global input detection.
// Primary gesture (tapCtrl): select text however you like, then tap Ctrl —
// press and release it on its own. If any other key or the mouse is used
// while Ctrl is down (Ctrl+C, Ctrl+click, Ctrl+scroll…), the tap is void.
// Optional gesture (ctrlSelect): hold Ctrl while selecting with the mouse;
// fires on mouse-up.

const DRAG_THRESHOLD_PX = 6;

function startTrigger(getConfig, shouldIgnore, onTrigger, onDragSelect) {
  let uIOhook, UiohookKey;
  try {
    ({ uIOhook, UiohookKey } = require('uiohook-napi'));
  } catch (err) {
    console.error('uiohook-napi failed to load; falling back to hotkey only.', err);
    return () => {};
  }

  const CTRL_CODES = new Set([UiohookKey.Ctrl, UiohookKey.CtrlRight]);

  let ctrlDown = false;
  let tapSpoiled = false;   // another key or the mouse was used during this Ctrl hold
  let mouseDownPos = null;
  let dragged = false;

  uIOhook.on('keydown', (e) => {
    if (CTRL_CODES.has(e.keycode)) {
      if (!ctrlDown) { ctrlDown = true; tapSpoiled = false; }
    } else if (ctrlDown) {
      tapSpoiled = true; // it's a keyboard shortcut, not our gesture
    }
  });

  uIOhook.on('keyup', (e) => {
    if (!CTRL_CODES.has(e.keycode)) return;
    const wasClean = ctrlDown && !tapSpoiled;
    ctrlDown = false;
    if (!wasClean || shouldIgnore()) return;
    const cfg = getConfig();
    if (!cfg.trigger.tapCtrl) return;
    onTrigger({ x: e.x, y: e.y, reason: 'tap-ctrl' });
  });

  uIOhook.on('wheel', () => { if (ctrlDown) tapSpoiled = true; });

  uIOhook.on('mousedown', (e) => {
    if (ctrlDown) tapSpoiled = true; // Ctrl+click is not a tap
    mouseDownPos = { x: e.x, y: e.y };
    dragged = false;
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
    if (!wasDrag) return;
    // A drag anywhere is a possible new selection — the main process
    // decides whether an open popup should refresh its context.
    if (onDragSelect && !shouldIgnore()) onDragSelect({ x: e.x, y: e.y });
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
