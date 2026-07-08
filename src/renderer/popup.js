'use strict';

const $ = (id) => document.getElementById(id);

const viewAsk = $('view-ask');
const viewSettings = $('view-settings');
const thread = $('thread');
const questionEl = $('question');
const selectionChip = $('selection-chip');
const selectionTextEl = $('selection-text');

let selection = '';
let history = [];        // [{role, content}] excluding system
let streamingEl = null;
let streamingRaw = '';
let busy = false;

const MODEL_PLACEHOLDERS = {
  anthropic: 'claude-sonnet-5',
  openai: 'gpt-5.2',
  google: 'gemini-2.5-flash',
  compatible: 'llama3.3'
};

/* ---------- tiny safe markdown ---------- */

function escapeHtml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function inlineMd(s) {
  return s
    .replace(/`([^`]+)`/g, (_, c) => `<code>${c}</code>`)
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|\W)\*([^*\n]+)\*(?=\W|$)/g, '$1<em>$2</em>')
    .replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g, '<a href="$2">$1</a>');
}

function renderMarkdown(src) {
  const lines = src.split('\n');
  const out = [];
  let i = 0;
  let list = null; // 'ul' | 'ol'
  const closeList = () => { if (list) { out.push(`</${list}>`); list = null; } };

  while (i < lines.length) {
    const line = lines[i];

    const fence = line.match(/^```(\w*)/);
    if (fence) {
      closeList();
      const code = [];
      i++;
      while (i < lines.length && !/^```/.test(lines[i])) code.push(lines[i++]);
      i++; // closing fence
      out.push(`<pre><code>${escapeHtml(code.join('\n'))}</code></pre>`);
      continue;
    }

    const esc = escapeHtml(line);

    const h = esc.match(/^(#{1,3})\s+(.*)/);
    if (h) { closeList(); out.push(`<h${h[1].length + 0}>${inlineMd(h[2])}</h${h[1].length}>`); i++; continue; }

    const ul = esc.match(/^\s*[-*]\s+(.*)/);
    const ol = esc.match(/^\s*\d+[.)]\s+(.*)/);
    if (ul || ol) {
      const kind = ul ? 'ul' : 'ol';
      if (list !== kind) { closeList(); out.push(`<${kind}>`); list = kind; }
      out.push(`<li>${inlineMd((ul || ol)[1])}</li>`);
      i++; continue;
    }

    if (/^\s*&gt;\s?/.test(esc)) {
      closeList();
      out.push(`<blockquote>${inlineMd(esc.replace(/^\s*&gt;\s?/, ''))}</blockquote>`);
      i++; continue;
    }

    if (esc.trim() === '') { closeList(); i++; continue; }

    closeList();
    out.push(`<p>${inlineMd(esc)}</p>`);
    i++;
  }
  closeList();
  return out.join('');
}

/* ---------- ask flow ---------- */

function addMsg(cls, html) {
  const el = document.createElement('div');
  el.className = `msg ${cls}`;
  el.innerHTML = html;
  thread.appendChild(el);
  thread.scrollTop = thread.scrollHeight;
  return el;
}

function setBusy(v) {
  busy = v;
  $('btn-send').hidden = v;
  $('btn-stop').hidden = !v;
}

function systemContext() {
  return `The user selected the following text on their screen:\n\n"""\n${selection}\n"""`;
}

async function ask(q) {
  if (busy || !q.trim()) return;
  addMsg('user', escapeHtml(q));
  history.push({ role: 'user', content: history.length === 0 ? `${systemContext()}\n\nQuestion: ${q}` : q });
  questionEl.value = '';
  setBusy(true);

  streamingRaw = '';
  streamingEl = addMsg('assistant streaming', '');
  window.selectask.ask(history.map(m => ({ ...m })));
}

window.selectask.onChunk((delta) => {
  if (!streamingEl) return;
  streamingRaw += delta;
  streamingEl.innerHTML = renderMarkdown(streamingRaw);
  thread.scrollTop = thread.scrollHeight;
});

window.selectask.onDone(() => {
  if (streamingEl) {
    streamingEl.classList.remove('streaming');
    history.push({ role: 'assistant', content: streamingRaw });
  }
  streamingEl = null;
  setBusy(false);
  questionEl.focus();
});

window.selectask.onError((msg) => {
  if (streamingEl) { streamingEl.remove(); streamingEl = null; }
  history.pop(); // drop the failed user turn so retry is clean
  addMsg('error', escapeHtml(msg));
  setBusy(false);
});

$('ask-form').addEventListener('submit', (e) => {
  e.preventDefault();
  ask(questionEl.value);
});

$('btn-stop').addEventListener('click', () => {
  window.selectask.stop();
  if (streamingEl) {
    streamingEl.classList.remove('streaming');
    if (streamingRaw) history.push({ role: 'assistant', content: streamingRaw });
    else { streamingEl.remove(); history.pop(); }
  }
  streamingEl = null;
  setBusy(false);
});

document.querySelectorAll('#quick-actions button').forEach(btn => {
  btn.addEventListener('click', () => ask(btn.dataset.q));
});

$('selection-expand').addEventListener('click', () => {
  selectionChip.classList.toggle('expanded');
  $('selection-expand').textContent = selectionChip.classList.contains('expanded') ? 'less' : 'more';
});

/* ---------- session ---------- */

window.selectask.onSession(async (payload) => {
  if (payload.type === 'settings') { showSettings(); return; }
  selection = payload.selection || '';
  history = [];
  thread.innerHTML = '';
  streamingEl = null;
  setBusy(false);
  selectionTextEl.textContent = selection.length > 600 ? selection.slice(0, 600) + '…' : selection;
  selectionChip.classList.remove('expanded');
  $('selection-expand').textContent = 'more';
  showAsk();

  const cfg = await window.selectask.getConfig();
  const hasKey = cfg.provider === 'compatible' ? !!cfg.baseUrl : !!(cfg.apiKeys || {})[cfg.provider];
  if (!hasKey) {
    addMsg('hintline', 'Add your API key first — opening Settings.');
    showSettings();
    return;
  }
  questionEl.focus();
});

function showAsk() {
  viewSettings.hidden = true;
  viewAsk.hidden = false;
  questionEl.focus();
}

/* ---------- settings ---------- */

async function showSettings() {
  const cfg = await window.selectask.getConfig();
  $('cfg-provider').value = cfg.provider;
  $('cfg-key').value = (cfg.apiKeys || {})[cfg.provider] || '';
  $('cfg-model').value = cfg.model || '';
  $('cfg-baseurl').value = cfg.baseUrl || '';
  $('cfg-ctrlselect').checked = !!cfg.trigger.ctrlSelect;
  $('cfg-doublectrl').checked = !!cfg.trigger.doubleCtrl;
  $('cfg-closeblur').checked = !!cfg.closeOnBlur;
  syncProviderFields();
  viewAsk.hidden = true;
  viewSettings.hidden = false;
}

function syncProviderFields() {
  const p = $('cfg-provider').value;
  $('field-baseurl').hidden = p !== 'compatible';
  $('cfg-model').placeholder = MODEL_PLACEHOLDERS[p] || '';
  $('key-hint').textContent = p === 'compatible'
    ? 'optional for local servers like Ollama'
    : 'stored only on this device';
}

$('cfg-provider').addEventListener('change', async () => {
  const cfg = await window.selectask.getConfig();
  $('cfg-key').value = (cfg.apiKeys || {})[$('cfg-provider').value] || '';
  syncProviderFields();
});

$('btn-save').addEventListener('click', async () => {
  const provider = $('cfg-provider').value;
  await window.selectask.setConfig({
    provider,
    model: $('cfg-model').value.trim() || MODEL_PLACEHOLDERS[provider],
    baseUrl: $('cfg-baseurl').value.trim(),
    apiKeys: { [provider]: $('cfg-key').value },
    trigger: {
      ctrlSelect: $('cfg-ctrlselect').checked,
      doubleCtrl: $('cfg-doublectrl').checked,
      hotkey: 'CommandOrControl+Shift+Space'
    },
    closeOnBlur: $('cfg-closeblur').checked
  });
  showAsk();
});

$('btn-back').addEventListener('click', showAsk);
$('btn-settings').addEventListener('click', showSettings);
$('btn-close').addEventListener('click', () => window.selectask.close());

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') window.selectask.close();
});

// External links open in the browser, never inside the popup.
document.addEventListener('click', (e) => {
  const a = e.target.closest('a[href^="http"]');
  if (a) {
    e.preventDefault();
    window.selectask.openExternal(a.href);
  }
});
