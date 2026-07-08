'use strict';

// Streaming chat completions against the user's own API keys.
// Providers: anthropic, openai, google, compatible (any OpenAI-compatible endpoint).
// Each stream() call yields text deltas via onDelta and resolves when done.

async function streamChat(cfg, messages, onDelta, signal) {
  const provider = cfg.provider;
  const key = (cfg.apiKeys || {})[provider] || '';
  if (!key && provider !== 'compatible') {
    throw new Error('No API key set. Open Settings and add your API key.');
  }
  switch (provider) {
    case 'anthropic': return anthropic(cfg, key, messages, onDelta, signal);
    case 'openai': return openaiLike(cfg, key, 'https://api.openai.com/v1', messages, onDelta, signal);
    case 'google': return google(cfg, key, messages, onDelta, signal);
    case 'compatible': {
      const base = (cfg.baseUrl || '').replace(/\/+$/, '');
      if (!base) throw new Error('Set a Base URL for the OpenAI-compatible provider in Settings.');
      return openaiLike(cfg, key, base, messages, onDelta, signal);
    }
    default: throw new Error(`Unknown provider: ${provider}`);
  }
}

async function readSSE(res, onEvent) {
  const decoder = new TextDecoder();
  let buf = '';
  for await (const chunk of res.body) {
    buf += decoder.decode(chunk, { stream: true });
    let idx;
    while ((idx = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, idx).replace(/\r$/, '');
      buf = buf.slice(idx + 1);
      if (line.startsWith('data:')) {
        const data = line.slice(5).trim();
        if (data && data !== '[DONE]') {
          try { onEvent(JSON.parse(data)); } catch { /* ignore partial/keepalive */ }
        }
      }
    }
  }
}

async function httpError(res, providerName) {
  let detail = '';
  try {
    const body = await res.text();
    try {
      const j = JSON.parse(body);
      detail = j.error?.message || j.message || body.slice(0, 300);
    } catch { detail = body.slice(0, 300); }
  } catch { /* ignore */ }
  const hint = res.status === 401 || res.status === 403
    ? ' Check your API key in Settings.'
    : res.status === 404 ? ' Check the model name in Settings.' : '';
  return new Error(`${providerName} error ${res.status}: ${detail}${hint}`);
}

async function anthropic(cfg, key, messages, onDelta, signal) {
  const system = messages.find(m => m.role === 'system')?.content;
  const rest = messages.filter(m => m.role !== 'system');
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    signal,
    headers: {
      'content-type': 'application/json',
      'x-api-key': key,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: cfg.model,
      max_tokens: cfg.maxTokens || 1024,
      system,
      messages: rest,
      stream: true
    })
  });
  if (!res.ok) throw await httpError(res, 'Anthropic');
  await readSSE(res, ev => {
    if (ev.type === 'content_block_delta' && ev.delta?.type === 'text_delta') {
      onDelta(ev.delta.text);
    }
  });
}

async function openaiLike(cfg, key, base, messages, onDelta, signal) {
  const headers = { 'content-type': 'application/json' };
  if (key) headers.authorization = `Bearer ${key}`;
  const res = await fetch(`${base}/chat/completions`, {
    method: 'POST',
    signal,
    headers,
    body: JSON.stringify({
      model: cfg.model,
      messages,
      max_tokens: cfg.maxTokens || 1024,
      stream: true
    })
  });
  if (!res.ok) throw await httpError(res, cfg.provider === 'openai' ? 'OpenAI' : 'API');
  await readSSE(res, ev => {
    const delta = ev.choices?.[0]?.delta?.content;
    if (delta) onDelta(delta);
  });
}

async function google(cfg, key, messages, onDelta, signal) {
  const system = messages.find(m => m.role === 'system')?.content;
  const contents = messages
    .filter(m => m.role !== 'system')
    .map(m => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] }));
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(cfg.model)}:streamGenerateContent?alt=sse&key=${encodeURIComponent(key)}`;
  const res = await fetch(url, {
    method: 'POST',
    signal,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      contents,
      systemInstruction: system ? { parts: [{ text: system }] } : undefined,
      generationConfig: { maxOutputTokens: cfg.maxTokens || 1024 }
    })
  });
  if (!res.ok) throw await httpError(res, 'Google');
  await readSSE(res, ev => {
    const t = ev.candidates?.[0]?.content?.parts?.map(p => p.text).join('');
    if (t) onDelta(t);
  });
}

module.exports = { streamChat };
