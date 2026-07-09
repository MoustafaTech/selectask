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
    'on their screen and is asking about it. Answer in a summarized way: a few short sentences ' +
    'or 2-4 bullets, never more, unless the user explicitly asks for detail. Use markdown. ' +
    'If the selection is code, assume the question is about that code.',
  trigger: {
    tapCtrl: true        // select text, then tap Ctrl on its own
  },
  maxTokens: 1024
};

let cached = null;

function file() {
  return path.join(app.getPath('userData'), 'config.json');
}

// One-time migration: the app has been SelectAsk and Rexplain before, and
// userData paths derive from the product name.
function migrateLegacyConfig() {
  try {
    if (fs.existsSync(file())) return;
    for (const name of ['Rexplain', 'SelectAsk']) {
      const legacy = path.join(app.getPath('userData'), '..', name, 'config.json');
      if (fs.existsSync(legacy)) {
        fs.mkdirSync(path.dirname(file()), { recursive: true });
        fs.copyFileSync(legacy, file());
        return;
      }
    }
  } catch { /* fresh start is fine */ }
}

function load() {
  if (cached) return cached;
  migrateLegacyConfig();
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
