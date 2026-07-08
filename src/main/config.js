'use strict';

const { app } = require('electron');
const fs = require('fs');
const path = require('path');

const DEFAULTS = {
  provider: 'anthropic', // anthropic | openai | google | compatible
  apiKeys: {},           // { anthropic: '...', openai: '...', google: '...', compatible: '...' }
  model: 'claude-sonnet-5',
  baseUrl: '',           // used by "compatible" (OpenAI-compatible: Ollama, Groq, OpenRouter, ...)
  systemPrompt:
    'You are a helpful assistant inside a quick-lookup popup. The user selected a piece of text ' +
    'on their screen and is asking about it. Be concise and direct. Use markdown. ' +
    'If the selection is code, assume the question is about that code.',
  trigger: {
    ctrlSelect: true,    // hold Ctrl while selecting with the mouse
    doubleCtrl: true,    // double-tap Ctrl to grab the current selection
    hotkey: 'CommandOrControl+Shift+Space'
  },
  maxTokens: 1024,
  closeOnBlur: true
};

let cached = null;

function file() {
  return path.join(app.getPath('userData'), 'config.json');
}

function load() {
  if (cached) return cached;
  try {
    const raw = JSON.parse(fs.readFileSync(file(), 'utf8'));
    cached = {
      ...DEFAULTS,
      ...raw,
      apiKeys: { ...DEFAULTS.apiKeys, ...(raw.apiKeys || {}) },
      trigger: { ...DEFAULTS.trigger, ...(raw.trigger || {}) }
    };
  } catch {
    cached = JSON.parse(JSON.stringify(DEFAULTS));
  }
  return cached;
}

function save(patch) {
  const cfg = load();
  Object.assign(cfg, patch);
  fs.mkdirSync(path.dirname(file()), { recursive: true });
  fs.writeFileSync(file(), JSON.stringify(cfg, null, 2), { mode: 0o600 });
  return cfg;
}

module.exports = { load, save, DEFAULTS };
