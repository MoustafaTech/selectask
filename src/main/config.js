'use strict';

const { app } = require('electron');
const fs = require('fs');
const path = require('path');

const DEFAULTS = {
  theme: 'system',       // system | dark | light
  // anthropic | openai | google | mistral | deepseek | xai | groq | openrouter |
  // ollama | compatible (any other OpenAI-compatible endpoint)
  provider: 'anthropic',
  apiKeys: {},           // keyed by provider, e.g. { anthropic: '...', openai: '...' }
  model: 'claude-sonnet-5',
  baseUrl: '',           // used only by "compatible" (custom OpenAI-compatible endpoint)
  systemPrompt:
    'You are Rex, a quick-lookup assistant in a small popup. The user selected a piece of text ' +
    'on their screen and is asking about it. Default to summarized answers: a few short ' +
    'sentences or 2-4 bullets, never more. Only go longer when the user explicitly asks for ' +
    'more detail, a longer answer, or a deeper conversation. Use markdown. If the selection ' +
    'is code, assume the question is about that code.',
  trigger: {
    tapCtrl: true,       // select text, then tap Ctrl on its own
    doubleTapCtrl: true  // tap Ctrl twice to open Rex with no selection
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
        restrictPermissions();
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

// writeFileSync's mode only applies when the file is created, so tighten
// pre-existing files too. No-op on Windows, where ACLs do the job.
function restrictPermissions() {
  if (process.platform === 'win32') return;
  try { fs.chmodSync(file(), 0o600); } catch { /* best effort */ }
}

function save(patch) {
  const cfg = load();
  Object.assign(cfg, patch);
  fs.mkdirSync(path.dirname(file()), { recursive: true });
  fs.writeFileSync(file(), JSON.stringify(cfg, null, 2), { mode: 0o600 });
  restrictPermissions();
  return cfg;
}

module.exports = { load, save, DEFAULTS };
