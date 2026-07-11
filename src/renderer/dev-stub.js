'use strict';

// Browser-only stub of the preload bridge, so popup.html can be opened and
// exercised in a plain browser (npx http-server src/renderer). In Electron the
// real bridge exists before this runs, so this file is a no-op there.
(function () {
  if (window.rex) return;

  const listeners = { session: [], chunk: [], done: [], error: [] };
  const emit = (ch, ...args) => listeners[ch].forEach(fn => fn(...args));
  let streaming = null;

  const cfg = {
    provider: 'anthropic',
    apiKeys: { anthropic: '••••••••mock' },
    model: 'claude-sonnet-5',
    baseUrl: '',
    theme: 'system',
    trigger: { tapCtrl: true, doubleTapCtrl: true }
  };

  window.rex = {
    getConfig: async () => JSON.parse(JSON.stringify(cfg)),
    setConfig: async (patch) => { Object.assign(cfg, patch); return true; },
    ask: async () => {
      const text = 'This phrase means the scheduler keeps **every** process moving:\n\n- Slow tasks sink to lower priority\n- Everyone is periodically boosted back up\n\nSo no process waits forever — `starvation` is bounded.';
      let i = 0;
      clearInterval(streaming);
      streaming = setInterval(() => {
        if (i >= text.length) { clearInterval(streaming); emit('done'); return; }
        emit('chunk', text.slice(i, i + 4));
        i += 4;
      }, 16);
    },
    stop: () => { clearInterval(streaming); },
    close: () => console.log('[stub] close popup'),
    openExternal: (url) => window.open(url, '_blank'),
    onSession: (fn) => listeners.session.push(fn),
    onChunk: (fn) => listeners.chunk.push(fn),
    onDone: (fn) => listeners.done.push(fn),
    onError: (fn) => listeners.error.push(fn)
  };

  // Simulate a trigger shortly after load so the ask view is populated.
  setTimeout(() => emit('session', {
    type: 'ask',
    selection: 'a multilevel feedback queue, demoting processes that exhaust their quantum'
  }), 300);

  // Expose for manual testing in the console.
  window.__stub = { emit };
})();
