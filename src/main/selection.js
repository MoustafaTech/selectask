'use strict';

// Capture the text currently selected in whatever app the user is using.
// Strategy: on Linux, read the primary selection directly (no clipboard touch).
// Elsewhere, save the clipboard, simulate the OS copy keystroke, read the
// clipboard, then restore what was there before.

const { clipboard } = require('electron');
const { execFile } = require('child_process');

const COPY_SETTLE_MS = 160;

function run(cmd, args) {
  return new Promise((resolve) => {
    execFile(cmd, args, { timeout: 3000 }, (err, stdout) => {
      resolve(err ? null : stdout);
    });
  });
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function simulateCopy() {
  if (process.platform === 'darwin') {
    await run('osascript', ['-e', 'tell application "System Events" to keystroke "c" using {command down}']);
  } else if (process.platform === 'win32') {
    await run('powershell', [
      '-NoProfile', '-NonInteractive', '-Command',
      "$w = New-Object -ComObject wscript.shell; $w.SendKeys('^c')"
    ]);
  } else {
    // X11; on Wayland we rely on the primary-selection path instead.
    await run('xdotool', ['key', '--clearmodifiers', 'ctrl+c']);
  }
}

async function linuxPrimarySelection() {
  if (process.env.WAYLAND_DISPLAY) {
    const out = await run('wl-paste', ['--primary', '--no-newline']);
    if (out) return out;
  }
  const out = await run('xclip', ['-o', '-selection', 'primary'])
    || await run('xsel', ['-o', '--primary']);
  return out;
}

async function captureSelection() {
  if (process.platform === 'linux') {
    const primary = await linuxPrimarySelection();
    if (primary && primary.trim()) return primary;
  }

  const before = clipboard.readText();
  // Clear so we can tell whether the copy actually produced anything.
  clipboard.writeText('');
  await simulateCopy();
  await sleep(COPY_SETTLE_MS);
  let text = clipboard.readText();
  if (!text) {
    // Some apps are slow to publish the clipboard.
    await sleep(COPY_SETTLE_MS);
    text = clipboard.readText();
  }
  // Put the user's clipboard back.
  clipboard.writeText(before);
  return text && text.trim() ? text : '';
}

module.exports = { captureSelection };
