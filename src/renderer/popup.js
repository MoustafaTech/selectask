'use strict';

const $ = (id) => document.getElementById(id);

const viewAsk = $('view-ask');
const viewSettings = $('view-settings');
const thread = $('thread');
const questionEl = $('question');

if (navigator.platform.toLowerCase().includes('mac')) document.body.classList.add('mac');

let pendingSelections = [];  // selections not yet sent with a question
let history = [];            // [{role, content}] excluding system
let streamingEl = null;
let streamingBody = null;
let streamingRaw = '';
let busy = false;

const MODEL_PLACEHOLDERS = {
  anthropic: 'claude-sonnet-5',
  openai: 'gpt-5.2',
  google: 'gemini-2.5-flash',
  compatible: 'llama3.3'
};

/* ---------- view switching ----------
   One entry point, sets both views every time, and never leaves the popup
   blank: if something throws, the ask view is restored and the error shown. */

function setView(name) {
  const showSettingsView = name === 'settings';
  viewAsk.hidden = showSettingsView;
  viewSettings.hidden = !showSettingsView;
  if (!showSettingsView) questionEl.focus();
}

async function openSettingsView() {
  try {
    const cfg = await window.rexplain.getConfig();
    $('cfg-provider').value = cfg.provider;
    $('cfg-key').value = (cfg.apiKeys || {})[cfg.provider] || '';
    $('cfg-model').value = cfg.model || '';
    $('cfg-baseurl').value = cfg.baseUrl || '';
    syncProviderFields();
    setView('settings');
  } catch (err) {
    setView('ask');
    addMsg('error', 'Could not open settings: ' + escapeHtml(String(err.message || err)));
  }
}

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
    if (h) { closeList(); out.push(`<h${h[1].length}>${inlineMd(h[2])}</h${h[1].length}>`); i++; continue; }

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

// Assistant messages carry a tiny "REX" header; streaming writes the body.
function addRexMsg() {
  const el = document.createElement('div');
  el.className = 'msg assistant streaming';
  const head = document.createElement('div');
  head.className = 'rex-head';
  head.innerHTML = document.querySelector('.logo').outerHTML;
  const body = document.createElement('div');
  body.className = 'msg-body';
  el.append(head, body);
  thread.appendChild(el);
  thread.scrollTop = thread.scrollHeight;
  return { el, body };
}

function setBusy(v) {
  busy = v;
  $('btn-send').hidden = v;
  $('btn-stop').hidden = !v;
  $('ask-form').classList.toggle('busy', v);
  runner.turbo = v; // the dino sprints while an answer streams
}

/* ---------- dino runner (plays while the answer generates) ---------- */

const DINO_FRAMES = (() => {
  const base = [
    '..............########',
    '.............##.######',
    '.............#########',
    '.............#########',
    '.............#####....',
    '.............########.',
    '.............#####....',
    '#............####.....',
    '#...........#####.....',
    '##.........######.....',
    '###.......##########..',
    '####.....###########..',
    '#####...##########....',
    '###################...',
    '.#################....',
    '..###############.....',
    '...#############......',
    '....###########.......',
    '.....####..####.......'
  ];
  const legsA = [
    '.....###....###.......',
    '.....##......##.......',
    '.....###.....###......'
  ];
  const legsB = [
    '.....###.....##.......',
    '.....####....##.......',
    '.............###......'
  ];
  return [base.concat(legsA), base.concat(legsB)];
})();

const CACTUS = [
  '...##...',
  '...##...',
  '#..##...',
  '#..##..#',
  '#..##..#',
  '#..##..#',
  '#####..#',
  '...##..#',
  '...#####',
  '...##...',
  '...##...',
  '...##...'
];

const PTERO_FRAMES = [
  [
    '....#.......',
    '....##......',
    '#..####.....',
    '############',
    '...#########',
    '.....######.',
    '............'
  ],
  [
    '............',
    '............',
    '#..##.......',
    '############',
    '...#########',
    '....######..',
    '.....##.....'
  ]
];

const CLOUD = [
  '....####....',
  '..########..',
  '############'
];

const runner = {
  raf: null, t: 0, dist: 0, y: 0, vy: 0, turbo: false,
  obstacles: [], fliers: [], clouds: [], stars: [],
  nextSpawn: 60, score: 0, hi: 0
};

function drawBitmap(ctx, bitmap, x, y, px, style) {
  ctx.fillStyle = style;
  for (let r = 0; r < bitmap.length; r++) {
    for (let c = 0; c < bitmap[r].length; c++) {
      if (bitmap[r][c] === '#') ctx.fillRect(x + c * px, y + r * px, px + 0.4, px + 0.4);
    }
  }
}

// The dino never stops: the scene runs whenever the popup is open.
// (requestAnimationFrame auto-suspends while the window is hidden.)
function initRunner() {
  const canvas = $('dino-strip');
  const dpr = window.devicePixelRatio || 1;
  const W = Math.max(160, canvas.clientWidth || (canvas.parentElement.clientWidth - 28) || 0);
  const H = canvas.clientHeight || 64;
  canvas.width = W * dpr;
  canvas.height = H * dpr;
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.imageSmoothingEnabled = false;

  // Sprite scale 1: a 22px dino in a 56px scene matches the real game's
  // proportions and leaves headroom to jump inside the strip.
  const PX = 1;
  const DINO_W = 22 * PX, DINO_H = 22 * PX;
  const CACT_H = CACTUS.length * PX, CACT_W = 8 * PX;
  const groundY = H - 8;
  const dinoX = 16;

  runner.hi = Number(localStorage.getItem('dino-hi') || 0);
  Object.assign(runner, {
    t: 0, dist: 0, y: 0, vy: 0, score: 0,
    obstacles: [], fliers: [], nextSpawn: 70,
    clouds: [
      { x: W * 0.3, y: 8, v: 0.25 },
      { x: W * 0.75, y: 16, v: 0.18 }
    ],
    stars: Array.from({ length: 7 }, () => ({
      x: Math.random() * W, y: 4 + Math.random() * (H * 0.4), tw: Math.random() * 200
    }))
  });

  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Chrome night palette, inverted: ink #ACACAC, far #252525, mid #454545
  const INK = '#acacac', FAR = '#252525', MID = '#454545', HOT = '#ffffff';

  function drawFrame() {
    ctx.clearRect(0, 0, W, H);

    // night sky
    runner.stars.forEach(s => {
      const on = ((runner.t + s.tw) % 240) < 200;
      if (on) { ctx.fillStyle = MID; ctx.fillRect(Math.round(s.x), Math.round(s.y), 2, 2); }
    });
    runner.clouds.forEach(c => drawBitmap(ctx, CLOUD, Math.round(c.x), c.y, 2, FAR));

    // ground: solid line + drifting pebbles beneath
    ctx.fillStyle = INK;
    ctx.fillRect(0, groundY, W, 2);
    ctx.fillStyle = MID;
    for (let gx = -(Math.round(runner.dist) % 26); gx < W; gx += 26) {
      ctx.fillRect(gx, groundY + 4, 4, 2);
    }

    runner.fliers.forEach(f => {
      drawBitmap(ctx, PTERO_FRAMES[Math.floor(runner.t / 10) % 2], Math.round(f.x), f.y, PX, MID);
    });
    runner.obstacles.forEach(o => {
      drawBitmap(ctx, CACTUS, Math.round(o.x), groundY - o.h * PX, PX, INK);
      if (o.twin) drawBitmap(ctx, CACTUS, Math.round(o.x + CACT_W + 2), Math.round(groundY - CACT_H * 0.82), PX * 0.82, INK);
    });

    const grounded = runner.y === 0;
    const frame = grounded && !reduced ? DINO_FRAMES[Math.floor(runner.t / 5) % 2] : DINO_FRAMES[0];
    drawBitmap(ctx, frame, dinoX, Math.round(groundY - DINO_H + runner.y), PX, INK);

    // score, game-style; flashes white on every 100
    const scoreNum = Math.floor(runner.score);
    const sc = String(scoreNum).padStart(5, '0');
    ctx.font = '8px "Press Start 2P", monospace';
    ctx.textAlign = 'right';
    ctx.fillStyle = MID;
    if (runner.hi > 0) ctx.fillText('HI ' + String(runner.hi).padStart(5, '0'), W - 76, 14);
    ctx.fillStyle = scoreNum > 0 && scoreNum % 100 < 3 ? HOT : INK;
    ctx.fillText(sc, W - 6, 14);
  }

  function tick() {
    runner.t++;
    const speed = (runner.turbo ? 4.2 : 2.3);
    runner.dist += speed;
    runner.score += runner.turbo ? 0.35 : 0.18;
    if (runner.score > runner.hi) {
      runner.hi = Math.floor(runner.score);
      if (runner.t % 60 === 0) localStorage.setItem('dino-hi', String(runner.hi));
    }

    // spawn: cacti while jogging; pterodactyls only join at sprint speed
    if (--runner.nextSpawn <= 0) {
      if (runner.turbo && Math.random() < 0.3) {
        runner.fliers.push({ x: W + 12, y: 18 + Math.round(Math.random() * 5) * 2 });
      } else {
        runner.obstacles.push({ x: W + 10, h: CACTUS.length, twin: Math.random() < 0.3 });
      }
      runner.nextSpawn = 60 + Math.random() * 90;
    }
    runner.obstacles.forEach(o => { o.x -= speed; });
    runner.fliers.forEach(f => { f.x -= speed * 1.25; });
    runner.clouds.forEach(c => {
      c.x -= c.v * (runner.turbo ? 1.6 : 1);
      if (c.x < -30) { c.x = W + 10; c.y = 6 + Math.random() * 14; }
    });
    runner.obstacles = runner.obstacles.filter(o => o.x > -CACT_W * 2 - 8);
    runner.fliers = runner.fliers.filter(f => f.x > -30);

    // auto-jump approaching cacti
    const grounded = runner.y === 0;
    const next = runner.obstacles.find(o => o.x + CACT_W > dinoX && o.x < dinoX + DINO_W + 40);
    if (grounded && next && next.x - (dinoX + DINO_W) < (runner.turbo ? 34 : 22)) {
      runner.vy = -4.4;
    }
    if (!grounded || runner.vy !== 0) {
      runner.y += runner.vy;
      runner.vy += 0.38;
      if (runner.y >= 0) { runner.y = 0; runner.vy = 0; }
    }

    drawFrame();
    runner.raf = requestAnimationFrame(tick);
  }

  cancelAnimationFrame(runner.raf);
  drawFrame(); // paint immediately, even before the loop's first frame
  if (!reduced) runner.raf = requestAnimationFrame(tick);
}

window.addEventListener('resize', initRunner);
initRunner();

function syncHasText() {
  $('ask-form').classList.toggle('has-text', questionEl.value.trim().length > 0);
}

// Show a captured selection in the thread as a context chip.
function addSelectionChip(text) {
  const el = document.createElement('div');
  el.className = 'msg selchip';
  const snippet = text.length > 220 ? text.slice(0, 220) + '…' : text;
  el.textContent = snippet;
  thread.appendChild(el);
  thread.scrollTop = thread.scrollHeight;
}

async function ask(q) {
  if (busy || !q.trim()) return;
  addMsg('user', escapeHtml(q));
  let content = q;
  if (pendingSelections.length) {
    const ctx = pendingSelections.map(sel =>
      `The user selected the following text on their screen:\n"""\n${sel}\n"""`
    ).join('\n\n');
    content = `${ctx}\n\nQuestion: ${q}`;
    pendingSelections = [];
  }
  history.push({ role: 'user', content });
  questionEl.value = '';
  syncHasText();
  setBusy(true);

  streamingRaw = '';
  const rex = addRexMsg();
  streamingEl = rex.el;
  streamingBody = rex.body;
  if (runner.y === 0) runner.vy = -4.4; // the dino jumps when you send
  window.rexplain.ask(history.map(m => ({ ...m })));
}

window.rexplain.onChunk((delta) => {
  if (!streamingBody) return;
  streamingRaw += delta;
  streamingBody.innerHTML = renderMarkdown(streamingRaw);
  thread.scrollTop = thread.scrollHeight;
});

window.rexplain.onDone(() => {
  if (streamingEl) {
    streamingEl.classList.remove('streaming');
    history.push({ role: 'assistant', content: streamingRaw });
  }
  streamingEl = null;
  streamingBody = null;
  setBusy(false);
  questionEl.focus();
});

window.rexplain.onError((msg) => {
  if (streamingEl) { streamingEl.remove(); streamingEl = null; streamingBody = null; }
  history.pop(); // drop the failed user turn so retry is clean
  addMsg('error', escapeHtml(msg));
  setBusy(false);
});

$('ask-form').addEventListener('submit', (e) => {
  e.preventDefault();
  ask(questionEl.value);
});

questionEl.addEventListener('input', syncHasText);

$('btn-stop').addEventListener('click', () => {
  window.rexplain.stop();
  if (streamingEl) {
    streamingEl.classList.remove('streaming');
    if (streamingRaw) history.push({ role: 'assistant', content: streamingRaw });
    else { streamingEl.remove(); history.pop(); }
  }
  streamingEl = null;
  streamingBody = null;
  setBusy(false);
});

// Space makes the dino jump — but never steals typing from the input.
document.addEventListener('keydown', (e) => {
  if (e.code === 'Space' && document.activeElement !== questionEl && !e.repeat) {
    e.preventDefault();
    if (runner.y === 0) runner.vy = -4.4;
  }
});

/* ---------- session ---------- */

window.rexplain.onSession(async (payload) => {
  if (payload.type === 'settings') { openSettingsView(); return; }
  const sel = payload.selection || '';
  const appending = payload.append && (history.length > 0 || pendingSelections.length > 0);
  if (!appending) {
    // fresh conversation
    history = [];
    pendingSelections = [];
    thread.innerHTML = '';
    streamingEl = null;
    streamingBody = null;
    setBusy(false);
  }
  if (sel) {
    pendingSelections.push(sel);
    addSelectionChip(sel);
  }
  setView('ask');

  try {
    const cfg = await window.rexplain.getConfig();
    const hasKey = cfg.provider === 'compatible' ? !!cfg.baseUrl : !!(cfg.apiKeys || {})[cfg.provider];
    if (!hasKey) {
      addMsg('hintline', 'Add your API key first — opening Settings.');
      openSettingsView();
    }
  } catch { /* stay on ask view */ }
});

/* ---------- settings ---------- */

function syncProviderFields() {
  const p = $('cfg-provider').value;
  $('field-baseurl').hidden = p !== 'compatible';
  $('cfg-model').placeholder = MODEL_PLACEHOLDERS[p] || '';
  $('key-hint').textContent = p === 'compatible'
    ? 'optional for local servers like Ollama'
    : 'stored only on this device';
}

$('cfg-provider').addEventListener('change', async () => {
  try {
    const cfg = await window.rexplain.getConfig();
    $('cfg-key').value = (cfg.apiKeys || {})[$('cfg-provider').value] || '';
  } catch { $('cfg-key').value = ''; }
  syncProviderFields();
});

$('btn-save').addEventListener('click', async () => {
  const provider = $('cfg-provider').value;
  try {
    await window.rexplain.setConfig({
      provider,
      model: $('cfg-model').value.trim() || MODEL_PLACEHOLDERS[provider],
      baseUrl: $('cfg-baseurl').value.trim(),
      apiKeys: { [provider]: $('cfg-key').value }
    });
  } catch (err) {
    setView('ask');
    addMsg('error', 'Could not save settings: ' + escapeHtml(String(err.message || err)));
    return;
  }
  setView('ask');
});

$('btn-back').addEventListener('click', () => setView('ask'));
$('btn-settings').addEventListener('click', openSettingsView);
$('btn-close').addEventListener('click', () => window.rexplain.close());

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') window.rexplain.close();
});

// External links open in the browser, never inside the popup.
document.addEventListener('click', (e) => {
  const a = e.target.closest('a[href^="http"]');
  if (a) {
    e.preventDefault();
    window.rexplain.openExternal(a.href);
  }
});
