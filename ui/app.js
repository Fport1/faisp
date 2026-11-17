/* faisp — interfaz. Sin frameworks: DOM + fetch + SSE. */
'use strict';

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmtN = n => (n || 0).toLocaleString('es-ES');
const fmtUsd = n => '$' + (n || 0).toFixed((n || 0) < 1 ? 4 : 2);
const fmtTok = n => n >= 1e6 ? (n / 1e6).toFixed(1) + 'M' : n >= 1e3 ? (n / 1e3).toFixed(1) + 'k' : String(n || 0);
const ago = ts => { const s = (Date.now() - new Date(ts)) / 1000; if (s < 60) return 'ahora'; if (s < 3600) return Math.floor(s / 60) + ' min'; if (s < 86400) return Math.floor(s / 3600) + ' h'; return Math.floor(s / 86400) + ' d'; };
const store = { get: (k, d) => { try { return localStorage.getItem(k) ?? d; } catch { return d; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch {} } };

// ---------- Iconos (línea, 24px, estilo Lucide) ----------
const ICONS = {
  plus: '<path d="M12 5v14M5 12h14"/>',
  chat: '<path d="M21 12a8.5 8.5 0 0 1-12.3 7.6L3.5 21l1.3-4.6A8.5 8.5 0 1 1 21 12z"/>',
  folder: '<path d="M3 7.5A2.5 2.5 0 0 1 5.5 5H9l2 2.2h7.5A2.5 2.5 0 0 1 21 9.7v7.8a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 3 17.5z"/>',
  layers: '<path d="M12 3.5 21 8l-9 4.5L3 8z"/><path d="m3 12.5 9 4.5 9-4.5"/><path d="m3 16.5 9 4.5 9-4.5"/>',
  bot: '<rect x="4" y="8" width="16" height="12" rx="3"/><path d="M12 4v4M2 13v3M22 13v3"/><circle cx="9" cy="14" r="1" fill="currentColor"/><circle cx="15" cy="14" r="1" fill="currentColor"/>',
  plug: '<path d="M9 2.5v5M15 2.5v5M6 7.5h12v4a6 6 0 0 1-12 0z"/><path d="M12 17.5v4"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.2 2"/>',
  chart: '<path d="M4 20V11M10 20V5M16 20v-6M2.5 20.5h19"/>',
  settings: '<path d="M4 7h9M17 7h3M4 17h3M11 17h9"/><circle cx="15" cy="7" r="2"/><circle cx="9" cy="17" r="2"/>',
  sidebar: '<rect x="3" y="4" width="18" height="16" rx="3"/><path d="M9.5 4v16"/>',
  panel: '<rect x="3" y="4" width="18" height="16" rx="3"/><path d="M14.5 4v16"/>',
  theme: '<circle cx="12" cy="12" r="8.5"/><path d="M12 3.5a8.5 8.5 0 0 0 0 17z" fill="currentColor"/>',
  compass: '<circle cx="12" cy="12" r="9"/><path d="m15.5 8.5-2 5-5 2 2-5z"/>',
  code: '<path d="m8.5 7-5 5 5 5M15.5 7l5 5-5 5"/>',
  cube: '<path d="M12 2.8 20.2 7.4v9.2L12 21.2l-8.2-4.6V7.4z"/><path d="M12 12l8.2-4.6M12 12v9.2M12 12 3.8 7.4"/>',
  feather: '<path d="M20 4.5a5.4 5.4 0 0 0-7.7 0L5 11.8V19h7.2l7.3-7.3a5.4 5.4 0 0 0 .5-7.2z"/><path d="M16 8.5 3 21.5M17.5 15h-8"/>',
  map: '<path d="m9 4.5-5.5 2v13l5.5-2 6 2 5.5-2v-13l-5.5 2z"/><path d="M9 4.5v13M15 6.5v13"/>',
  check: '<circle cx="12" cy="12" r="9"/><path d="m8.2 12.4 2.5 2.5 5.1-5.3"/>',
  tick: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
  globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.6 3.8 5.6 3.8 9s-1.3 6.4-3.8 9c-2.5-2.6-3.8-5.6-3.8-9S9.5 5.6 12 3z"/>',
  search: '<circle cx="11" cy="11" r="6.5"/><path d="m20 20-4.3-4.3"/>',
  file: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/>',
  wrench: '<path d="M14.7 6.3a4.2 4.2 0 0 0-5.5 5.5L3.5 17.5l3 3 5.7-5.7a4.2 4.2 0 0 0 5.5-5.5l-2.7 2.7-2.6-.4-.4-2.6z"/>',
  x: '<path d="M6.5 6.5l11 11M17.5 6.5l-11 11"/>',
  arrowUp: '<path d="M12 19V5M5.5 11.5 12 5l6.5 6.5"/>',
  stop: '<rect x="7" y="7" width="10" height="10" rx="2" fill="currentColor" stroke="none"/>',
  chevron: '<path d="m6 9 6 6 6-6"/>',
  sparkle: '<path d="M12 3.5 13.9 9 19.5 11 13.9 13 12 18.5 10.1 13 4.5 11 10.1 9z"/>',
  trash: '<path d="M4 7h16M9.5 7V4.5h5V7M6 7l1 13h10l1-13"/>',
  external: '<path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>',
  play: '<path d="M7.5 4.5v15l12-7.5z"/>',
  copy: '<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V6a2 2 0 0 1 2-2h8"/>',
  download: '<path d="M12 4v11M6.5 10l5.5 5.5 5.5-5.5M4 20h16"/>',
  refresh: '<path d="M20 11.5a8 8 0 1 1-2.4-5.7L20 8"/><path d="M20 3.5V8h-4.5"/>',
  zap: '<path d="M13 2.5 4.5 13.5H11l-1 8 8.5-11H12z"/>',
  key: '<circle cx="8" cy="15" r="4"/><path d="m10.9 12.1 9.1-9.1M16.5 6.5l3 3"/>',
  alert: '<path d="M12 3.5 2.5 20h19z"/><path d="M12 10v4.5M12 17.3v.2"/>',
  link: '<path d="M10 14a4 4 0 0 0 5.7 0l3.1-3.1a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3.1 3.1a4 4 0 0 0 5.7 5.7l1-1"/>',
  eye: '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="3"/>',
  pencil: '<path d="M4 20h4L19 9l-4-4L4 16z"/>',
  menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
  book: '<path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5z"/><path d="M4 20.5A2.5 2.5 0 0 0 6.5 23H20v-5"/>',
  palette: '<path d="M12 3a9 9 0 1 0 0 18c1.4 0 2-1 2-2 0-1.7 1-2.5 2.5-2.5H18a3 3 0 0 0 3-3C21 7 17 3 12 3z"/><circle cx="7.5" cy="11" r="1" fill="currentColor"/><circle cx="10.5" cy="7" r="1" fill="currentColor"/><circle cx="15.5" cy="7.5" r="1" fill="currentColor"/>',
  music: '<path d="M9 18V5l11-2v13"/><circle cx="6.5" cy="18" r="2.5"/><circle cx="17.5" cy="16" r="2.5"/>',
  image: '<rect x="3" y="4" width="18" height="16" rx="2.5"/><circle cx="9" cy="10" r="1.8"/><path d="m21 16-5-5-9 9"/>',
  shield: '<path d="M12 3 4.5 6v6c0 4.5 3.2 7.8 7.5 9 4.3-1.2 7.5-4.5 7.5-9V6z"/>',
};
// ---------- Logos de proveedores y conectores ----------
const PROVIDER_BRAND = { obsidian: 'obsidian', cloudflare: 'cloudflare', anthropic: 'anthropic', claude: 'claude', gemini: 'googlegemini', ollama: 'ollama', xai: 'x', openrouter: 'openrouter', mistral: 'mistralai', elevenlabs: 'elevenlabs', github: 'github', vercel: 'vercel', notion: 'notion', linear: 'linear', gdrive: 'googledrive', gmail: 'gmail', gcalendar: 'googlecalendar' };
const DARK_BRANDS = ['000000', '181717', '191919'];
function brandTile(id, label = '', size = 38) {
  const b = typeof BRAND !== 'undefined' && BRAND[PROVIDER_BRAND[id] || id];
  if (b) {
    const fill = DARK_BRANDS.includes(b.hex) ? 'var(--text)' : '#' + b.hex;
    return `<span class="tile blogo" style="width:${size}px;height:${size}px" title="${esc(b.title)}"><svg viewBox="0 0 24 24" width="${Math.round(size * 0.55)}" height="${Math.round(size * 0.55)}" fill="${fill}" aria-hidden="true"><path d="${b.d}"/></svg></span>`;
  }
  const letter = (label || id).replace(/[^A-Za-z0-9]/g, '').slice(0, 2) || '?';
  return `<span class="tile blogo letter" style="width:${size}px;height:${size}px;font-size:${Math.round(size * 0.36)}px">${esc(letter)}</span>`;
}

// ---------- Catálogo de modelos (desplegable) ----------
const MODEL_CATALOG = {
  anthropic: ['claude-opus-5-5', 'claude-sonnet-5-5', 'claude-haiku-5-5', 'claude-fable-5-2'],
  claude: ['claude-opus-5-5', 'claude-sonnet-5-5', 'claude-haiku-5-5', 'claude-fable-5-2'],
  gemini: ['gemini-4-hydrogen', 'gemini-3.8-flash', 'gemini-3.5-flash-lite'],
  groq: ['openai/gpt-oss-120b', 'openai/gpt-oss-20b', 'llama-3.3-70b-versatile'],
  xai: ['grok-4.7', 'grok-4.3'],
  cerebras: ['gpt-oss-120b', 'qwen-3.8-27b'],
  cloudflare: ['@cf/meta/llama-3.3-70b-instruct-fp8-fast', '@cf/openai/gpt-oss-120b'],
  chatgpt: [''],
};
const prettyModel = m => {
  const c = m.match(/^claude-(opus|sonnet|haiku|fable)-(\d+)-(\d+)$/);
  if (c) return 'Claude ' + c[1][0].toUpperCase() + c[1].slice(1) + ' ' + c[2] + '.' + c[3];
  if (m === '') return 'Modelo por defecto';
  if (m.startsWith('@cf/')) return m.split('/').pop();
  return m.replace(/^gemini-/, 'Gemini ').replace(/^grok-/, 'Grok ');
};
function modelPickerHtml(id, value, extraClass = '') {
  const provs = S.st.config.providers || {};
  const ready = S.st.providerReady || {};
  let found = false;
  const groups = Object.entries(provs).filter(([pid, p]) => p.type !== 'elevenlabs' && p.type !== 'mock').map(([pid, p]) => {
    const models = MODEL_CATALOG[pid] || [];
    const opts = models.map(m => { const v = pid + ':' + m; if (v === value) found = true; return `<option value="${esc(v)}" ${v === value ? 'selected' : ''}>${esc(prettyModel(m))}</option>`; }).join('');
    return opts ? `<optgroup label="${esc(p.label)}${ready[pid] ? '' : ' (sin configurar)'}">${opts}</optgroup>` : '';
  }).join('');
  const current = !found && value ? `<optgroup label="Actual"><option value="${esc(value)}" selected>${esc(value)}</option></optgroup>` : '';
  return `<select class="in model-pick ${extraClass}" id="${id}">${current}${groups}<option value="__custom">Otro modelo (escribir proveedor:modelo)…</option></select>`;
}
function wireModelPicker(sel) {
  if (!sel) return;
  let prev = sel.value;
  sel.addEventListener('change', async () => {
    if (sel.value !== '__custom') { prev = sel.value; return; }
    const v = (await askText('Modelo como proveedor:modelo (p. ej. openrouter:deepseek/deepseek-chat, ollama:qwen2.5-coder):', prev) || '').trim();
    if (!v) { sel.value = prev; return; }
    sel.insertAdjacentHTML('afterbegin', `<option value="${esc(v)}">${esc(v)}</option>`);
    sel.value = v; prev = v;
  });
}
// Páginas oficiales de uso de cada proveedor (verificadas)
const USAGE_LINKS = {
  claude: [['Uso en Claude', 'https://claude.ai/settings/usage']],
  anthropic: [['Uso', 'https://platform.claude.com/usage']],
  gemini: [['Uso', 'https://aistudio.google.com/usage'], ['Límites', 'https://aistudio.google.com/rate-limit']],
  groq: [['Uso', 'https://console.groq.com/dashboard/usage']],
  xai: [['Consola', 'https://console.x.ai']],
  openrouter: [['Actividad', 'https://openrouter.ai/activity'], ['Créditos', 'https://openrouter.ai/settings/credits']],
  elevenlabs: [['Uso', 'https://elevenlabs.io/app/developers/analytics/usage'], ['Plan', 'https://elevenlabs.io/app/subscription']],
  openai: [['Uso', 'https://platform.openai.com/usage']],
  chatgpt: [['Uso de Codex', 'https://chatgpt.com/codex/settings/usage']],
  mistral: [['Uso', 'https://console.mistral.ai/usage']],
  cerebras: [['Consola', 'https://cloud.cerebras.ai']],
  cloudflare: [['Uso', 'https://dash.cloudflare.com/?to=/:account/ai/workers-ai']],
};
const usageLinks = id => (USAGE_LINKS[id] || []).map(([l, u]) => `<a class="extlink" href="${u}" target="_blank" rel="noopener" title="${esc(u)}">${esc(l)} ${ico('external', 11)}</a>`).join('');

const KEY_URLS = { cloudflare: 'https://dash.cloudflare.com/?to=/:account/ai/workers-ai', anthropic: 'https://console.anthropic.com/settings/keys', gemini: 'https://aistudio.google.com/apikey', groq: 'https://console.groq.com/keys', xai: 'https://console.x.ai', openrouter: 'https://openrouter.ai/keys', cerebras: 'https://cloud.cerebras.ai', mistral: 'https://console.mistral.ai/api-keys', openai: 'https://platform.openai.com/api-keys', elevenlabs: 'https://elevenlabs.io/app/settings/api-keys' };

const MODES = [
  { id: 'auto', label: 'Auto', icon: 'sparkle', desc: 'Lee libremente; las ediciones quedan como propuestas y los comandos piden permiso' },
  { id: 'manual', label: 'Manual', icon: 'shield', desc: 'Pide permiso antes de cada cambio' },
  { id: 'acceptEdits', label: 'Aceptar ediciones', icon: 'pencil', desc: 'Aplica los cambios en archivos (con copia); los comandos piden permiso' },
  { id: 'plan', label: 'Plan', icon: 'book', desc: 'Solo lee y te propone un plan; no cambia nada' },
  { id: 'bypass', label: 'Omitir permisos', icon: 'alert', desc: 'Todo sin preguntar. Úsalo con cuidado' },
];
const EFFORTS = [['auto', 'Automático'], ['agent', 'Según el agente'], ['low', 'Bajo'], ['medium', 'Medio'], ['high', 'Alto'], ['xhigh', 'Muy alto'], ['max', 'Máximo']];
const EFFORT_LEVELS = EFFORTS.slice(2);
const AGENT_ICONS = ['play', 'compass', 'code', 'cube', 'feather', 'map', 'globe', 'check', 'search', 'book', 'palette', 'music', 'image', 'shield', 'sparkle', 'bot', 'wrench', 'chart', 'layers'];
const ico = (name, size = 16, sw = 1.75) => `<svg class="i" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] || ICONS.sparkle}</svg>`;
const agentIcon = (a, size = 16) => a && ICONS[a.icon] ? `<span style="color:${esc(a.color || 'currentColor')};display:inline-flex">${ico(a.icon, size)}</span>` : esc(a?.icon || '');

const MODEL_SUGGESTIONS = ['anthropic:claude-opus-5-5', 'anthropic:claude-sonnet-5-5', 'anthropic:claude-haiku-5-5', 'anthropic:claude-fable-5-2', 'openrouter:google/gemini-2.5-pro', 'openrouter:openai/gpt-5', 'openrouter:deepseek/deepseek-chat', 'openrouter:anthropic/claude-sonnet-5-5', 'ollama:qwen2.5-coder', 'litellm:mi-modelo'];

const S = {
  st: null, view: 'chat', projectId: store.get('projectId', null), chatId: null, chat: null,
  streaming: false, abort: null, attachments: [], agent: 'auto', mode: store.get('mode', ''), effort: store.get('effort', 'auto'), panelTab: 'board', artifactId: null,
  artifacts: [], lastPlan: null, code: [],
};

async function api(method, url, body) {
  const r = await fetch(url, { method, headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined });
  if (!r.ok) throw new Error((await r.text()) || r.statusText);
  const t = await r.text();
  return t ? JSON.parse(t) : null;
}
function toast(msg) { const t = document.createElement('div'); t.className = 'toast'; t.textContent = msg; document.body.appendChild(t); setTimeout(() => t.remove(), 2600); }

// ---------- Markdown ----------
marked.use({
  gfm: true, breaks: false,
  renderer: {
    code(tok) {
      const info = (tok.lang || '').trim();
      const lang = info.split(/\s+/)[0] || '';
      const pm = info.match(/path=(\S+)/);
      const i = S.code.push({ text: tok.text, lang, path: pm ? pm[1] : null }) - 1;
      const label = pm ? `<span class="p">${esc(pm[1])}</span>` : `<span>${esc(lang || 'texto')}</span>`;
      const save = pm ? `<button data-act="save-code" data-ci="${i}">Guardar en proyecto</button>` : '';
      const preview = (lang === 'html' || lang === 'svg') ? `<button data-act="preview-code" data-ci="${i}">Vista previa</button>` : '';
      return `<div class="codeblock"><div class="cb-head">${label}<span class="sp"></span>${preview}${save}<button data-act="copy-code" data-ci="${i}">Copiar</button></div><pre><code>${esc(tok.text)}</code></pre></div>`;
    },
  },
});
const md = text => DOMPurify.sanitize(marked.parse(text || ''), { ADD_ATTR: ['target'] });

// ---------- Estado global ----------
async function loadState() {
  S.st = await api('GET', '/api/state');
  api('GET', '/api/claude/limits').then(l => { S.limits = l; if (S.view === 'chat') drawLimitBanner(); }).catch(() => {});
  const projects = S.st.projects;
  if (!projects.some(p => p.id === S.projectId)) S.projectId = projects.find(p => p.path)?.id || projects[0]?.id || null;
  renderSidebar();
}
const project = () => S.st?.projects.find(p => p.id === S.projectId) || null;
const agents = () => S.st?.agents || [];
const agentById = id => agents().find(a => a.id === id);

function setProject(id) {
  S.projectId = id; store.set('projectId', id);
  if (S.chat && S.chat.projectId !== id) { S.chatId = null; S.chat = null; }
  renderSidebar(); render(); if (document.body.classList.contains('panel-open')) renderPanel();
}

// ---------- Sidebar ----------
function renderSidebar() {
  const p = project();
  $('#projName').textContent = p ? p.name : 'Sin proyecto';
  $('.proj-switch .proj-dot').style.background = p?.color || 'var(--faint)';
  $('#planBadge').textContent = S.st.config.license?.plan || 'self-hosted';
  const spend = S.st.monthSpend || 0;
  const chip = $('#spendChip');
  chip.classList.toggle('hidden', !spend);
  chip.textContent = 'Mes: ' + fmtUsd(spend);
  const chats = S.st.chats.filter(c => c.projectId === S.projectId).slice(0, 40);
  $('#recents').innerHTML = `<h4>Recientes${p ? ' · ' + esc(p.name) : ''}</h4>` + (chats.length ? chats.map(c =>
    `<div class="chat-link ${c.id === S.chatId ? 'active' : ''}" data-chat="${c.id}" role="button" tabindex="0"><span class="t">${c.routineId ? '' : ''}${esc(c.title || 'Nuevo chat')}</span><button class="x" data-del-chat="${c.id}" title="Borrar">${ico('x', 14)}</button></div>`).join('')
    : '<div class="muted" style="font-size:13px;padding:4px 10px">Aún no hay chats.</div>');
  $$('.nav-item[data-view]').forEach(b => b.classList.toggle('active', b.dataset.view === S.view && S.view !== 'chat'));
}

$('#recents').addEventListener('click', async e => {
  const del = e.target.closest('[data-del-chat]');
  if (del) {
    e.stopPropagation();
    if (!await ask('¿Borrar este chat?', { ok: 'Eliminar', danger: true })) return;
    await api('DELETE', '/api/chats/' + del.dataset.delChat);
    if (S.chatId === del.dataset.delChat) { S.chatId = null; S.chat = null; }
    await loadState(); render(); return;
  }
  const c = e.target.closest('[data-chat]');
  if (c) openChat(c.dataset.chat);
});

$('#newChat').onclick = () => { S.view = 'chat'; S.chatId = null; S.chat = null; S.attachments = []; renderSidebar(); render(); };
$$('[data-view]').forEach(b => b.onclick = () => { S.view = b.dataset.view; renderSidebar(); render(); });
$('#toggleSide').onclick = () => { document.body.classList.toggle('collapsed'); store.set('collapsed', document.body.classList.contains('collapsed') ? '1' : '0'); syncOpenSide(); };
$('#openSide').onclick = () => { document.body.classList.remove('collapsed'); store.set('collapsed', '0'); syncOpenSide(); };
function syncOpenSide() { $('#openSide').classList.toggle('hidden', !document.body.classList.contains('collapsed') || innerWidth > 860); }
$('#themeBtn').onclick = () => {
  const cur = document.documentElement.dataset.theme || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  const next = cur === 'dark' ? 'light' : 'dark';
  document.documentElement.dataset.theme = next; store.set('theme', next);
};
$('#projSwitch').onclick = e => {
  const items = S.st.projects.map(p => ({ label: `<span class="proj-dot" style="background:${esc(p.color || '#999')}"></span>${esc(p.name)}${p.id === S.projectId ? ' ' + ico('tick', 14) : ''}`, run: () => setProject(p.id) }));
  items.push('-', { label: ico('plus', 15) + ' Nuevo proyecto desde carpeta…', run: newProjectFromFolder }, { label: ico('settings', 15) + ' Gestionar proyectos', run: () => { S.view = 'projects'; renderSidebar(); render(); } });
  menu(e.currentTarget, items);
};

function menu(anchor, items) {
  $$('.menu').forEach(m => m.remove());
  const m = document.createElement('div'); m.className = 'menu';
  items.forEach(it => {
    if (it === '-') { m.insertAdjacentHTML('beforeend', '<div class="sep"></div>'); return; }
    const b = document.createElement('button'); b.innerHTML = it.label; b.onclick = () => { m.remove(); it.run(); }; m.appendChild(b);
  });
  document.body.appendChild(m);
  const r = anchor.getBoundingClientRect();
  const top = Math.min(r.bottom + 4, innerHeight - m.offsetHeight - 8);
  m.style.left = Math.min(r.left, innerWidth - m.offsetWidth - 8) + 'px';
  m.style.top = (top < 8 ? r.top - m.offsetHeight - 4 : top) + 'px';
  setTimeout(() => document.addEventListener('click', function off(ev) { if (!m.contains(ev.target)) { m.remove(); document.removeEventListener('click', off); } }), 0);
}

// Diálogos propios (en lugar de confirm/prompt del navegador)
function ask(message, { ok = 'Aceptar', cancel = 'Cancelar', danger = false } = {}) {
  return new Promise(resolve => {
    const o = modal('', `<div class="ask">${esc(message).replace(/\n/g, '<br>')}</div>`, [
      { label: cancel, run: () => resolve(false) },
      { label: ok, cls: danger ? 'danger-solid' : 'primary', run: () => resolve(true) },
    ]);
    o.querySelector('header').remove();
    const x = () => resolve(false);
    o.addEventListener('mousedown', e => { if (e.target === o) x(); });
    o.addEventListener('keydown', e => { if (e.key === 'Enter') { o.querySelector('footer .btn:last-child').click(); } if (e.key === 'Escape') { o.remove(); x(); } });
    setTimeout(() => o.querySelector('footer .btn:last-child').focus(), 0);
  });
}
function askText(message, value = '', { placeholder = '', secret = false, ok = 'Aceptar' } = {}) {
  return new Promise(resolve => {
    const o = modal('', `<div class="form"><label>${esc(message).replace(/\n/g, '<br>')}<input type="${secret ? 'password' : 'text'}" id="askIn" value="${esc(value)}" placeholder="${esc(placeholder)}" autocomplete="off"></label></div>`, [
      { label: 'Cancelar', run: () => resolve(null) },
      { label: ok, cls: 'primary', run: o => resolve(o.querySelector('#askIn').value) },
    ]);
    o.querySelector('header').remove();
    const inp = o.querySelector('#askIn');
    o.addEventListener('mousedown', e => { if (e.target === o) resolve(null); });
    inp.addEventListener('keydown', e => { if (e.key === 'Enter') o.querySelector('footer .btn:last-child').click(); if (e.key === 'Escape') { o.remove(); resolve(null); } });
    setTimeout(() => { inp.focus(); inp.select(); }, 0);
  });
}

// Menú contextual propio (el de Edge está desactivado en la ventana nativa)
document.addEventListener('contextmenu', e => {
  const field = e.target.closest('input, textarea, [contenteditable="true"]');
  const sel = String(getSelection() || '');
  if (!field && !sel) { e.preventDefault(); return; }
  e.preventDefault();
  const items = [];
  const exec = c => { (field || document.activeElement)?.focus(); document.execCommand(c); };
  if (field && !field.readOnly && sel) items.push({ label: ico('x', 15) + ' Cortar', run: () => exec('cut') });
  if (sel) items.push({ label: ico('copy', 15) + ' Copiar', run: async () => { try { await navigator.clipboard.writeText(sel); } catch { exec('copy'); } } });
  if (field && !field.readOnly) items.push({ label: ico('download', 15) + ' Pegar', run: async () => {
    try { const t = await navigator.clipboard.readText(); field.focus(); document.execCommand('insertText', false, t); } catch { toast('Usa Ctrl+V para pegar'); }
  } });
  if (field) items.push({ label: ico('tick', 15) + ' Seleccionar todo', run: () => { field.focus(); field.select ? field.select() : document.execCommand('selectAll'); } });
  const a = document.createElement('div'); a.style.cssText = `position:fixed;left:${e.clientX}px;top:${e.clientY}px;width:1px;height:1px`; document.body.appendChild(a);
  menu(a, items); setTimeout(() => a.remove(), 0);
});

function modal(title, bodyHtml, buttons = []) {
  const o = document.createElement('div'); o.className = 'overlay';
  o.innerHTML = `<div class="modal"><header>${title}<span style="flex:1"></span><button class="icon-btn" data-close>${ico('x', 14)}</button></header><div class="body">${bodyHtml}</div><footer></footer></div>`;
  const close = () => o.remove();
  o.addEventListener('mousedown', e => { if (e.target === o) close(); });
  $('[data-close]', o).onclick = close;
  for (const b of buttons) {
    const el = document.createElement('button'); el.className = 'btn ' + (b.cls || ''); el.textContent = b.label;
    el.onclick = async () => { try { const keep = b.run ? await b.run(o) : undefined; if (keep !== true) close(); } catch (err) { toast(err.message); } };
    $('footer', o).appendChild(el);
  }
  document.body.appendChild(o);
  return o;
}

// ---------- Router de vistas ----------
function render() {
  S.code = [];
  const v = $('#view');
  $('#composerWrap').innerHTML = '';
  const titleEl = $('#chatTitle');
  titleEl.classList.toggle('hidden', S.view !== 'chat' || !S.chat);
  if (S.view === 'chat') return renderChat();
  const views = { chats: viewChats, projects: viewProjects, artifacts: viewArtifacts, agents: viewAgents, extensions: viewExtensions, routines: viewRoutines, usage: viewUsage, settings: viewSettings };
  v.innerHTML = '<div class="page"><div class="muted">Cargando…</div></div>';
  (views[S.view] || viewChats)(v).catch(err => { v.innerHTML = `<div class="page err">${esc(err.message)}</div>`; });
}

// ---------- Chat ----------
async function openChat(id) {
  S.view = 'chat'; S.chatId = id; S.attachments = [];
  S.chat = await api('GET', '/api/chats/' + id);
  if (S.chat.projectId && S.chat.projectId !== S.projectId) { S.projectId = S.chat.projectId; store.set('projectId', S.projectId); }
  await refreshArtifacts();
  renderSidebar(); render();
}

async function refreshArtifacts() {
  if (!S.projectId) { S.artifacts = []; return; }
  S.artifacts = await api('GET', '/api/artifacts?projectId=' + encodeURIComponent(S.projectId)).catch(() => []);
}

function renderChat() {
  const v = $('#view');
  const empty = !S.chat || !S.chat.messages.length;
  $('#chatTitle').value = S.chat?.title || '';
  if (empty) {
    const p = project();
    const hour = new Date().getHours();
    const nm = S.st.config.profile?.name ? ', ' + S.st.config.profile.name : '';
    const greet = (hour < 6 ? 'Trabajando tarde' : hour < 13 ? 'Buenos días' : hour < 21 ? 'Buenas tardes' : 'Buenas noches') + nm;
    v.innerHTML = `<div class="home"><div class="greet"><img src="/icon.svg" alt=""><span>${greet}${p ? ', ¿qué hacemos en <i>' + esc(p.name) + '</i>?' : ''}</span></div><div id="homeComposer" style="width:100%;display:flex;justify-content:center"></div>
      <div class="suggest">${suggestions().map(s => `<button data-sug="${esc(s)}">${esc(s)}</button>`).join('')}</div></div>`;
    $('#homeComposer').appendChild(composer());
    drawLimitBanner();
    $$('[data-sug]').forEach(b => b.onclick = () => { const ta = $('#prompt'); ta.value = b.dataset.sug; ta.focus(); autosize(ta); });
    $('#prompt')?.focus();
    return;
  }
  v.innerHTML = `<div class="thread" id="thread">${S.chat.messages.map(renderMessage).join('')}</div>`;
  $('#composerWrap').appendChild(composer());
  drawLimitBanner();
  $('#composerWrap').insertAdjacentHTML('beforeend', '<div class="hint">El orquestador reparte la tarea entre agentes. Revisa los cambios antes de aplicarlos.</div>');
  v.scrollTop = v.scrollHeight;
}

function drawLimitBanner() {
  $$('.limit-banner').forEach(e => e.remove());
  const info = S.limits?.info; if (!info) return;
  const w = info.unifiedWindows || {};
  const hot = Object.entries(w).filter(([, v]) => (v.utilization || 0) >= 0.7).sort((a, b) => b[1].utilization - a[1].utilization)[0];
  if (info.status !== 'rejected' && info.status !== 'allowed_warning' && !hot) return;
  const type = hot ? hot[0] : info.rateLimitType, win = hot ? hot[1] : info;
  const key = type + ':' + win.resetsAt;
  if (store.get('limitBannerHidden', '') === key) return;
  const what = type === 'five_hour' ? 'de la sesión' : 'semanal';
  const d = win.resetsAt ? new Date(win.resetsAt * 1000) : null;
  const when = d ? d.toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' }) + ', ' + d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }) : '';
  const html = `<div class="limit-banner ${info.status === 'rejected' ? 'bad' : ''}">${ico('clock', 15)}<b>${info.status === 'rejected' ? 'Has alcanzado el límite de uso ' + what : 'Acercándose al límite de uso ' + what}</b><span class="muted">${when ? 'Se restablece el ' + when : ''} · ${Math.round((win.utilization || 0) * 100)} %</span><span style="flex:1"></span><button class="btn sm" data-lb="usage">Ver uso</button><button class="icon-btn" data-lb="x" title="Ocultar">${ico('x', 14)}</button></div>`;
  const host = $('#homeComposer') || $('#composerWrap');
  if (!host) return;
  host.insertAdjacentHTML('afterbegin', html);
  const b = $('.limit-banner');
  $('[data-lb=usage]', b).onclick = () => { S.view = 'settings'; S.settingsTab = 'usage'; renderSidebar(); render(); };
  $('[data-lb=x]', b).onclick = () => { store.set('limitBannerHidden', key); b.remove(); };
}

function suggestions() {
  const p = project();
  const mc = agentById('launcher') || /minecraft|mod |fabric|forge/i.test(p?.brief || '');
  if (mc) return ['¿Por qué crashea mi instancia?', 'Modelo 3D y animaciones para un mob nuevo', 'Diseña un bioma y su lore', 'Busca la última versión de Fabric API'];
  if (p?.path) return ['Explícame la estructura de este proyecto', 'Busca bugs probables en el código', 'Propón las 3 mejoras más importantes', 'Escribe el README'];
  return ['Compara modelos para generar código', 'Ayúdame a planificar un proyecto nuevo', 'Busca información actual sobre un tema', 'Resume una idea en puntos'];
}

function agentBadge(a, model) {
  const ag = agentById(a) || {};
  return `<span class="agent-ico" style="background:${esc(ag.color || '#999')}22">${agentIcon(ag, 15)}</span><span class="name">${esc(ag.name || a)}</span>${model ? `<span class="model">${esc(model)}</span>` : ''}`;
}

function usageMeta(u) {
  if (!u) return '';
  if (u.demo) return '<span>demo</span>';
  const tok = (u.input || 0) + (u.output || 0) + (u.cacheRead || 0);
  return `<span title="entrada ${fmtN(u.input)} · salida ${fmtN(u.output)} · caché ${fmtN(u.cacheRead)}">${fmtTok(tok)} tok</span>${u.cost ? `<span>${fmtUsd(u.cost)}</span>` : ''}`;
}

function artChip(id, title, version, applied) {
  return `<button class="art-chip ${applied ? 'applied' : ''}" data-art="${esc(id)}">${ico('layers', 14)} ${esc(title)} <span class="v">v${version}</span></button>`;
}

function renderStep(s, single, open = true) {
  const tools = (s.tools || []).map(t => `<div class="tool-row">${ico('wrench', 13)} <b>${esc(t.name)}</b> ${esc(t.input)}</div>`).join('');
  const arts = (s.artifacts || []).map(id => { const a = S.artifacts.find(x => x.id === id); return a ? artChip(a.id, a.title, a.versions, a.appliedVersion) : ''; }).join('');
  return `<div class="step ${single ? 'single' : ''} ${open ? '' : 'closed'}" data-step="${esc(s.id)}">
    <div class="step-head">${agentBadge(s.agentId, s.model)}<span class="meta">${usageMeta(s.usage)}${single ? '' : '<span class="caret">' + ico('chevron', 14) + '</span>'}</span></div>
    <div class="step-body">${!single && s.task ? `<div class="step-task">${esc(s.task.slice(0, 400))}</div>` : ''}<div class="tools">${tools}</div><div class="md ${s.error ? 'err' : ''}">${md(s.text)}</div>${arts ? `<div class="art-chips">${arts}</div>` : ''}</div></div>`;
}

function renderMessage(m) {
  if (m.role === 'user') {
    const att = (m.attachments || []).map(f => `<span class="chip">${ico('file', 13)} ${esc(f)}</span>`).join('');
    const md0 = m.mode && m.mode !== 'auto' ? MODES.find(x => x.id === m.mode) : null;
    return `<div class="msg-user"><div>${md0 ? `<div class="att" style="margin:0 0 4px"><span class="chip">${ico(md0.icon, 12)} ${md0.label}</span></div>` : ''}<div class="bubble">${esc(m.content)}</div>${att ? `<div class="att">${att}</div>` : ''}</div></div>`;
  }
  const steps = m.steps || [];
  if (!steps.length) return `<div class="msg-ai"><div class="step single"><div class="step-head">${agentBadge('orquestador')}<span class="meta">${usageMeta(m.planUsage)}</span></div><div class="md">${md(m.content)}</div></div></div>`;
  const plan = steps.length > 1 ? `<div class="plan-line">Plan: ${steps.map(s => `${agentIcon(agentById(s.agentId), 14)} ${esc(s.agentName)}`).join(' <span class="arrow">→</span> ')}${m.planUsage ? ` · <span title="Planificación">${usageMeta(m.planUsage)}</span>` : ''}</div>` : '';
  return `<div class="msg-ai">${plan}${steps.map(s => renderStep(s, steps.length === 1, true)).join('')}</div>`;
}

function composer() {
  const wrap = document.createElement('div');
  wrap.className = 'composer';
  const ags = agents().filter(a => a.id !== 'orquestador');
  wrap.innerHTML = `<div class="att" id="attList"></div>
    <div class="ta-wrap"><div class="ta-mirror" id="taMirror" aria-hidden="true"></div><textarea id="prompt" rows="1" spellcheck="false" placeholder="${S.chat?.messages?.length ? 'Responde…' : '¿En qué te ayudo hoy?'}"></textarea></div>
    <div class="composer-bar">
      <button class="icon-btn" id="attachBtn" title="Adjuntar archivos del proyecto">${ico('plus', 18)}</button>
      <button class="picker" id="agentPick" title="Quién responde"></button>
      <button class="picker" id="modePick" title="Modo de permisos"></button>
      <button class="picker" id="effPick" title="Nivel de esfuerzo"></button>
      <span class="spacer"></span>
      ${S.st.config.routing.economy ? `<span class="chip eco" title="Modo ahorro: se prueban primero los modelos gratuitos">${ico('zap', 12)} ahorro</span>` : ''}
      <button class="send ${S.streaming ? 'stop' : ''}" id="sendBtn" title="${S.streaming ? 'Dejar de mostrar' : 'Enviar'}">${S.streaming ? ico('stop', 14) : ico('arrowUp', 17, 2.2)}</button>
    </div>`;
  const ta = $('#prompt', wrap), pick = $('#agentPick', wrap), sendBtn = $('#sendBtn', wrap);
  const drawPick = () => {
    const a = S.agent === 'auto' ? null : agentById(S.agent);
    pick.innerHTML = a ? `${agentIcon(a, 15)}<span>${esc(a.name)}</span><span class="m">${esc(a.model.split(':').pop())}</span>${ico('chevron', 14)}`
      : `${agentIcon(agentById('orquestador'), 15)}<span>Equipo</span>${ico('chevron', 14)}`;
  };
  drawPick();
  const modePick = $('#modePick', wrap), effPick = $('#effPick', wrap);
  const drawMode = () => { const m = MODES.find(x => x.id === curMode()) || MODES[0]; modePick.innerHTML = `${ico(m.icon, 14)}<span>${m.label}</span>`; modePick.classList.toggle('warn', m.id === 'bypass'); };
  const drawEff = () => { const e = EFFORTS.find(x => x[0] === S.effort) || EFFORTS[0]; effPick.innerHTML = `${ico('chart', 14)}<span>${S.effort === 'agent' ? 'Esfuerzo' : S.effort === 'auto' ? 'Esfuerzo auto' : e[1]}</span>`; };
  drawMode(); drawEff();
  modePick.addEventListener('redraw', drawMode); effPick.addEventListener('redraw', drawEff);
  const EFF_DESC = { auto: 'El orquestador decide por tarea: bajo para lo simple, alto para lo complejo', agent: 'El configurado en cada agente (por defecto, medio)', low: 'Rápido y barato', medium: 'Equilibrado', high: 'Piensa más', xhigh: 'Para tareas difíciles', max: 'Sin límite de razonamiento' };
  modePick.onclick = () => menu(modePick, MODES.map(m => ({ label: `${ico(m.icon, 16)}<div><div>${m.label}${m.id === curMode() ? ' ' + ico('tick', 13) : ''}</div><div class="sub wrap">${m.desc}</div></div>`, run: () => { S.mode = m.id; store.set('mode', m.id); drawMode(); } })));
  effPick.onclick = () => menu(effPick, EFFORTS.map(([k, l]) => ({ label: `${ico('chart', 16)}<div><div>${l}${k === S.effort ? ' ' + ico('tick', 13) : ''}</div><div class="sub wrap">${EFF_DESC[k]}</div></div>`, run: () => { S.effort = k; store.set('effort', k); drawEff(); } })));
  pick.onclick = () => menu(pick, [
    { label: `${agentIcon(agentById('orquestador'), 16)}<div><div>Equipo (automático)</div><div class="sub">El orquestador reparte entre agentes</div></div>`, run: () => { S.agent = 'auto'; drawPick(); } },
    '-',
    ...ags.map(a => ({ label: `${agentIcon(a, 16)}<div><div>${esc(a.name)}</div><div class="sub">${esc(a.model)}</div></div>`, run: () => { S.agent = a.id; drawPick(); } })),
  ]);
  ta.addEventListener('input', () => { autosize(ta); sendBtn.disabled = !S.streaming && !ta.value.trim(); });
  setupSpell(ta, $('#taMirror', wrap));
  ta.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); if (!S.streaming) send(); } });
  sendBtn.disabled = !S.streaming;
  sendBtn.onclick = () => S.streaming ? stopStream() : send();
  $('#attachBtn', wrap).onclick = () => menu($('#attachBtn', wrap), [
    { label: ico('folder', 16) + '<div><div>Archivo del proyecto</div><div class="sub">Código, textos, modelos…</div></div>', run: attachDialog },
    { label: ico('file', 16) + '<div><div>Archivo del PC</div><div class="sub">PDF, Word, Excel, PowerPoint, vídeo, audio, imagen…</div></div>', run: async () => {
      const r = await api('POST', '/api/pick-file').catch(e => ({ error: e.message }));
      if (r.path) { S.attachments = [...new Set([...S.attachments, r.path])]; renderAttachments(); }
    } },
  ]);
  renderAttachments(wrap);
  return wrap;
}
function curMode() { return S.mode || S.st?.config?.defaults?.mode || 'auto'; }
// ---------- Corrector (estilo Google Docs) ----------
function setupSpell(ta, mirror) {
  let matches = [], timer, seq = 0;
  const ignored = () => { try { return JSON.parse(store.get('spellIgnore', '[]')); } catch { return []; } };
  const on = () => S.st?.config?.profile?.spellcheck !== false;
  const draw = () => {
    const t = ta.value; let html = '', last = 0;
    matches.forEach((m, i) => {
      if (m.offset < last) return;
      html += esc(t.slice(last, m.offset)) + `<mark class="${m.type === 'misspelling' ? 'gerr' : 'gstyle'}" data-i="${i}">${esc(t.slice(m.offset, m.offset + m.length))}</mark>`;
      last = m.offset + m.length;
    });
    mirror.innerHTML = html + esc(t.slice(last)) + '\n';
    mirror.scrollTop = ta.scrollTop;
  };
  const check = async () => {
    const my = ++seq, text = ta.value;
    if (!on() || text.trim().length < 4) { matches = []; draw(); return; }
    try {
      const r = await api('POST', '/api/grammar', { text, language: S.st.config.profile?.spellLang || 'auto' });
      if (my !== seq || ta.value !== text) return;
      const ig = ignored();
      matches = r.matches.filter(m => !ig.includes(text.slice(m.offset, m.offset + m.length).toLowerCase()));
      draw();
    } catch { /* sin conexión o límite: no molestar */ }
  };
  ta.addEventListener('input', () => { matches = []; draw(); clearTimeout(timer); timer = setTimeout(check, 900); });
  ta.addEventListener('scroll', () => { mirror.scrollTop = ta.scrollTop; });
  const suggest = () => {
    const p = ta.selectionStart; const i = matches.findIndex(m => p >= m.offset && p <= m.offset + m.length);
    if (i < 0 || ta.selectionEnd !== p) return;
    const m = matches[i]; const mark = mirror.querySelector(`[data-i="${i}"]`); if (!mark) return;
    const word = ta.value.slice(m.offset, m.offset + m.length);
    const apply = v => { ta.value = ta.value.slice(0, m.offset) + v + ta.value.slice(m.offset + m.length); ta.focus(); ta.selectionStart = ta.selectionEnd = m.offset + v.length; ta.dispatchEvent(new Event('input')); };
    const items = [{ label: `<div class="sub wrap" style="max-width:320px">${esc(m.message)}</div>`, run: () => {} }, '-'];
    m.replacements.forEach(r => items.push({ label: `<b>${esc(r)}</b>`, run: () => apply(r) }));
    if (m.type === 'misspelling') items.push('-', { label: ico('x', 14) + ' Ignorar «' + esc(word) + '»', run: () => { const ig = ignored(); ig.push(word.toLowerCase()); store.set('spellIgnore', JSON.stringify(ig)); matches.splice(i, 1); draw(); } });
    menu(mark, items);
  };
  ta.addEventListener('click', suggest);
  ta.addEventListener('keydown', e => { if (e.ctrlKey && e.key === ' ') { e.preventDefault(); suggest(); } });
}

function autosize(ta) { ta.style.height = 'auto'; ta.style.height = Math.min(ta.scrollHeight, 280) + 'px'; }
function renderAttachments(root = document) {
  const el = $('#attList', root); if (!el) return;
  el.innerHTML = S.attachments.map((f, i) => `<span class="chip">${ico('file', 13)} ${esc(f)}<button data-rm-att="${i}">${ico('x', 14)}</button></span>`).join('');
  $$('[data-rm-att]', el).forEach(b => b.onclick = () => { S.attachments.splice(+b.dataset.rmAtt, 1); renderAttachments(); });
}

async function attachDialog() {
  const p = project();
  if (!p?.path) return toast('Este proyecto no tiene carpeta. Asígnale una en Proyectos.');
  const { files } = await api('GET', `/api/projects/${p.id}/tree`);
  const o = modal('Adjuntar archivos de ' + esc(p.name), `<input type="text" id="ff" placeholder="Filtrar… (ej. lang, models/item, .java)"><div class="file-list" id="fl" style="margin-top:10px"></div><p class="muted" style="font-size:12.5px">Los agentes con herramientas ya pueden leer el proyecto por su cuenta; adjunta solo si quieres forzar contexto.</p>`,
    [{ label: 'Cancelar' }, { label: 'Adjuntar', cls: 'primary', run: o => { S.attachments = [...new Set([...S.attachments, ...$$('input[type=checkbox]:checked', o).map(c => c.value)])].slice(0, 8); renderAttachments(); } }]);
  const draw = q => { $('#fl', o).innerHTML = files.filter(f => f.toLowerCase().includes(q.toLowerCase())).slice(0, 400).map(f => `<label><input type="checkbox" value="${esc(f)}" ${S.attachments.includes(f) ? 'checked' : ''}>${esc(f)}</label>`).join('') || '<div class="muted">Sin coincidencias</div>'; };
  draw(''); $('#ff', o).oninput = e => draw(e.target.value); $('#ff', o).focus();
}

$('#chatTitle').addEventListener('change', async e => {
  if (!S.chat) return;
  S.chat.title = e.target.value.trim() || 'Nuevo chat';
  await api('PATCH', '/api/chats/' + S.chat.id, { title: S.chat.title });
  const c = S.st.chats.find(x => x.id === S.chat.id); if (c) c.title = S.chat.title;
  renderSidebar();
});

function stopStream() { S.abort?.abort(); }

async function send() {
  const ta = $('#prompt'); const text = ta.value.trim();
  if (!text || S.streaming) return;
  if (!S.chat) {
    S.chat = await api('POST', '/api/chats', { projectId: S.projectId });
    S.chatId = S.chat.id;
  }
  const attachments = [...S.attachments];
  S.chat.messages.push({ role: 'user', content: text, attachments, mode: curMode() });
  S.attachments = [];
  S.streaming = true;
  render();
  const thread = $('#thread');
  const live = document.createElement('div'); live.className = 'msg-ai';
  live.innerHTML = `<div class="status-line" id="liveStatus"><svg class="spark" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M18.4 5.6l-2.8 2.8M8.4 15.6l-2.8 2.8"/></svg><span>Pensando…</span></div>`;
  thread.appendChild(live);
  const view = $('#view');
  const stick = () => { if (view.scrollHeight - view.scrollTop - view.clientHeight < 260) view.scrollTop = view.scrollHeight; };
  stick();

  const steps = {}; // stepId -> {el, text, dirty}
  let single = false;
  const flush = () => { for (const s of Object.values(steps)) if (s.dirty) { $('.md', s.el).innerHTML = md(s.text); s.dirty = false; } stick(); };
  const timer = setInterval(flush, 70);
  const status = t => { const st = $('#liveStatus span', live); if (st) st.textContent = t; };

  S.abort = new AbortController();
  try {
    const res = await fetch(`/api/chats/${S.chat.id}/send`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text, agentId: S.agent, attachments, mode: curMode(), effort: S.effort === 'agent' ? '' : S.effort }), signal: S.abort.signal });
    if (!res.ok) throw new Error(await res.text());
    const reader = res.body.getReader(); const dec = new TextDecoder(); let buf = '';
    for (;;) {
      const { value, done } = await reader.read(); if (done) break;
      buf += dec.decode(value, { stream: true });
      let i;
      while ((i = buf.indexOf('\n\n')) >= 0) {
        const raw = buf.slice(0, i); buf = buf.slice(i + 2);
        let ev = 'message', data = '';
        for (const line of raw.split('\n')) { if (line.startsWith('event:')) ev = line.slice(6).trim(); else if (line.startsWith('data:')) data += line.slice(5).trim(); }
        if (!data) continue;
        const d = JSON.parse(data);
        handle(ev, d);
      }
    }
  } catch (err) {
    if (err.name === 'AbortError') status('Dejé de mostrarlo aquí; el trabajo sigue y quedará guardado en el chat.');
    else live.insertAdjacentHTML('beforeend', `<div class="err">${ico('alert', 14)} ${esc(err.message)}</div>`);
  } finally {
    clearInterval(timer); flush();
    S.streaming = false; S.abort = null;
    try {
      S.chat = await api('GET', '/api/chats/' + S.chat.id);
      await refreshArtifacts(); await loadState();
    } catch {}
    if (S.view === 'chat') render();
    if (document.body.classList.contains('panel-open')) renderPanel();
  }

  function handle(ev, d) {
    if (ev === 'status') status(d.text);
    else if (ev === 'plan') {
      S.lastPlan = { steps: d.steps, ctx: {} };
      if (d.reply) { $('#liveStatus', live)?.remove(); live.insertAdjacentHTML('beforeend', `<div class="step single"><div class="step-head">${agentBadge('orquestador')}</div><div class="md">${md(d.reply)}</div></div>`); return; }
      single = d.steps.length === 1;
      if (!single) live.insertAdjacentHTML('afterbegin', `<div class="plan-line">Plan: ${d.steps.map(s => `${agentIcon(agentById(s.agent), 14)} ${esc(s.agentName || s.agent)}`).join(' <span class="arrow">→</span> ')}</div>`);
      status(single ? 'Trabajando…' : `Ejecutando ${d.steps.length} pasos…`);
    } else if (ev === 'step_start') {
      S.lastPlan && (S.lastPlan.ctx[d.stepId] = d);
      const html = renderStep({ id: d.stepId, agentId: d.agent, model: d.model, task: d.task, text: '' }, single, true);
      $('#liveStatus', live)?.insertAdjacentHTML('beforebegin', html);
      const el = $(`[data-step="${CSS.escape(d.stepId)}"]`, live);
      $('.meta', el).insertAdjacentHTML('afterbegin', `<span class="dot run"></span>${d.effort ? `<span class="chip effchip" title="Esfuerzo de este paso">${esc({ low: 'bajo', medium: 'medio', high: 'alto', xhigh: 'muy alto', max: 'máximo' }[d.effort] || d.effort)}</span>` : ''}<span title="Contexto estimado enviado">~${fmtTok(d.context?.estTokens || 0)} ctx</span>`);
      steps[d.stepId] = { el, text: '', dirty: false };
      if (document.body.classList.contains('panel-open') && S.panelTab === 'board') renderPanel();
    } else if (ev === 'delta') { const s = steps[d.stepId]; if (s) { s.text += d.text; s.dirty = true; } }
    else if (ev === 'tool') { const s = steps[d.stepId]; if (s) { const inp = Object.entries(d.input || {}).map(([k, v]) => `${k}=${typeof v === 'string' ? v : JSON.stringify(v)}`).join(' '); $('.tools', s.el).insertAdjacentHTML('beforeend', `<div class="tool-row">${ico('wrench', 13)} <b>${esc(d.name)}</b> ${esc(inp.slice(0, 200))}</div>`); } }
    else if (ev === 'artifact') {
      const s = steps[d.stepId]; if (!s) return;
      let box = $('.art-chips', s.el); if (!box) { $('.step-body', s.el).insertAdjacentHTML('beforeend', '<div class="art-chips"></div>'); box = $('.art-chips', s.el); }
      $(`[data-art="${CSS.escape(d.id)}"]`, box)?.remove();
      box.insertAdjacentHTML('beforeend', artChip(d.id, d.title, d.version, d.applied));
    } else if (ev === 'step_done') {
      const s = steps[d.stepId]; if (!s) return;
      const meta = $('.meta', s.el); $('.dot', meta)?.remove();
      const mc = $('.model', s.el); if (mc && d.model) mc.textContent = d.model;
      if (d.fallbacks?.length) $('.tools', s.el).insertAdjacentHTML('afterbegin', `<div class="tool-row" title="${esc(d.fallbacks.join('\n'))}">${ico('refresh', 13)} <b>respaldo</b> ${d.fallbacks.length} modelo(s) fallaron; se usó ${esc(d.model)}</div>`);
      meta.insertAdjacentHTML('afterbegin', usageMeta(d.usage));
    } else if (ev === 'step_error') { const s = steps[d.stepId]; if (s) { s.text += `\n\n> Error: ${d.error}`; s.dirty = true; } }
    else if (ev === 'approval') {
      const s = steps[d.stepId]; const host = s ? $('.step-body', s.el) : live;
      const what = { edit: 'quiere escribir un archivo', exec: 'quiere ejecutar un comando', mcp: 'quiere hacer un cambio' }[d.kind] || 'pide permiso';
      host.insertAdjacentHTML('beforeend', `<div class="approval" data-ap="${esc(d.id)}"><div class="row">${ico(d.kind === 'exec' ? 'code' : d.kind === 'mcp' ? 'plug' : 'pencil', 16)}<b>${esc(d.tool)}</b><span class="muted">${what}</span></div><pre>${esc(d.detail)}</pre><div class="row"><button class="btn primary sm" data-allow="1">Permitir</button><button class="btn sm" data-allow="0">Denegar</button></div></div>`);
      stick();
    } else if (ev === 'approval_done') {
      const el = document.querySelector(`[data-ap="${CSS.escape(d.id)}"]`);
      if (el) el.outerHTML = `<div class="tool-row">${ico(d.allowed ? 'tick' : 'x', 13)} <b>${d.allowed ? 'Permitido' : 'Denegado'}</b></div>`;
    }
    else if (ev === 'error') { $('#liveStatus', live)?.remove(); live.insertAdjacentHTML('beforeend', `<div class="err">${ico('alert', 14)} ${esc(d.error)}</div>`); }
    else if (ev === 'done') $('#liveStatus', live)?.remove();
  }
}

// Acciones delegadas: código, artefactos, pasos plegables
document.addEventListener('click', async e => {
  const head = e.target.closest('.step:not(.single) > .step-head');
  if (head) { head.parentElement.classList.toggle('closed'); return; }
  const b = e.target.closest('[data-act]');
  if (b) {
    const c = S.code[+b.dataset.ci];
    if (!c) return;
    if (b.dataset.act === 'copy-code') { await navigator.clipboard.writeText(c.text); b.textContent = 'Copiado'; setTimeout(() => b.textContent = 'Copiar', 1200); }
    if (b.dataset.act === 'preview-code') openPreview(c.text, c.lang);
    if (b.dataset.act === 'save-code') {
      const a = S.artifacts.find(x => x.path === c.path);
      if (!a) return toast('No encuentro el artefacto de ese archivo.');
      if (!await ask(`¿Escribir ${c.path} en la carpeta del proyecto? Se guarda copia del archivo anterior.`)) return;
      await api('POST', `/api/artifacts/${a.id}/apply`, { version: 0 });
      toast('Guardado ' + c.path); await refreshArtifacts();
    }
    return;
  }
  const ap = e.target.closest('[data-allow]');
  if (ap) { const card = ap.closest('[data-ap]'); $$('button', card).forEach(x => x.disabled = true); api('POST', `/api/approvals/${encodeURIComponent(card.dataset.ap)}`, { allow: ap.dataset.allow === '1' }).catch(err => toast(err.message)); return; }
  const art = e.target.closest('[data-art]');
  if (art) openArtifact(art.dataset.art);
});

// ---------- Panel derecho ----------
$('#panelBtn').onclick = () => { document.body.classList.toggle('panel-open'); if (document.body.classList.contains('panel-open')) renderPanel(); };
$('#closePanel').onclick = () => document.body.classList.remove('panel-open');
$$('#panelTabs button').forEach(b => b.onclick = () => { S.panelTab = b.dataset.tab; renderPanel(); });

function openArtifact(id) { S.artifactId = id; S.preview = null; S.panelTab = 'artifact'; document.body.classList.add('panel-open'); renderPanel(); }
function openPreview(text, lang) { S.preview = { text, lang }; S.artifactId = null; S.panelTab = 'artifact'; document.body.classList.add('panel-open'); renderPanel(); }

async function renderPanel() {
  $$('#panelTabs button').forEach(b => b.classList.toggle('on', b.dataset.tab === S.panelTab));
  const body = $('#panelBody');
  if (S.panelTab === 'board') {
    const p = project();
    if (!p) { body.innerHTML = '<div class="muted">Elige un proyecto.</div>'; return; }
    const bb = await api('GET', `/api/projects/${p.id}/blackboard`);
    const plan = S.lastPlan ? Object.values(S.lastPlan.ctx) : [];
    body.innerHTML = `
      <h3>Contexto del último envío</h3>
      ${plan.length ? plan.map(c => `<div class="ev"><span class="who">${agentIcon(agentById(c.agent), 14)} ${esc(c.agentName)}</span> <span class="muted mono">~${fmtTok(c.context?.estTokens)} tok</span>
        <div class="muted" style="font-size:12.5px;margin-top:4px">${c.mode ? (MODES.find(x => x.id === c.mode)?.label || c.mode) + ' · ' : ''}${c.effort ? 'esfuerzo ' + esc(c.effort) + ' · ' : ''}${c.context?.mcp ? ico('plug', 12) + ' ' + c.context.mcp + ' herramientas MCP · ' : ''}${c.context?.tools ? ico('wrench', 12) + ' herramientas · ' : ''}${(c.context?.files || []).length ? ico('file', 12) + ' ' + c.context.files.map(esc).join(', ') + ' · ' : ''}${(c.context?.skills || []).length ? ico('sparkle', 12) + ' ' + c.context.skills.map(esc).join(', ') : ''}</div></div>`).join('') : '<div class="muted" style="font-size:13px">Envía algo para ver qué contexto recibe cada agente.</div>'}
      <h3>Memoria del proyecto</h3>
      <div class="ev md" style="font-size:13px">${bb.summary ? md(bb.summary) : '<span class="muted">Vacía. Se rellena sola cuando la pizarra crece (compresión).</span>'}</div>
      <h3>Pizarra compartida <span class="muted" style="text-transform:none;letter-spacing:0;font-weight:400">· ${fmtTok(bb.liveTokens)} tok activos</span></h3>
      ${bb.events.length ? bb.events.slice().reverse().map(e => `<div class="ev" style="${e.compressed ? 'opacity:.55' : ''}"><span class="when">${ago(e.ts)}</span><span class="who">${esc(agentById(e.agentId)?.icon || '')} ${esc(e.agentName)}</span><div class="muted" style="font-size:12.5px;margin:2px 0 4px">${esc(e.task.slice(0, 160))}</div>${esc(e.summary)}</div>`).join('') : '<div class="muted" style="font-size:13px">Aún no hay actividad. Todo lo que hagan los agentes queda aquí resumido y lo ven los demás.</div>'}
      ${bb.events.length ? '<div style="margin-top:10px"><button class="btn sm danger" id="clearBb">Vaciar pizarra y memoria</button></div>' : ''}`;
    $('#clearBb')?.addEventListener('click', async () => { if (await ask('¿Vaciar la pizarra y la memoria de este proyecto?')) { await api('DELETE', `/api/projects/${p.id}/blackboard`); renderPanel(); } });
    return;
  }
  // Artefacto
  if (S.preview) {
    body.innerHTML = `<div class="art-view"><iframe sandbox="allow-scripts" id="prevFrame"></iframe></div>`;
    $('#prevFrame').srcdoc = S.preview.lang === 'svg' ? `<body style="margin:0;display:grid;place-items:center;height:100vh">${S.preview.text}</body>` : S.preview.text;
    return;
  }
  if (!S.artifactId) { body.innerHTML = '<div class="muted">Abre un artefacto desde el chat o desde la vista Artefactos.</div>'; return; }
  const a = await api('GET', '/api/artifacts/' + S.artifactId);
  const vIdx = Math.min(S.artVersion || a.versions.length, a.versions.length);
  const ver = a.versions[vIdx - 1];
  const previewable = ['html', 'svg'].includes(a.lang);
  const mode = S.artMode && previewable ? S.artMode : (previewable ? 'preview' : 'code');
  body.innerHTML = `<div class="art-view">
    <div class="row" style="margin-bottom:10px"><b style="font-size:15px">${ico('layers', 14)} ${esc(a.title)}</b>
      <select class="sel" id="artVer">${a.versions.map((v, i) => `<option value="${i + 1}" ${i + 1 === vIdx ? 'selected' : ''}>v${i + 1} · ${esc(agentById(v.agentId)?.name || v.agentId)} · ${ago(v.ts)}</option>`).join('')}</select>
      ${previewable ? `<div class="tabs"><button data-m="preview" class="${mode === 'preview' ? 'on' : ''}">Vista</button><button data-m="code" class="${mode === 'code' ? 'on' : ''}">Código</button></div>` : ''}</div>
    <div class="muted mono" style="margin-bottom:8px">${a.path ? esc(a.path) : 'sin ruta'} ${a.appliedVersion ? `· aplicado v${a.appliedVersion}` : '· sin aplicar'}</div>
    ${mode === 'preview' ? '<iframe sandbox="allow-scripts" id="artFrame"></iframe>' : `<pre>${esc(ver.content)}</pre>`}
    <div class="row" style="margin-top:10px">
      ${a.projectId ? `<button class="btn primary sm" id="artApply">${a.path ? 'Aplicar al proyecto' : 'Guardar en proyecto…'}</button>` : ''}
      <button class="btn sm" id="artCopy">Copiar</button><button class="btn sm" id="artDl">Descargar</button>
      <span style="flex:1"></span><button class="btn sm danger" id="artDel">Eliminar</button></div></div>`;
  if (mode === 'preview') $('#artFrame').srcdoc = a.lang === 'svg' ? `<body style="margin:0;display:grid;place-items:center;height:100vh">${ver.content}</body>` : ver.content;
  $('#artVer').onchange = e => { S.artVersion = +e.target.value; renderPanel(); };
  $$('.art-view .tabs button').forEach(b => b.onclick = () => { S.artMode = b.dataset.m; renderPanel(); });
  $('#artCopy').onclick = async () => { await navigator.clipboard.writeText(ver.content); toast('Copiado'); };
  $('#artDl').onclick = () => { const url = URL.createObjectURL(new Blob([ver.content], { type: 'text/plain' })); const l = document.createElement('a'); l.href = url; l.download = a.title; l.click(); URL.revokeObjectURL(url); };
  $('#artDel').onclick = async () => { if (!await ask('¿Eliminar este artefacto (no borra archivos del disco)?', { ok: 'Eliminar', danger: true })) return; await api('DELETE', '/api/artifacts/' + a.id); S.artifactId = null; await refreshArtifacts(); renderPanel(); };
  $('#artApply')?.addEventListener('click', async () => {
    let path = a.path;
    if (!path) { path = await askText('Ruta relativa dentro del proyecto:', a.title); if (!path) return; }
    if (!await ask(`¿Escribir ${path} (v${vIdx}) en la carpeta del proyecto? Se hace copia del anterior.`)) return;
    await api('POST', `/api/artifacts/${a.id}/apply`, { version: vIdx, path });
    toast('Aplicado: ' + path); await refreshArtifacts(); renderPanel();
  });
}

// ---------- Vistas ----------
async function viewChats(v) {
  const list = S.st.chats.filter(c => c.projectId === S.projectId);
  v.innerHTML = `<div class="page"><h1>Chats</h1><p class="lead">${esc(project()?.name || '')} · ${list.length} conversaciones</p>
    <input type="text" id="q" placeholder="Buscar en títulos…" style="margin-bottom:12px">
    <div id="cl"></div></div>`;
  const draw = q => { $('#cl').innerHTML = list.filter(c => (c.title || '').toLowerCase().includes(q.toLowerCase())).map(c => `<div class="card click" data-chat-open="${c.id}" style="margin-bottom:8px;padding:10px 14px"><div class="row"><b style="flex:1">${esc(c.title)}</b><span class="muted" style="font-size:12.5px">${c.count} mensajes · ${ago(c.updatedAt)}</span></div></div>`).join('') || '<div class="empty">Nada por aquí.</div>'; $$('[data-chat-open]').forEach(el => el.onclick = () => openChat(el.dataset.chatOpen)); };
  draw(''); $('#q').oninput = e => draw(e.target.value);
}

async function newProjectFromFolder() {
  toast('Elige la carpeta en el diálogo de Windows…');
  const { path } = await api('POST', '/api/pick-folder');
  if (!path) return;
  const p = await api('POST', '/api/projects', { path, name: '', brief: '' });
  await loadState(); setProject(p.id); editProject(p.id);
}

async function viewProjects(v) {
  const ps = S.st.projects;
  v.innerHTML = `<div class="page"><h1>Proyectos</h1><p class="lead">Cada proyecto tiene su carpeta, su ficha (contexto fijo que se cachea) y su propia pizarra compartida.</p>
    <div class="row" style="margin-bottom:16px"><button class="btn primary" id="np">${ico('plus', 14)} Añadir carpeta del ordenador</button><button class="btn" id="np2">Proyecto sin carpeta</button></div>
    <div class="cards">${ps.map(p => `<div class="card click" data-p="${p.id}"><h3><span class="proj-dot" style="background:${esc(p.color || '#999')}"></span>${esc(p.name)}${p.id === S.projectId ? ' <span class="chip" style="font-size:11px">actual</span>' : ''}</h3>
      <div class="mono muted" style="margin-bottom:6px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(p.path || 'sin carpeta')}</div>
      <p class="desc">${esc((p.brief || 'Sin ficha. Añade una descripción para que todos los agentes la conozcan.').slice(0, 180))}</p>
      <div class="row"><button class="btn sm" data-use="${p.id}">Usar</button><button class="btn sm" data-edit="${p.id}">Editar</button>${p.path ? `<button class="btn sm" data-open="${p.id}">Abrir carpeta</button>` : ''}${p.allowWrites ? `<span class="chip" title="Los agentes escriben directamente (con copia de seguridad)">${ico('pencil', 12)} escritura directa</span>` : ''}</div></div>`).join('')}</div></div>`;
  $('#np').onclick = newProjectFromFolder;
  $('#np2').onclick = async () => { const name = await askText('Nombre del proyecto:'); if (!name) return; const p = await api('POST', '/api/projects', { name }); await loadState(); setProject(p.id); };
  $$('[data-use]').forEach(b => b.onclick = e => { e.stopPropagation(); setProject(b.dataset.use); S.view = 'chat'; renderSidebar(); render(); });
  $$('[data-edit]').forEach(b => b.onclick = e => { e.stopPropagation(); editProject(b.dataset.edit); });
  $$('[data-open]').forEach(b => b.onclick = e => { e.stopPropagation(); api('POST', `/api/projects/${b.dataset.open}/open`); });
  $$('[data-p]').forEach(c => c.onclick = () => editProject(c.dataset.p));
}

function editProject(id) {
  const p = S.st.projects.find(x => x.id === id); if (!p) return;
  modal('Proyecto', `<div class="form">
    <div class="two"><label>Nombre<input type="text" id="pn" value="${esc(p.name)}"></label><label>Color<input type="text" id="pc" value="${esc(p.color || '#d97757')}"></label></div>
    <label>Carpeta<div class="row" style="flex-wrap:nowrap"><input type="text" id="pp" value="${esc(p.path)}"><button class="btn" id="pick">Elegir…</button></div></label>
    <label>Ficha del proyecto (todos los agentes la ven; se cachea, así que sale barata)<textarea class="in" id="pb" rows="7">${esc(p.brief)}</textarea></label>
    <label>Convenciones (estilo, reglas, cosas que NO tocar)<textarea class="in" id="pv" rows="4">${esc(p.conventions)}</textarea></label>
    <label class="check"><input type="checkbox" id="pw" ${p.allowWrites ? 'checked' : ''}> Permitir que los agentes escriban archivos directamente (con copia de seguridad). Si no, quedan como artefactos para que los apliques tú.</label>
  </div>`, [
    { label: 'Eliminar', cls: 'danger', run: async () => { if (!await ask('¿Eliminar el proyecto de faisp (no borra la carpeta)? Se borran sus chats y pizarra.')) return true; await api('DELETE', '/api/projects/' + id); await loadState(); render(); } },
    { label: 'Cancelar' },
    { label: 'Guardar', cls: 'primary', run: async o => {
      await api('PATCH', '/api/projects/' + id, { name: $('#pn', o).value, color: $('#pc', o).value, path: $('#pp', o).value, brief: $('#pb', o).value, conventions: $('#pv', o).value, allowWrites: $('#pw', o).checked });
      await loadState(); render();
    } },
  ]);
  $('#pick').onclick = async () => { const { path } = await api('POST', '/api/pick-folder'); if (path) $('#pp').value = path; };
}

async function viewArtifacts(v) {
  await refreshArtifacts();
  v.innerHTML = `<div class="page"><h1>Artefactos</h1><p class="lead">Archivos, páginas y bloques que generaron los agentes en ${esc(project()?.name || 'este proyecto')}. Cada cambio crea una versión nueva; aplicar escribe en la carpeta con copia de seguridad.</p>
    ${S.artifacts.length ? `<div class="cards">${S.artifacts.map(a => `<div class="card click" data-art="${a.id}"><h3>${ico('layers', 14)} ${esc(a.title)}</h3><div class="mono muted" style="overflow:hidden;text-overflow:ellipsis">${esc(a.path || a.lang || '')}</div>
      <p class="desc" style="margin-top:6px">${a.versions} versión(es) · ${esc(agentById(a.agentId)?.name || '')} · ${ago(a.updatedAt)}</p>
      <div class="row">${a.appliedVersion ? `<span class="chip" style="color:var(--ok)">${ico('tick', 13)} aplicado v${a.appliedVersion}</span>` : '<span class="chip">pendiente</span>'}</div></div>`).join('')}</div>` : '<div class="empty">Aún no hay artefactos. Cuando un agente entregue archivos aparecerán aquí.</div>'}</div>`;
}

async function viewAgents(v) {
  const all = agents();
  const ready = S.st.providerReady;
  v.innerHTML = `<div class="page"><h1>Agentes</h1><p class="lead">Cada agente es un especialista con su propio modelo. El orquestador reparte el trabajo y todos comparten la pizarra del proyecto.</p>
    <div class="row" style="margin-bottom:16px"><button class="btn primary" id="na">${ico('plus', 14)} Nuevo agente</button></div>
    <div class="cards">${all.map(a => { const prov = a.model.split(':')[0]; return `<div class="card click" data-ag="${esc(a.id)}">
      <h3><span class="agent-ico" style="background:${esc(a.color)}22">${agentIcon(a, 17)}</span>${esc(a.name)}${a.plugin ? ` <span class="chip" style="font-size:11px">${ico('plug', 13)} ${esc(a.plugin)}</span>` : ''}</h3>
      <p class="desc">${esc(a.description)}</p>
      <div class="row"><span class="dot ${ready[prov] ? 'on' : ''}" title="${ready[prov] ? 'Proveedor listo' : 'Falta clave → modo demo'}"></span><span class="mono">${esc(a.model)}</span>${a.effort ? `<span class="chip" style="font-size:11px">effort: ${esc(a.effort)}</span>` : ''}${a.tools ? '<span class="chip" style="font-size:11px">' + ico('wrench', 12) + ' archivos</span>' : ''}</div></div>`; }).join('')}</div></div>`;
  $('#na').onclick = () => editAgent(null);
  $$('[data-ag]').forEach(c => c.onclick = () => editAgent(c.dataset.ag));
}

function editAgent(id) {
  const cfgAgents = S.st.config.agents;
  const a = id ? (cfgAgents.find(x => x.id === id) || agentById(id)) : { id: '', name: '', icon: 'sparkle', color: '#d97757', model: 'anthropic:claude-sonnet-5-5', effort: 'medium', description: '', keywords: [], system: '', tools: true };
  const fromPlugin = !!a.plugin;
  modal(id ? 'Editar agente' : 'Nuevo agente', `<div class="form">
    ${fromPlugin ? '<div class="muted">Este agente viene de un plugin; edítalo en su plugin.json.</div>' : ''}
    <div class="three"><label>ID<input type="text" id="ai" value="${esc(a.id)}" ${id ? 'disabled' : ''}></label><label>Nombre<input type="text" id="an" value="${esc(a.name)}"></label><label>Color<input type="text" id="aco" value="${esc(a.color)}"></label></div>
    <label>Icono<div class="icon-grid" id="aic">${AGENT_ICONS.map(n => `<button type="button" data-ic="${n}" class="${n === a.icon ? 'on' : ''}" title="${n}">${ico(n, 18)}</button>`).join('')}</div></label>
    <div class="three"><label>Modelo${modelPickerHtml('am', a.model)}</label>
      <label>Esfuerzo<select class="in" id="ae">${['', 'low', 'medium', 'high', 'xhigh', 'max'].map(x => `<option ${x === a.effort ? 'selected' : ''} value="${x}">${x || '(por defecto)'}</option>`).join('')}</select></label>
      <label>Búsqueda web<select class="in" id="aw"><option value="0">No</option><option value="1" ${a.webSearch ? 'selected' : ''}>Sí (Claude / Grok)</option></select></label></div>
    <label>Modelos de respaldo, en orden (uno por línea). Se usan si el principal no tiene clave, se satura o falla.<textarea class="in code" id="af" rows="3">${esc((a.fallbacks || []).join('\n'))}</textarea></label>
    <datalist id="models">${MODEL_SUGGESTIONS.map(m => `<option value="${m}">`).join('')}</datalist>
    <label>Para qué sirve (lo lee el orquestador para repartir)<input type="text" id="ad" value="${esc(a.description)}"></label>
    <label>Palabras clave (enrutado sin gastar tokens, separadas por comas)<input type="text" id="ak" value="${esc((a.keywords || []).join(', '))}"></label>
    <label>Instrucciones del sistema<textarea class="in" id="as" rows="8">${esc(a.system)}</textarea></label>
    <label>Conectores que puede usar<div class="row">${[...Object.keys(S.st.config.mcpServers || {}), 'elevenlabs'].filter((v, i, a) => a.indexOf(v) === i).map(n => `<label class="check"><input type="checkbox" class="amcp" value="${esc(n)}" ${(a.mcp || []).includes(n) ? 'checked' : ''}> ${esc(S.st.config.mcpServers?.[n]?.label || (n === 'elevenlabs' ? 'ElevenLabs' : n))}</label>`).join('') || '<span class="muted">Conecta alguno en Ajustes → Conectores</span>'}</div></label>
    <label class="check"><input type="checkbox" id="apf" ${a.preferFree ? 'checked' : ''}> Probar primero los modelos gratuitos o locales de su cadena</label>
    <label class="check"><input type="checkbox" id="at" ${a.tools ? 'checked' : ''}> Puede explorar y escribir en la carpeta del proyecto (herramientas)</label>
    <label class="check"><input type="checkbox" id="ax" ${a.disabled ? 'checked' : ''}> Desactivado</label></div>`,
    fromPlugin ? [{ label: 'Cerrar' }] : [
      ...(id && id !== 'orquestador' ? [{ label: 'Eliminar', cls: 'danger', run: async () => { if (!await ask('¿Eliminar agente?', { ok: 'Eliminar', danger: true })) return true; await api('PUT', '/api/agents', cfgAgents.filter(x => x.id !== id)); await loadState(); render(); } }] : []),
      { label: 'Cancelar' },
      { label: 'Guardar', cls: 'primary', run: async o => {
        const n = { ...a, id: id || $('#ai', o).value.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '-'), name: $('#an', o).value, icon: $('#aic button.on', o)?.dataset.ic || a.icon, model: $('#am', o).value.trim(), effort: $('#ae', o).value, color: $('#aco', o).value,
          description: $('#ad', o).value, keywords: $('#ak', o).value.split(',').map(s => s.trim().toLowerCase()).filter(Boolean), system: $('#as', o).value, tools: $('#at', o).checked, preferFree: $('#apf', o).checked, webSearch: $('#aw', o).value === '1', fallbacks: $('#af', o).value.split('\n').map(s => s.trim()).filter(Boolean), mcp: $$('.amcp:checked', o).map(c => c.value), disabled: $('#ax', o).checked };
        if (!n.id || !n.name) throw new Error('ID y nombre son obligatorios');
        const list = id ? cfgAgents.map(x => x.id === id ? n : x) : [...cfgAgents, n];
        await api('PUT', '/api/agents', list); await loadState(); render();
      } },
    ]);
  wireModelPicker($('#am'));
  $$('#aic button').forEach(b => b.onclick = () => { $$('#aic button').forEach(x => x.classList.remove('on')); b.classList.add('on'); });
}

async function viewExtensions(v) {
  const ext = await api('GET', '/api/extensions');
  v.innerHTML = `<div class="page"><h1>Extensiones</h1><p class="lead">Plugins que añaden agentes, skills, conectores y rutinas. Carpeta: <span class="mono">${esc(ext.dir)}</span></p>
    <div class="row" style="margin-bottom:6px"><button class="btn" id="ob">Abrir carpeta de plugins</button><button class="btn" id="os">Abrir carpeta de skills</button><button class="btn" id="rl">↻ Recargar</button></div>
    <section class="block"><h2>Plugins</h2><p>Un plugin es una carpeta con <span class="mono">plugin.json</span> (y opcionalmente <span class="mono">skills/*.md</span>). Se pueden compartir como .zip.</p>
      <div class="cards">${ext.plugins.map(p => `<div class="card"><h3>${ico('plug', 13)} ${esc(p.name)} <span class="muted" style="font-size:12px;font-weight:400">${esc(p.version || '')}</span></h3><p class="desc">${esc(p.error ? 'Error: ' + p.error : p.description)}</p><div class="row muted" style="font-size:12.5px">${p.agents} agentes · ${p.skills} skills · ${p.connectors} conectores · ${p.routines} rutinas</div></div>`).join('') || '<div class="empty">Sin plugins.</div>'}</div></section>
    <section class="block"><h2>Skills</h2><p>Instrucciones especializadas que solo se inyectan cuando la tarea las necesita (ahorran tokens frente a un prompt gigante).</p>
      <div class="row" style="margin-bottom:10px"><button class="btn primary" id="ns">${ico('plus', 14)} Nueva skill</button></div>
      <table class="table"><tr><th>Skill</th><th>Agentes</th><th>Se activa con</th><th>Origen</th></tr>${ext.skills.map(s => `<tr><td><b>${esc(s.name)}</b><div class="muted" style="font-size:12.5px">${esc(s.description)}</div></td><td>${esc(s.agents.join(', ') || 'todos')}</td><td class="muted">${esc(s.keywords.join(', '))}</td><td>${esc(s.source)}</td></tr>`).join('')}</table></section>
    <section class="block"><h2>Conectores</h2><p>Fuentes de contexto externas: carpeta, archivo o URL. Se consultan bajo demanda cuando la tarea las menciona.</p>
      ${ext.connectors.length ? `<table class="table"><tr><th>Conector</th><th>Tipo</th><th>Plugin</th></tr>${ext.connectors.map(c => `<tr><td><b>${esc(c.id)}</b><div class="muted" style="font-size:12.5px">${esc(c.description)}</div></td><td>${esc(c.type)}</td><td>${esc(c.plugin)}</td></tr>`).join('')}</table>` : '<div class="empty" style="padding:24px">Sin conectores. Añádelos en el <span class="mono">plugin.json</span> de un plugin:<br><span class="mono">"connectors":[{"id":"docs","type":"folder","path":"C:/ruta/docs","keywords":"lore, roadmap"}]</span></div>'}</section></div>`;
  $('#ob').onclick = () => api('POST', '/api/extensions/open', { which: 'plugins' });
  $('#os').onclick = () => api('POST', '/api/extensions/open', { which: 'skills' });
  $('#rl').onclick = async () => { await api('POST', '/api/extensions/reload'); await loadState(); render(); toast('Extensiones recargadas'); };
  $('#ns').onclick = () => modal('Nueva skill', `<div class="form">
    <div class="two"><label>Nombre<input type="text" id="sn" placeholder="mi-skill"></label><label>Agentes (ids, coma; vacío = todos)<input type="text" id="sa" placeholder="modelos, codigo"></label></div>
    <label>Descripción<input type="text" id="sd"></label>
    <label>Palabras clave que la activan<input type="text" id="sk" placeholder="blockbench, animación"></label>
    <label>Contenido (markdown)<textarea class="in" id="sb" rows="10"></textarea></label></div>`,
    [{ label: 'Cancelar' }, { label: 'Crear', cls: 'primary', run: async o => { await api('POST', '/api/skills', { name: $('#sn', o).value, agents: $('#sa', o).value, description: $('#sd', o).value, keywords: $('#sk', o).value, body: $('#sb', o).value }); render(); } }]);
}

async function viewRoutines(v) {
  const rs = S.st.routines;
  const pname = id => S.st.projects.find(p => p.id === id)?.name || '—';
  const sched = s => s.startsWith('every:') ? `cada ${s.slice(6)} min` : s.startsWith('daily:') ? `diaria a las ${s.slice(6)}` : 'manual';
  v.innerHTML = `<div class="page"><h1>Rutinas</h1><p class="lead">Tareas que se ejecutan solas (o con un clic): informes diarios, revisiones del proyecto, resúmenes… Mientras haya rutinas activas, faisp sigue funcionando en segundo plano aunque cierres la ventana.</p>
    <div class="row" style="margin-bottom:16px"><button class="btn primary" id="nr">${ico('plus', 14)} Nueva rutina</button></div>
    ${rs.length ? `<table class="table"><tr><th>Rutina</th><th>Proyecto</th><th>Cuándo</th><th>Última</th><th></th></tr>${rs.map(r => `<tr><td><b>${esc(r.name)}</b>${r.plugin ? ` <span class="chip" style="font-size:11px">${ico('plug', 13)} ${esc(r.plugin)}</span>` : ''}<div class="muted" style="font-size:12.5px">${esc(r.prompt.slice(0, 120))}</div></td><td>${esc(pname(r.projectId))}</td><td>${sched(r.schedule)}</td><td class="muted">${r.lastRun ? ago(r.lastRun) : '—'}</td>
      <td class="n"><label class="check" style="display:inline-flex!important"><input type="checkbox" data-en="${esc(r.id)}" ${r.enabled ? 'checked' : ''}>activa</label> <button class="btn sm" data-run="${esc(r.id)}">Ejecutar</button> ${r.chatId ? `<button class="btn sm" data-oc="${esc(r.chatId)}">Ver</button>` : ''} <button class="btn sm danger" data-rd="${esc(r.id)}">${ico('x', 14)}</button></td></tr>`).join('')}</table>` : '<div class="empty">Sin rutinas. Ejemplo: "Cada día a las 9:00, revisa docs/ROADMAP.md y dime qué toca hoy".</div>'}</div>`;
  $('#nr').onclick = () => modal('Nueva rutina', `<div class="form">
    <label>Nombre<input type="text" id="rn" placeholder="Resumen diario"></label>
    <div class="two"><label>Proyecto<select class="in" id="rp">${S.st.projects.map(p => `<option value="${p.id}" ${p.id === S.projectId ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</select></label>
      <label>Agente<select class="in" id="ra"><option value="">Auto (orquestador)</option>${agents().filter(a => a.id !== 'orquestador').map(a => `<option value="${esc(a.id)}">${esc(a.name)}</option>`).join('')}</select></label></div>
    <div class="two"><label>Frecuencia<select class="in" id="rt"><option value="daily">Diaria</option><option value="every">Cada N minutos</option><option value="manual">Manual</option></select></label><label>Valor<input type="text" id="rv" value="09:00" placeholder="09:00 o 60"></label></div>
    <label>Instrucción<textarea class="in" id="rpr" rows="5" placeholder="Revisa docs/ROADMAP.md y los cambios recientes; dime qué toca hoy en 5 puntos."></textarea></label></div>`,
    [{ label: 'Cancelar' }, { label: 'Crear', cls: 'primary', run: async o => {
      const t = $('#rt', o).value; const schedule = t === 'manual' ? 'manual' : `${t}:${$('#rv', o).value.trim()}`;
      await api('POST', '/api/routines', { name: $('#rn', o).value || 'Rutina', projectId: $('#rp', o).value, agentId: $('#ra', o).value || null, schedule, prompt: $('#rpr', o).value, enabled: t !== 'manual' });
      await loadState(); render();
    } }]);
  $$('[data-en]').forEach(c => c.onchange = async () => { await api('POST', '/api/routines', { ...rs.find(r => r.id === c.dataset.en), enabled: c.checked }); await loadState(); });
  $$('[data-run]').forEach(b => b.onclick = async () => { const r = await api('POST', `/api/routines/${encodeURIComponent(b.dataset.run)}/run`); toast('Rutina en marcha'); await loadState(); setTimeout(() => openChat(r.chatId), 600); });
  $$('[data-oc]').forEach(b => b.onclick = () => openChat(b.dataset.oc));
  $$('[data-rd]').forEach(b => b.onclick = async () => { if (!await ask('¿Eliminar rutina?', { ok: 'Eliminar', danger: true })) return; await api('DELETE', `/api/routines/${encodeURIComponent(b.dataset.rd)}`); await loadState(); render(); });
}

async function viewUsage(v) {
  const u = await api('GET', '/api/usage');
  const t = u.totals;
  const max = Math.max(1, ...u.byDay.map(d => d.tokens));
  const pname = id => S.st.projects.find(p => p.id === id)?.name || '(sin proyecto)';
  const table = (rows, label, nameFn = x => x) => `<table class="table"><tr><th>${label}</th><th class="n">Llamadas</th><th class="n">Entrada</th><th class="n">Salida</th><th class="n">Caché</th><th class="n">Coste</th></tr>${rows.map(r => `<tr><td>${esc(nameFn(r.key))}</td><td class="n">${fmtN(r.calls)}</td><td class="n">${fmtTok(r.input)}</td><td class="n">${fmtTok(r.output)}</td><td class="n">${fmtTok(r.cacheRead)}</td><td class="n">${fmtUsd(r.cost)}</td></tr>`).join('')}</table>`;
  v.innerHTML = `<div class="page"><h1>Uso y tokens</h1><p class="lead">Últimos 30 días. El coste es una estimación con los precios de Ajustes.</p>
    <div class="stats">
      <div class="stat"><div class="k">Gasto del mes</div><div class="v">${fmtUsd(t.monthSpend)}</div>${t.limit ? `<div class="muted" style="font-size:12px">límite ${fmtUsd(t.limit)}</div>` : ''}</div>
      <div class="stat"><div class="k">Tokens de entrada</div><div class="v">${fmtTok(t.input)}</div></div>
      <div class="stat"><div class="k">Tokens de salida</div><div class="v">${fmtTok(t.output)}</div></div>
      <div class="stat"><div class="k">Leídos de caché</div><div class="v">${fmtTok(t.cacheRead)}</div></div>
      <div class="stat"><div class="k">Ahorro por caché</div><div class="v" style="color:var(--ok)">${fmtUsd(t.cacheSaved)}</div></div>
    </div>
    <section class="block"><h2>Tokens por día</h2><div class="bars">${u.byDay.map(d => `<div style="height:${(d.tokens / max * 100).toFixed(1)}%" title="${d.day}: ${fmtN(d.tokens)} tok · ${fmtUsd(d.cost)}"></div>`).join('') || '<span class="muted">Sin datos</span>'}</div></section>
    <section class="block"><h2>Por agente</h2>${table(u.byAgent, 'Agente', k => (agentById(k)?.icon || '') + ' ' + (agentById(k)?.name || k))}</section>
    <section class="block"><h2>Por modelo</h2>${table(u.byModel, 'Modelo')}</section>
    <section class="block"><h2>Por proyecto</h2><table class="table">${Object.entries(u.byProject).map(([k, c]) => `<tr><td>${esc(pname(k))}</td><td class="n">${fmtUsd(c)}</td></tr>`).join('')}</table></section>
    <section class="block"><h2>Cómo ahorra tokens faisp</h2><p>• La ficha del proyecto y las instrucciones de cada agente van primero y se cachean (se cobran ~10% en lecturas).<br>• Cada agente ve resúmenes de lo que hicieron los demás, no sus salidas completas.<br>• Los agentes leen archivos con herramientas bajo demanda en lugar de recibir el proyecto entero.<br>• Las skills solo se inyectan cuando la tarea las necesita.<br>• La pizarra se comprime en una memoria corta cuando crece.<br>• Las tareas sencillas van a modelos baratos (Haiku) y el código a Opus.</p></section></div>`;
}

// ---------- Ajustes (con pestañas, como los de Claude) ----------

// ---------- Atajos de teclado (estilo Claude / Claude Code), editables en Ajustes → Atajos ----------
const SHORTCUTS = [
  { id: 'palette', label: 'Buscar chats y acciones', def: 'Ctrl+K', run: () => openPalette() },
  { id: 'newChat', label: 'Nuevo chat', def: 'Ctrl+Shift+O', run: () => $('#newChat').click() },
  { id: 'sidebar', label: 'Mostrar u ocultar la barra lateral', def: 'Ctrl+B', run: () => window.toggleSide?.() },
  { id: 'panel', label: 'Mostrar u ocultar la pizarra', def: 'Ctrl+.', run: () => $('#panelBtn').click() },
  { id: 'focus', label: 'Escribir en el chat', def: 'Shift+Esc', run: () => { if (S.view !== 'chat') { S.view = 'chat'; renderSidebar(); render(); } setTimeout(() => $('#prompt')?.focus(), 0); } },
  { id: 'cycleMode', label: 'Cambiar modo de permisos (en el chat)', def: 'Shift+Tab', input: true, run: () => cycleMode() },
  { id: 'cycleEffort', label: 'Cambiar nivel de esfuerzo', def: 'Ctrl+Shift+E', run: () => cycleEffort() },
  { id: 'stop', label: 'Detener la respuesta', def: 'Esc', input: true, run: () => { if (S.streaming) { stopStream(); return true; } return false; } },
  { id: 'copyLast', label: 'Copiar la última respuesta', def: 'Ctrl+Shift+C', run: () => copyLast() },
  { id: 'prevChat', label: 'Chat anterior', def: 'Ctrl+Alt+ArrowUp', run: () => moveChat(-1) },
  { id: 'nextChat', label: 'Chat siguiente', def: 'Ctrl+Alt+ArrowDown', run: () => moveChat(1) },
  { id: 'settings', label: 'Ajustes', def: 'Ctrl+,', run: () => { S.view = 'settings'; renderSidebar(); render(); } },
  { id: 'usage', label: 'Uso y límites', def: 'Ctrl+Shift+U', run: () => { S.view = 'settings'; S.settingsTab = 'usage'; renderSidebar(); render(); } },
  { id: 'help', label: 'Mapa de atajos', def: 'Ctrl+/', run: () => { S.view = 'settings'; S.settingsTab = 'keys'; renderSidebar(); render(); } },
];
const keyBindings = () => { let o = {}; try { o = JSON.parse(store.get('shortcuts', '{}')); } catch {} return Object.fromEntries(SHORTCUTS.map(s => [s.id, o[s.id] || s.def])); };
function comboOf(e) {
  const k = { ' ': 'Space', Escape: 'Esc' }[e.key] || (e.key.length === 1 ? e.key.toUpperCase() : e.key);
  if (['Control', 'Shift', 'Alt', 'Meta'].includes(e.key)) return '';
  return [e.ctrlKey || e.metaKey ? 'Ctrl' : '', e.altKey ? 'Alt' : '', e.shiftKey && !(e.key.length === 1 && /[^a-zA-Z0-9]/.test(e.key)) ? 'Shift' : '', k].filter(Boolean).join('+');
}
const kbd = c => c.split('+').map(p => `<kbd>${esc({ ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→' }[p] || p)}</kbd>`).join('<span class="plus">+</span>');
addEventListener('keydown', e => {
  if (S.recordingKey) return;
  const combo = comboOf(e); if (!combo) return;
  const binds = keyBindings();
  const inField = e.target.closest?.('input, textarea, select, [contenteditable="true"]');
  const sc = SHORTCUTS.find(s => binds[s.id] === combo);
  if (!sc) return;
  if (inField && !combo.startsWith('Ctrl') && !sc.input) return;
  if (sc.id === 'cycleMode' && e.target.id !== 'prompt') return;
  if (document.querySelector('.overlay') && sc.id !== 'stop') return;
  const handled = sc.run();
  if (handled !== false) e.preventDefault();
}, true);
function cycleMode() { const i = MODES.findIndex(m => m.id === curMode()); S.mode = MODES[(i + 1) % MODES.length].id; store.set('mode', S.mode); $('#modePick') && $('#modePick').dispatchEvent(new CustomEvent('redraw')); toast('Modo: ' + MODES.find(m => m.id === S.mode).label); }
function cycleEffort() { const i = EFFORTS.findIndex(x => x[0] === S.effort); S.effort = EFFORTS[(i + 1) % EFFORTS.length][0]; store.set('effort', S.effort); $('#effPick') && $('#effPick').dispatchEvent(new CustomEvent('redraw')); toast('Esfuerzo: ' + EFFORTS.find(x => x[0] === S.effort)[1]); }
async function copyLast() { const m = [...(S.chat?.messages || [])].reverse().find(x => x.role === 'assistant'); if (!m) return toast('No hay respuesta que copiar'); const t = m.steps?.length ? m.steps.map(s => s.text).join('\n\n') : m.content; await navigator.clipboard.writeText(t); toast('Respuesta copiada'); }
function moveChat(d) { const list = S.st.chats.filter(c => c.projectId === S.projectId); if (!list.length) return; const i = list.findIndex(c => c.id === S.chatId); const n = list[Math.max(0, Math.min(list.length - 1, i < 0 ? 0 : i + d))]; if (n) openChat(n.id); }

// Paleta de búsqueda (Ctrl+K)
function openPalette() {
  if (document.querySelector('.palette')) return;
  const actions = [
    { t: 'Nuevo chat', i: 'plus', run: () => $('#newChat').click() },
    ...['projects:Proyectos:folder', 'artifacts:Artefactos:layers', 'agents:Agentes:bot', 'extensions:Extensiones:plug', 'routines:Rutinas:clock', 'usage:Uso y tokens:chart'].map(x => { const [v, t, i] = x.split(':'); return { t, i, run: () => { S.view = v; renderSidebar(); render(); } }; }),
    ...SETTINGS_TABS.map(([id, label, icon]) => ({ t: 'Ajustes · ' + label, i: icon, run: () => { S.view = 'settings'; S.settingsTab = id; renderSidebar(); render(); } })),
    ...MODES.map(m => ({ t: 'Modo: ' + m.label, i: m.icon, run: () => { S.mode = m.id; store.set('mode', m.id); render(); } })),
  ];
  const chats = S.st.chats.map(c => ({ t: c.title || 'Nuevo chat', sub: (S.st.projects.find(p => p.id === c.projectId)?.name || '') + ' · ' + ago(c.updatedAt), i: 'chat', run: () => openChat(c.id) }));
  const projects = S.st.projects.map(p => ({ t: p.name, sub: 'Proyecto', i: 'folder', run: () => { setProject(p.id); S.view = 'chat'; render(); } }));
  const o = document.createElement('div'); o.className = 'overlay palette';
  o.innerHTML = `<div class="pal"><div class="pal-in">${ico('search', 17)}<input id="palQ" placeholder="Buscar chats, proyectos y acciones…" autocomplete="off"><kbd>Esc</kbd></div><div class="pal-list" id="palL"></div></div>`;
  document.body.appendChild(o);
  let sel = 0, items = [];
  const draw = () => {
    const q = $('#palQ', o).value.trim().toLowerCase();
    const all = q ? [...chats, ...projects, ...actions].filter(x => (x.t + ' ' + (x.sub || '')).toLowerCase().includes(q)) : [...actions.slice(0, 8), ...chats.slice(0, 8)];
    items = all.slice(0, 40); sel = Math.min(sel, Math.max(0, items.length - 1));
    $('#palL', o).innerHTML = items.map((x, k) => `<button class="pal-it ${k === sel ? 'on' : ''}" data-k="${k}">${ico(x.i, 15)}<span>${esc(x.t)}</span>${x.sub ? `<span class="muted">${esc(x.sub)}</span>` : ''}</button>`).join('') || '<div class="muted" style="padding:14px">Sin resultados</div>';
    $$('[data-k]', o).forEach(b => b.onclick = () => go(+b.dataset.k));
  };
  const close = () => o.remove();
  const go = k => { const x = items[k]; close(); x?.run(); };
  $('#palQ', o).addEventListener('input', () => { sel = 0; draw(); });
  $('#palQ', o).addEventListener('keydown', e => {
    if (e.key === 'ArrowDown') { sel = Math.min(items.length - 1, sel + 1); draw(); e.preventDefault(); }
    else if (e.key === 'ArrowUp') { sel = Math.max(0, sel - 1); draw(); e.preventDefault(); }
    else if (e.key === 'Enter') { go(sel); e.preventDefault(); }
    else if (e.key === 'Escape') { close(); e.preventDefault(); }
  });
  o.addEventListener('mousedown', e => { if (e.target === o) close(); });
  draw(); $('#palQ', o).focus();
}

// Ajustes → Atajos
function setKeys(body) {
  const binds = keyBindings();
  body.innerHTML = `<section class="block"><h2>Atajos de teclado</h2><p>Inspirados en Claude y Claude Code. Pulsa «Cambiar» y después la nueva combinación.</p>
    <table class="table keys">${SHORTCUTS.map(s => `<tr><td>${esc(s.label)}</td><td class="n">${kbd(binds[s.id])}</td><td class="n" style="width:1%;white-space:nowrap"><button class="btn sm" data-rec="${s.id}">Cambiar</button>${binds[s.id] !== s.def ? ` <button class="btn sm" data-rst="${s.id}" title="Volver a ${esc(s.def)}">${ico('refresh', 12)}</button>` : ''}</td></tr>`).join('')}
    <tr><td>Enviar · nueva línea</td><td class="n">${kbd('Enter')} · ${kbd('Shift+Enter')}</td><td></td></tr></table>
    <div style="margin-top:12px"><button class="btn" id="rstAll">Restablecer todos</button></div></section>`;
  const saveB = o => store.set('shortcuts', JSON.stringify(o));
  $$('[data-rec]', body).forEach(b => b.onclick = () => {
    S.recordingKey = true; b.textContent = 'Pulsa la combinación…'; b.classList.add('primary');
    const h = e => {
      e.preventDefault(); e.stopPropagation();
      if (e.key === 'Escape' && !e.shiftKey) { done(); return; }
      const c = comboOf(e); if (!c) return;
      const o = {}; try { Object.assign(o, JSON.parse(store.get('shortcuts', '{}'))); } catch {}
      const clash = SHORTCUTS.find(s => s.id !== b.dataset.rec && keyBindings()[s.id] === c);
      if (clash) toast(`«${c}» ya lo usa: ${clash.label}`);
      else { o[b.dataset.rec] = c; saveB(o); }
      done();
    };
    const done = () => { removeEventListener('keydown', h, true); S.recordingKey = false; setKeys(body); };
    addEventListener('keydown', h, true);
  });
  $$('[data-rst]', body).forEach(b => b.onclick = () => { const o = JSON.parse(store.get('shortcuts', '{}') || '{}'); delete o[b.dataset.rst]; saveB(o); setKeys(body); });
  $('#rstAll', body).onclick = () => { saveB({}); setKeys(body); toast('Atajos restablecidos'); };
}

const SETTINGS_TABS = [
  ['general', 'General', 'settings'], ['account', 'Cuenta', 'key'], ['usage', 'Uso', 'chart'],
  ['models', 'Modelos', 'cube'], ['connectors', 'Conectores', 'plug'], ['keys', 'Atajos', 'key'], ['budget', 'Presupuesto', 'zap'],
];
const pct = (a, b) => Math.max(0, Math.min(100, b ? a / b * 100 : 0));

async function viewSettings(v) {
  const tab = S.settingsTab || 'general';
  v.innerHTML = `<div class="page settings"><h1>Ajustes</h1>
    <div class="set-layout"><nav class="set-nav">${SETTINGS_TABS.map(([id, label, icon]) => `<button data-st="${id}" class="${id === tab ? 'on' : ''}">${ico(icon, 16)}<span>${label}</span></button>`).join('')}</nav>
    <div class="set-body" id="setBody"><div class="muted">Cargando…</div></div></div></div>`;
  $$('[data-st]').forEach(b => b.onclick = () => { S.settingsTab = b.dataset.st; viewSettings(v); });
  const body = $('#setBody');
  const cfg = structuredClone(S.st.config);
  const save = async (msg = 'Guardado') => { await api('PUT', '/api/config', cfg); await loadState(); toast(msg); };
  try { await ({ general: setGeneral, account: setAccount, usage: setUsage, models: setModels, connectors: setConnectors, keys: setKeys, budget: setBudget }[tab])(body, cfg, save); }
  catch (e) { body.innerHTML = `<div class="err">${esc(e.message)}</div>`; }
}

function setGeneral(body, cfg, save) {
  const p = cfg.profile || {};
  body.innerHTML = `<section class="block"><h2>Perfil</h2><div class="form">
      <div class="two"><label>Cómo te llamamos<input type="text" id="pn" value="${esc(p.name || '')}" placeholder="Tu nombre"></label>
      <label>Idioma de respuesta<select class="in" id="pl">${[['es', 'Español'], ['en', 'English'], ['auto', 'El de mi mensaje']].map(([k, l]) => `<option value="${k}" ${p.language === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label></div>
      <label>Instrucciones personales (las leen todos los agentes; se cachean)<textarea class="in" id="pi" rows="5" placeholder="Ej.: Respóndeme corto. Programo en Java/Fabric. No toques la UI del menú principal.">${esc(p.instructions || '')}</textarea></label></div></section>
    <section class="block"><h2>Corrector</h2><label class="check"><input type="checkbox" id="psc" ${p.spellcheck !== false ? 'checked' : ''}> Revisar ortografía y gramática mientras escribes en el chat (estilo Google Docs)</label>
      <div class="form two" style="margin-top:10px"><label>Idioma<select class="in" id="psl">${[['auto', 'Detectar (español / inglés)'], ['es', 'Español'], ['en-US', 'Inglés (EE. UU.)'], ['en-GB', 'Inglés (Reino Unido)']].map(([k, l]) => `<option value="${k}" ${(p.spellLang || 'auto') === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label></div>
      <p class="muted" style="font-size:12.5px">Usa LanguageTool (languagetool.org): el texto que escribes en el chat se envía a su servicio para revisarlo. Haz clic en una palabra subrayada (o Ctrl+Espacio) para ver sugerencias.</p></section>
    <section class="block"><h2>Apariencia</h2><div class="row">${['light', 'dark', 'system'].map(t => `<button class="btn ${(document.documentElement.dataset.theme || 'system') === t ? 'primary' : ''}" data-theme="${t}">${{ light: 'Claro', dark: 'Oscuro', system: 'Sistema' }[t]}</button>`).join('')}</div></section>
    <section class="block"><h2>Datos</h2><p>Todo se guarda en tu ordenador: <span class="mono">${esc(S.st.dataDir)}</span></p></section>
    <button class="btn primary" id="sv">Guardar</button>`;
  $$('[data-theme]', body).forEach(b => b.onclick = () => { const t = b.dataset.theme; if (t === 'system') { delete document.documentElement.dataset.theme; store.set('theme', ''); } else { document.documentElement.dataset.theme = t; store.set('theme', t); } setGeneral(body, cfg, save); });
  $('#sv', body).onclick = async () => { cfg.profile = { name: $('#pn').value.trim(), language: $('#pl').value, instructions: $('#pi').value, spellcheck: $('#psc').checked, spellLang: $('#psl').value }; await save(); renderSidebar(); };
}

async function setAccount(body, cfg, save) {
  body.innerHTML = '<div class="muted">Comprobando tu cuenta de Claude…</div>';
  const acc = await api('GET', '/api/account');
  const st = acc.status || {};
  const logged = acc.found && st.loggedIn && !acc.expired;
  const plan = st.subscriptionType || st.plan || (st.authMethod && st.authMethod !== 'none' ? st.authMethod : '');
  body.innerHTML = `<section class="block"><h2>Cuenta de Claude</h2>
      <p>Usa tu suscripción de Claude (Pro/Max) en lugar de la API: faisp le pasa el trabajo a tu propio Claude Code, que tiene tu sesión. faisp no ve ni guarda tus credenciales.</p>
      <div class="card acct"><div class="row">
        <div class="avatar big">${ico('key', 18)}</div>
        <div style="flex:1;min-width:0">${!acc.found ? '<b>Claude Code no encontrado</b><div class="muted" style="font-size:13px">Instala Claude Code o la app de escritorio de Claude.</div>'
          : `<b>${logged ? 'Sesión iniciada' : acc.expired ? 'Sesión caducada' : 'Sin sesión'}</b>${st.email ? ` <span class="muted">· ${esc(st.email)}</span>` : ''}
             <div class="muted" style="font-size:13px">${esc(plan)}${st.loginExpiresAt ? ' · caduca ' + new Date(st.loginExpiresAt).toLocaleDateString('es-ES') : ''}</div>`}</div>
        ${acc.found ? (logged ? '<button class="btn sm" id="lo">Cerrar sesión</button>' : '<button class="btn accent" id="li">Iniciar sesión con Claude</button>') : ''}
      </div>${acc.found ? `<div class="mono muted" style="font-size:11.5px;margin-top:8px;overflow:hidden;text-overflow:ellipsis">${esc(acc.path)}</div>` : ''}</div>
      <label class="check" style="margin-top:14px"><input type="checkbox" id="us" ${cfg.routing.useSubscription ? 'checked' : ''}> Usar primero mi suscripción para los modelos de Claude (si falla o se agota, sigue con la API y los respaldos)</label>
      <p class="muted" style="font-size:12.5px;margin-top:10px">Esta opción es para tu uso personal. Para distribuir faisp con inicio de sesión de claude.ai a otras personas, hace falta la aprobación de Anthropic.</p></section>
    <section class="block"><h2>Cuenta de ChatGPT</h2><p>Igual que con Claude: faisp usa tu cuenta de ChatGPT a través de Codex CLI, la herramienta oficial de OpenAI (experimental). Google y xAI no ofrecen este tipo de inicio de sesión para otras apps: con ellos se usa su API key (Gemini tiene nivel gratuito).</p><div class="card" id="codexBox"><span class="muted">Comprobando…</span></div></section>
    <section class="block"><h2>Licencia de faisp</h2><div class="form three">
      <label>Plan<select class="in" id="lplan">${['self-hosted', 'free', 'pro', 'team', 'enterprise'].map(p => `<option ${cfg.license.plan === p ? 'selected' : ''}>${p}</option>`).join('')}</select></label>
      <label>Clave<input type="text" id="lkey" value="${esc(cfg.license.key)}"></label><label>Email<input type="text" id="lmail" value="${esc(cfg.license.email)}"></label></div>
      <button class="btn primary" id="sv" style="margin-top:12px">Guardar</button></section>`;
  api('GET', '/api/cli/codex/status').then(cx => {
    const box = $('#codexBox', body); if (!box) return;
    box.innerHTML = `<div class="row"><div class="avatar big">${ico('bot', 18)}</div><div style="flex:1;min-width:0"><b>${!cx.found ? 'Codex CLI no instalado' : cx.loggedIn ? 'Sesión iniciada' : 'Sin sesión'}</b><div class="muted" style="font-size:13px">${esc(cx.status || 'Necesita Node.js (ya lo tienes)')}</div></div>${!cx.found ? '<button class="btn" id="cxi">Instalar Codex CLI</button>' : cx.loggedIn ? '' : '<button class="btn accent" id="cxl">Iniciar sesión con ChatGPT</button>'}</div>`;
    $('#cxi', box)?.addEventListener('click', async () => { if (!await ask('Se abrirá una consola que ejecuta: npm install -g @openai/codex (paquete oficial de OpenAI). ¿Continuar?')) return; await api('POST', '/api/cli/codex/install'); toast('Instalando en la consola; vuelve aquí al terminar'); });
    $('#cxl', box)?.addEventListener('click', async () => { await api('POST', '/api/cli/codex/login'); toast('Sigue los pasos en el navegador'); });
  }).catch(() => {});
  $('#li', body)?.addEventListener('click', async () => {
    await api('POST', '/api/account/login');
    toast('Se abrió una ventana: sigue los pasos; esto se actualiza solo');
    const box = $('.acct', body); if (box) box.insertAdjacentHTML('beforeend', '<div class="muted" style="font-size:12.5px;margin-top:8px">Esperando a que inicies sesión…</div>');
    clearInterval(S.loginTimer);
    let n = 0;
    S.loginTimer = setInterval(async () => {
      if (++n > 90 || S.view !== 'settings' || S.settingsTab !== 'account') return clearInterval(S.loginTimer);
      const a = await api('GET', '/api/account').catch(() => null);
      if (a?.status?.loggedIn && !a.expired) { clearInterval(S.loginTimer); toast('Sesión iniciada'); setAccount(body, cfg, save); }
    }, 3000);
  });
  $('#lo', body)?.addEventListener('click', async () => { if (!await ask('¿Cerrar la sesión de Claude Code en este PC?')) return; await api('POST', '/api/account/logout'); setAccount(body, cfg, save); });
  $('#sv', body).onclick = async () => { cfg.routing.useSubscription = $('#us').checked; cfg.license = { plan: $('#lplan').value, key: $('#lkey').value, email: $('#lmail').value }; await save(); };
  $('#us', body).onchange = async e => { cfg.routing.useSubscription = e.target.checked; await save(e.target.checked ? 'Se usará tu suscripción primero' : 'Suscripción desactivada'); };
}

const WINDOW_NAMES = { five_hour: 'Sesión actual', seven_day: 'Semana · todos los modelos', seven_day_opus: 'Semana · Opus', seven_day_sonnet: 'Semana · Sonnet', seven_day_oauth_apps: 'Semana · apps' };
function fmtReset(ts) {
  if (!ts) return '';
  const d = new Date(ts * 1000), diff = d - Date.now();
  if (diff <= 0) return 'reiniciado';
  const h = Math.floor(diff / 3.6e6), m = Math.round((diff % 3.6e6) / 6e4);
  if (h < 24) return `se reinicia en ${h ? h + ' h ' : ''}${m} min`;
  return 'se reinicia el ' + d.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric' }) + ' a las ' + d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
}
function limitsHtml(l) {
  if (!l || !l.info) return '<p class="muted">Aún no hay datos. Pulsa «Actualizar» (hace una consulta mínima con Haiku) o usa cualquier agente con tu suscripción.</p>';
  const info = l.info, wins = info.unifiedWindows || {};
  const entries = Object.keys(wins).length ? Object.entries(wins) : [[info.rateLimitType || 'five_hour', { utilization: info.utilization, resetsAt: info.resetsAt }]];
  const order = ['five_hour', 'seven_day', 'seven_day_opus', 'seven_day_sonnet'];
  entries.sort((a, b) => (order.indexOf(a[0]) + 99) % 99 - (order.indexOf(b[0]) + 99) % 99);
  const warn = { allowed_warning: 'Te acercas al límite', rejected: 'Límite alcanzado' }[info.status];
  return `${warn ? `<div class="test ${info.status === 'rejected' ? 'bad' : 'warnbox'}">${ico('alert', 13)} ${warn}${info.status === 'rejected' && info.resetsAt ? ' · ' + fmtReset(info.resetsAt) : ''}</div>` : ''}
    ${entries.map(([k, w]) => { const p = Math.round((w.utilization || 0) * 100); return `<div class="ubar"><div class="row"><b>${esc(WINDOW_NAMES[k] || k)}</b><span class="muted" style="font-size:13px">${fmtReset(w.resetsAt)}</span><span style="flex:1"></span><span class="mono">${p} % usado</span></div><div class="track"><div style="width:${p}%;${p >= 90 ? 'background:var(--err)' : p >= 70 ? 'background:var(--warn)' : ''}"></div></div></div>`; }).join('')}
    <div class="muted" style="font-size:12.5px">Actualizado ${ago(new Date(l.checkedAt * 1000))}${info.overageEnabled ? ' · uso adicional activado' : ''}</div>`;
}

async function setUsage(body) {
  body.innerHTML = `<section class="block"><div class="row"><h2 style="margin:0;flex:1">Tu plan de Claude</h2><span class="muted" style="font-size:12.5px" id="limState"></span>${usageLinks('claude')}<button class="btn sm" id="limRefresh">${ico('refresh', 13)} Actualizar</button></div>
      <p>Los mismos datos que muestra Claude en Ajustes → Uso. Se actualizan solos mientras tienes esta pantalla abierta.</p><div id="limBox"><div class="muted">Cargando…</div></div></section>
    <section class="block"><div class="row"><h2 style="margin:0;flex:1">Otras IAs</h2></div><p>Límites de cada API (los que devuelven en sus respuestas), créditos o plan de la cuenta cuando el servicio lo publica, y lo que ha gastado faisp con cada una.</p><div id="provBox"><div class="muted">Cargando…</div></div></section>
    <section class="block"><h2>Este mes en faisp</h2><div class="stats" id="monthBox"></div>
      <button class="btn" id="more">${ico('chart', 14)} Ver el detalle por agente, modelo y proyecto</button></section>`;
  $('#more', body).onclick = () => { S.view = 'usage'; renderSidebar(); render(); };

  const alive = () => S.view === 'settings' && S.settingsTab === 'usage' && document.body.contains(body);
  const drawClaude = l => { S.limits = l; const b = $('#limBox', body); if (b) b.innerHTML = limitsHtml(l); };
  const refreshClaude = async (silent) => {
    const btn = $('#limRefresh', body), st = $('#limState', body);
    if (!btn || btn.disabled) return;
    btn.disabled = true; if (st) st.textContent = 'Consultando…';
    try { drawClaude(await api('POST', '/api/claude/limits/refresh')); if (!silent) toast('Límites actualizados'); }
    catch (err) { if (!silent) toast('No se pudo: ' + err.message.slice(0, 120)); }
    btn.disabled = false; if (st) st.textContent = '';
  };
  $('#limRefresh', body).onclick = () => refreshClaude(false);

  const drawProviders = d => {
    const box = $('#provBox', body); if (!box) return;
    const list = Object.entries(d.providers || {}).filter(([id, p]) => id !== 'claude' && (p.ready || p.month.calls));
    const off = Object.entries(d.providers || {}).filter(([id, p]) => id !== 'claude' && !p.ready && !p.month.calls).map(([, p]) => p.label);
    box.innerHTML = (list.length ? list.map(([id, p]) => providerUsageCard(id, p)).join('') : '<div class="muted">Ninguna configurada todavía. Añade claves en Ajustes → Modelos o conecta servicios en Conectores.</div>')
      + (off.length ? `<div class="muted" style="font-size:12.5px;margin-top:10px">Sin configurar: ${off.map(esc).join(', ')}</div>` : '');
    $$('[data-check]', box).forEach(b => b.onclick = async () => {
      b.disabled = true; b.textContent = 'Comprobando…';
      const r = await api('POST', `/api/providers/${encodeURIComponent(b.dataset.check)}/test`, {}).catch(e => ({ ok: false, error: e.message }));
      if (!r.ok) toast(r.error || 'Error');
      drawProviders(await api('GET', '/api/limits'));
    });
  };
  const loadAll = async () => {
    const [d, u] = await Promise.all([api('GET', '/api/limits').catch(() => ({})), api('GET', '/api/usage').catch(() => null)]);
    if (!alive()) return null;
    drawClaude(d.claude); drawProviders(d);
    if (u) $('#monthBox', body).innerHTML = `<div class="stat"><div class="k">Gasto en APIs</div><div class="v">${fmtUsd(u.totals.monthSpend)}</div></div><div class="stat"><div class="k">Entrada</div><div class="v">${fmtTok(u.totals.input)}</div></div><div class="stat"><div class="k">Salida</div><div class="v">${fmtTok(u.totals.output)}</div></div><div class="stat"><div class="k">Ahorro por caché</div><div class="v" style="color:var(--ok)">${fmtUsd(u.totals.cacheSaved)}</div></div>`;
    return d;
  };
  const d = await loadAll();
  // Al abrir: si los datos de Claude tienen más de 2 min (o no hay), se piden solos.
  const stale = l => !l || !l.checkedAt || Date.now() / 1000 - l.checkedAt > 120;
  if (d && S.st.providerReady.claude && stale(d.claude)) refreshClaude(true);
  clearInterval(S.usageTimer);
  let tick = 0;
  S.usageTimer = setInterval(async () => {
    if (!alive()) return clearInterval(S.usageTimer);
    if (document.visibilityState !== 'visible') return;
    tick++;
    const dd = await loadAll(); // cada 15 s: lo último registrado (sin gastar tokens)
    if (dd && tick % 8 === 0 && S.st.providerReady.claude && stale(dd.claude)) refreshClaude(true); // cada 2 min: consulta mínima
  }, 15000);
}

function providerUsageCard(id, p) {
  const rows = [];
  const rate = p.rate && typeof p.rate === 'object' ? p.rate : null;
  const names = { requests: 'Peticiones', tokens: 'Tokens', 'input-tokens': 'Tokens de entrada', 'output-tokens': 'Tokens de salida' };
  if (rate) for (const k of ['requests', 'tokens', 'input-tokens', 'output-tokens']) {
    const r = rate[k]; if (!r || !r.limit) continue;
    const used = Math.max(0, Math.round((1 - r.remaining / r.limit) * 100));
    rows.push(`<div class="ubar sm"><div class="row"><span>${names[k]}</span><span class="muted" style="font-size:12px">${r.reset ? 'reinicio ' + esc(fmtRateReset(r.reset)) : ''}</span><span style="flex:1"></span><span class="mono">${fmtN(r.remaining)} / ${fmtN(r.limit)} libres</span></div><div class="track"><div style="width:${used}%"></div></div></div>`);
  }
  const a = p.account;
  if (a && a.kind === 'credits') {
    const limit = a.limit == null ? null : +a.limit;
    rows.push(`<div class="ubar sm"><div class="row"><span>Créditos${a.free ? ' · nivel gratuito' : ''}</span><span style="flex:1"></span><span class="mono">${fmtUsd(+a.used || 0)} usados${limit ? ' de ' + fmtUsd(limit) : ' (sin límite)'}</span></div>${limit ? `<div class="track"><div style="width:${pct(+a.used, limit)}%"></div></div>` : ''}</div>`);
  }
  if (a && a.kind === 'characters') {
    rows.push(`<div class="ubar sm"><div class="row"><span>Caracteres del plan${a.tier ? ' · ' + esc(a.tier) : ''}</span><span class="muted" style="font-size:12px">${a.resetsAt ? fmtReset(a.resetsAt) : ''}</span><span style="flex:1"></span><span class="mono">${fmtN(a.used)} / ${fmtN(a.limit)}</span></div><div class="track"><div style="width:${pct(+a.used, +a.limit)}%"></div></div></div>`);
  }
  if (!rows.length) rows.push(`<div class="muted" style="font-size:12.5px">${p.kind === 'codex-cli' ? 'Codex CLI no informa de los límites de tu plan de ChatGPT.' : p.kind === 'openai' && ['gemini'].includes(id) ? 'Gemini no devuelve sus límites en las respuestas: ábrelos con «Uso» o «Límites».' : id === 'cloudflare' ? 'Gratis hasta 10.000 neuronas al día (se reinicia a las 00:00 UTC); el consumo exacto se ve en el panel de Cloudflare.' : 'Aún no hay datos de límites: aparecerán al usarlo o con «Comprobar».'}</div>`);
  return `<div class="card pu"><div class="row" style="margin-bottom:8px">${brandTile(id, p.label, 26)}<span class="dot ${p.ready ? 'on' : ''}"></span><b>${esc(p.label)}</b>${p.free ? `<span class="chip eco">${ico('zap', 11)} gratis</span>` : ''}<span style="flex:1"></span>
      ${usageLinks(id)}<span class="muted" style="font-size:12.5px">7 días: ${fmtTok(p.week.tokens)} tok${p.week.cost ? ' · ' + fmtUsd(p.week.cost) : ''} · ${p.week.calls} llamadas</span>${p.ready && p.kind !== 'elevenlabs' ? `<button class="btn sm" data-check="${esc(id)}">Comprobar</button>` : ''}</div>${rows.join('')}</div>`;
}

function fmtRateReset(r) {
  if (/^\d{4}-\d\d-\d\d/.test(r)) { const d = new Date(r); const s = Math.max(0, Math.round((d - Date.now()) / 1000)); return s < 120 ? `en ${s} s` : `en ${Math.round(s / 60)} min`; }
  return 'en ' + r;
}

function setModels(body, cfg, save) {
  const ready = S.st.providerReady;
  const d = cfg.defaults || { model: 'anthropic:claude-opus-5-5', effort: 'medium', mode: 'auto' };
  body.innerHTML = `<section class="block"><h2>Modelo por defecto</h2><p>Lo usan todos los agentes salvo que les pongas otro en Agentes. Por defecto: Claude Opus 5.5 con esfuerzo medio.</p>
      <div class="form three"><label>Modelo${modelPickerHtml('dm', d.model)}</label>
      <label>Esfuerzo<select class="in" id="de">${EFFORT_LEVELS.map(([k, l]) => `<option value="${k}" ${d.effort === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
      <label>Modo de permisos inicial<select class="in" id="dmo">${MODES.map(m => `<option value="${m.id}" ${d.mode === m.id ? 'selected' : ''}>${m.label}</option>`).join('')}</select></label></div>
      <datalist id="models">${MODEL_SUGGESTIONS.map(m => `<option value="${m}">`).join('')}</datalist>
      <div class="row" style="margin-top:12px"><button class="btn primary" id="svd">Guardar</button><button class="btn" id="apply">Aplicar a todos los agentes</button></div></section>
    <section class="block"><h2>Enrutado y ahorro</h2><div class="form two">
      <label>Planificador<select class="in" id="rplan"><option value="llm">Orquestador IA</option><option value="heuristic">Palabras clave (0 tokens)</option></select></label>
      <label>Compresión de la pizarra<select class="in" id="rsum"><option value="heuristic">Heurística (0 tokens)</option><option value="llm">IA</option></select></label></div>
      <label class="check" style="margin-top:12px"><input type="checkbox" id="reco" ${cfg.routing.economy ? 'checked' : ''}> ${ico('zap', 14)} Modo ahorro: probar primero los modelos gratuitos o locales</label></section>
    <section class="block"><h2>Proveedores</h2><p>Cualquier API compatible con OpenAI se añade con su URL base.</p><div id="provs" class="form"></div>
      <div class="row" style="margin-top:10px"><button class="btn" id="addProv">${ico('plus', 14)} Añadir proveedor</button><button class="btn" id="testAll">${ico('play', 13)} Probar todos los configurados</button><button class="btn primary" id="svp">Guardar proveedores</button></div></section>`;
  $('#rplan', body).value = cfg.routing.planner; $('#rsum', body).value = cfg.routing.summarizer;
  wireModelPicker($('#dm', body));
  const readDefaults = () => { cfg.defaults = { model: $('#dm').value.trim(), effort: $('#de').value, mode: $('#dmo').value }; cfg.routing.planner = $('#rplan').value; cfg.routing.summarizer = $('#rsum').value; cfg.routing.economy = $('#reco').checked; };
  $('#svd', body).onclick = async () => { readDefaults(); await save(); };
  $('#apply', body).onclick = async () => {
    readDefaults();
    if (!await ask(`¿Poner ${cfg.defaults.model} con esfuerzo ${cfg.defaults.effort} en todos los agentes? Sus modelos de respaldo se mantienen.`)) return;
    cfg.agents = cfg.agents.map(a => a.plugin ? a : { ...a, model: cfg.defaults.model, effort: cfg.defaults.effort });
    await save('Aplicado a todos los agentes');
  };
  const drawProvs = () => {
    $('#provs').innerHTML = Object.entries(cfg.providers).sort((a, b) => (ready[b[0]] - ready[a[0]]) || (b[1].free - a[1].free)).map(([id, p]) => `<div class="card" style="padding:12px 14px"><div class="row" style="margin-bottom:6px">${brandTile(id, p.label, 30)}<span class="dot ${ready[id] ? 'on' : ''}"></span><b>${esc(p.label || id)}</b>${KEY_URLS[id] && !p.apiKey ? `<a class="keylink" href="${KEY_URLS[id]}" target="_blank" rel="noopener">${ico('key', 12)} Obtener clave</a>` : usageLinks(id)}<span class="mono muted">${esc(id)}</span>${p.free ? `<span class="chip eco">${ico('zap', 12)} ${p.type === 'claude-code' ? 'tu plan' : 'gratis'}</span>` : ''}${p.responsesApi ? `<span class="chip">${ico('globe', 12)} búsqueda web</span>` : ''}<span style="flex:1"></span>${p.type !== 'elevenlabs' ? `<button class="btn sm" data-ptest="${esc(id)}">${ico('play', 12)} Probar</button>` : ''}<button class="btn sm" data-models="${esc(id)}">${ico('search', 13)} Ver modelos</button><button class="btn sm danger" data-rmp="${esc(id)}">Quitar</button></div>
      ${p.note ? `<div class="muted" style="font-size:12.5px;margin-bottom:8px">${esc(p.note)}</div>` : ''}<div class="models-out" data-mo="${esc(id)}"></div>
      <div class="form three"><label>Tipo<select class="in" data-pf="${esc(id)}.type">${[['anthropic', 'anthropic'], ['openai', 'openai (compatible)'], ['claude-code', 'Claude Code (suscripción)'], ['mock', 'demo']].map(([k, l]) => `<option value="${k}" ${p.type === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
      ${(p.baseUrl || '').includes('{account_id}') ? `<label>ID de cuenta<input type="text" data-pf="${esc(id)}.accountId" value="${esc(p.accountId || '')}" placeholder="Workers AI → Usar REST API → Account ID"></label>` : `<label>${p.type === 'claude-code' ? 'Ruta de claude.exe (vacío = automática)' : 'URL base'}<input type="text" data-pf="${esc(id)}.baseUrl" value="${esc(p.baseUrl)}"></label>`}
      ${p.type === 'claude-code' ? '<label>Sesión<input type="text" disabled value="En Ajustes → Cuenta"></label>' : `<label>API key ${p.noKeyNeeded ? '(no necesaria)' : ''}<div class="keybox"><input type="password" data-pf="${esc(id)}.apiKey" value="${esc(p.apiKey)}" placeholder="${p.noKeyNeeded ? 'local' : 'pega tu clave'}" autocomplete="off"><button type="button" class="icon-btn" data-eye="${esc(id)}" title="Ver u ocultar la clave">${ico('eye', 15)}</button></div></label>`}</div></div>`).join('');
    $$('[data-rmp]').forEach(b => b.onclick = async () => { if (await ask('¿Quitar proveedor?', { ok: 'Quitar', danger: true })) { delete cfg.providers[b.dataset.rmp]; drawProvs(); } });
    $$('[data-pf]').forEach(inp => inp.onchange = () => { const [id, f] = inp.dataset.pf.split('.'); cfg.providers[id][f] = inp.value; });
    $$('[data-ptest]').forEach(b => b.onclick = () => testProvider(b.dataset.ptest));
    $$('[data-eye]').forEach(b => b.onclick = async () => {
      const inp = b.parentElement.querySelector('input');
      if (inp.type === 'text') { inp.type = 'password'; return; }
      if (inp.value.startsWith('••')) {
        try { const r = await api('GET', `/api/providers/${encodeURIComponent(b.dataset.eye)}/key`); inp.value = r.key; cfg.providers[b.dataset.eye].apiKey = r.key; } catch (e) { toast(e.message); return; }
      }
      inp.type = 'text';
    });
    $$('[data-models]').forEach(b => b.onclick = async () => {
      const id = b.dataset.models, out = $(`[data-mo="${CSS.escape(id)}"]`);
      out.innerHTML = '<div class="muted" style="font-size:12.5px">Consultando… (guarda antes si acabas de pegar la clave)</div>';
      try {
        const { models } = await api('GET', `/api/providers/${encodeURIComponent(id)}/models`);
        out.innerHTML = `<div class="model-list">${models.slice(0, 300).map(m => `<button class="chip" data-copy="${esc(id + ':' + m)}">${m.endsWith(':free') ? ico('zap', 11) + ' ' : ''}${esc(m)}</button>`).join('') || '<span class="muted">Sin modelos</span>'}</div>`;
        $$('[data-copy]', out).forEach(c => c.onclick = async () => { await navigator.clipboard.writeText(c.dataset.copy); toast('Copiado ' + c.dataset.copy); });
      } catch (e) { out.innerHTML = `<div class="err" style="font-size:12.5px">${esc(e.message.slice(0, 200))}</div>`; }
    });
  };
  async function testProvider(id) {
    const out = $(`[data-mo="${CSS.escape(id)}"]`);
    out.innerHTML = '<div class="muted" style="font-size:12.5px;margin-bottom:8px">Probando con una petición real mínima…</div>';
    try {
      const r = await api('POST', `/api/providers/${encodeURIComponent(id)}/test`, {});
      out.innerHTML = r.ok ? `<div class="test ok">${ico('tick', 13)} Funciona · ${esc(r.model)} · ${r.ms} ms · «${esc((r.text || '').trim())}»</div>` : `<div class="test bad">${ico('x', 13)} ${esc(r.error || 'Error')}</div>`;
    } catch (e) { out.innerHTML = `<div class="test bad">${ico('x', 13)} ${esc(e.message.slice(0, 200))}</div>`; }
  }
  drawProvs();
  $('#testAll', body).onclick = async () => { readDefaults(); await save('Guardado; probando…'); for (const id of Object.keys(cfg.providers)) if (S.st.providerReady[id]) await testProvider(id); };
  $('#addProv', body).onclick = async () => {
    const id = (await askText('ID corto del proveedor (ej. deepseek, azure):') || '').trim().toLowerCase().replace(/[^a-z0-9_-]/g, '');
    if (!id) return;
    cfg.providers[id] = { label: id, type: 'openai', baseUrl: 'https://', apiKey: '', noKeyNeeded: false, headers: {}, free: false, responsesApi: false, note: '' }; drawProvs();
  };
  $('#svp', body).onclick = async () => { readDefaults(); await save('Proveedores guardados'); };
}

// Catálogo de conectores (servidores MCP remotos oficiales verificados + integraciones propias)
const CATALOG = [
  { id: 'github', name: 'GitHub', color: '#24292f', letter: 'GH', desc: 'Repositorios, issues, pull requests y Actions.', url: 'https://api.githubcopilot.com/mcp/', auth: 'gh', agents: ['codigo'], headers: { 'X-MCP-Toolsets': 'repos,issues,pull_requests,actions' } },
  { id: 'vercel', name: 'Vercel', color: '#111111', letter: '▲', desc: 'Proyectos, despliegues, logs y dominios.', url: 'https://mcp.vercel.com', auth: 'oauth', agents: ['codigo'] },
  { id: 'notion', name: 'Notion', color: '#373530', letter: 'N', desc: 'Páginas y bases de datos de tu espacio.', url: 'https://mcp.notion.com/mcp', auth: 'oauth', agents: ['investigador', 'narrativa'] },
  { id: 'linear', name: 'Linear', color: '#5e6ad2', letter: 'L', desc: 'Issues, proyectos y ciclos.', url: 'https://mcp.linear.app/mcp', auth: 'oauth', agents: ['codigo'] },
  { id: 'obsidian', name: 'Obsidian', desc: 'Tu bóveda de notas: buscar, leer y escribir notas con [[enlaces]] (local).', auth: 'vault', agents: ['investigador', 'narrativa', 'contenido', 'revisor'] },
  { id: 'elevenlabs', name: 'ElevenLabs', color: '#000000', letter: '11', desc: 'Tus voces, texto a voz, efectos de sonido y música.', auth: 'apikey', agents: ['audio'] },
  { id: 'gdrive', name: 'Google Drive', color: '#1a73e8', letter: 'D', desc: 'Archivos de Drive. Vista previa para desarrolladores de Google: requiere tu cliente OAuth de Google Cloud.', url: 'https://drivemcp.googleapis.com/mcp/v1', auth: 'google', agents: ['investigador'] },
  { id: 'gmail', name: 'Gmail', color: '#ea4335', letter: 'M', desc: 'Correo de Gmail. Vista previa para desarrolladores: requiere tu cliente OAuth.', url: 'https://gmailmcp.googleapis.com/mcp/v1', auth: 'google', agents: ['investigador'] },
  { id: 'gcalendar', name: 'Google Calendar', color: '#188038', letter: 'C', desc: 'Eventos y calendarios. Vista previa para desarrolladores: requiere tu cliente OAuth.', url: 'https://calendarmcp.googleapis.com/mcp/v1', auth: 'google', agents: ['investigador'] },
];

async function setConnectors(body, cfg, save) {
  const m = await api('GET', '/api/mcp');
  const servers = cfg.mcpServers || {};
  const status = Object.fromEntries(m.servers.map(s => [s.name, s]));
  const elKey = cfg.providers.elevenlabs?.apiKey;
  const isOn = c => c.auth === 'vault' ? !!cfg.obsidianVault : c.auth === 'apikey' ? !!elKey : !!servers[c.id] && (servers[c.id].oauth || servers[c.id].token || servers[c.id].tokenCommand || c.auth === 'none');
  const tile = c => brandTile(c.id, c.name, 38);
  const extra = Object.entries(servers).filter(([k]) => !CATALOG.some(c => c.id === k));
  body.innerHTML = `<section class="block"><h2>Conectores</h2><p>Dale a tus agentes acceso a tus herramientas y datos. Usan el estándar MCP, igual que los conectores de Claude. Las acciones que cambian algo siguen el modo de permisos.</p>
      <div class="conn-grid">${CATALOG.map(c => { const on = isOn(c); return `<div class="conn ${on ? 'on' : ''}">${tile(c)}<div class="conn-txt"><b>${esc(c.name)}</b><span>${esc(c.desc)}</span></div>
        <div class="conn-act">${on ? `<span class="chip eco">${ico('tick', 12)} Conectado</span><button class="btn sm" data-off="${c.id}">Desconectar</button>` : `<button class="btn sm primary" data-on="${c.id}">Conectar</button>`}</div></div>`; }).join('')}
      ${m.modpackDetected || servers['modpack-launcher'] ? `<div class="conn ${servers['modpack-launcher'] ? 'on' : ''}"><div class="tile" style="background:#4f9d69">${ico('play', 16)}</div><div class="conn-txt"><b>Modpack Launcher</b><span>Instancias, mods, crashes, registro del juego y control en vivo (local).</span></div><div class="conn-act">${servers['modpack-launcher'] ? `<span class="chip eco">${ico('tick', 12)} Detectado</span>` : '<button class="btn sm primary" id="det">Detectar</button>'}</div></div>` : ''}
      <div class="conn add" id="custom"><div class="tile" style="background:var(--soft);color:var(--text)">${ico('plus', 16)}</div><div class="conn-txt"><b>Conector personalizado</b><span>Cualquier servidor MCP remoto (URL) o local (orden), o importa un .mcp.json.</span></div><div class="conn-act"><button class="btn sm">Añadir</button></div></div></div></section>
    <section class="block"><h2>Servidores activos</h2>
      ${m.servers.length ? m.servers.map(s => `<div class="card" style="padding:10px 14px;margin-bottom:8px"><div class="row"><span class="dot ${s.running ? 'on' : ''}" title="${s.running ? 'En marcha' : 'Parado'}"></span><b>${esc(s.label || s.name)}</b><span class="mono muted">${esc(s.name)}</span>${s.running ? `<span class="chip">${s.tools} herramientas</span>` : ''}<span style="flex:1"></span>
        <span class="muted" style="font-size:12.5px">${esc(agentsUsing(cfg, s.name))}</span><label class="check"><input type="checkbox" data-en="${esc(s.name)}" ${s.enabled ? 'checked' : ''}> activo</label><button class="btn sm" data-test="${esc(s.name)}">Probar</button></div><div data-out="${esc(s.name)}"></div></div>`).join('') : '<div class="muted">Ninguno todavía.</div>'}
      ${extra.length ? '' : ''}</section>
    <section class="block"><h2>Carpetas de skills</h2><p>Skills en formato Claude (<span class="mono">carpeta/skill/SKILL.md</span>).</p>
      ${(cfg.skillDirs || []).map((d, i) => `<div class="row" style="margin-bottom:6px"><span class="chip">${esc(d.label || 'skills')}</span><span class="mono muted" style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(d.path)}</span><button class="btn sm danger" data-rsd="${i}">Quitar</button></div>`).join('') || '<div class="muted">Ninguna.</div>'}</section>`;

  const assign = (name, ids) => { for (const a of cfg.agents) if (ids.includes(a.id) && !(a.mcp || []).includes(name)) a.mcp = [...(a.mcp || []), name]; };
  const unassign = name => { for (const a of cfg.agents) a.mcp = (a.mcp || []).filter(x => x !== name); };
  const reload = () => viewSettings($('#view'));
  const oauthFlow = async name => {
    await save('Abriendo el inicio de sesión…');
    const r = await api('POST', `/api/mcp/${encodeURIComponent(name)}/connect`);
    toast('Completa el inicio de sesión en el navegador');
    for (let i = 0; i < 60; i++) { await new Promise(r => setTimeout(r, 3000)); await loadState(); const s = S.st.config.mcpServers?.[name]; if (s?.oauth) { toast('Conectado'); return reload(); } }
    toast('No se completó el inicio de sesión'); return r;
  };

  $$('[data-on]', body).forEach(b => b.onclick = () => connectWizard(CATALOG.find(x => x.id === b.dataset.on), cfg, save, reload, assign));
  $$('[data-off]', body).forEach(b => b.onclick = async () => {
    const id = b.dataset.off;
    if (!await ask('¿Desconectar? Se borran sus credenciales en faisp.', { ok: 'Desconectar', danger: true })) return;
    if (id === 'elevenlabs') { cfg.providers.elevenlabs.apiKey = ''; unassign('elevenlabs'); await save('Desconectado'); return reload(); }
    if (id === 'obsidian') { cfg.obsidianVault = ''; unassign('obsidian'); await save('Obsidian desconectado'); return reload(); }
    await api('POST', `/api/mcp/${encodeURIComponent(id)}/disconnect`).catch(() => {});
    await loadState(); const c2 = structuredClone(S.st.config); delete c2.mcpServers[id]; for (const a of c2.agents) a.mcp = (a.mcp || []).filter(x => x !== id);
    await api('PUT', '/api/config', c2); await loadState(); toast('Desconectado'); reload();
  });
  $('#custom', body).onclick = () => modal('Conector personalizado', `<div class="form">
      <label>Nombre (id corto)<input type="text" id="cn" placeholder="mi-servidor"></label>
      <label>Tipo<select class="in" id="ct"><option value="http">Remoto (URL)</option><option value="stdio">Local (orden)</option><option value="import">Importar .mcp.json</option></select></label>
      <label>URL, orden o ruta del .mcp.json<input type="text" id="cu" placeholder="https://… · C:\\ruta\\servidor.exe args · C:\\ruta\\.mcp.json"></label>
      <label>Token Bearer (opcional; si no, se intentará OAuth)<input type="password" id="ck" autocomplete="off"></label>
      <label>Agentes que lo usan<div class="row">${cfg.agents.filter(a => a.id !== 'orquestador').map(a => `<label class="check"><input type="checkbox" value="${esc(a.id)}" ${a.id === 'codigo' ? 'checked' : ''}> ${esc(a.name)}</label>`).join('')}</div></label></div>`,
    [{ label: 'Cancelar' }, { label: 'Añadir', cls: 'primary', run: async o => {
      const name = $('#cn', o).value.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '-'); const t = $('#ct', o).value; const u = $('#cu', o).value.trim(); const tok = $('#ck', o).value.trim();
      const ids = $$('input[type=checkbox]:checked', o).map(c => c.value);
      if (t === 'import') { const r = await api('POST', '/api/mcp/import', { path: u }); await loadState(); toast(`${r.imported} importados`); return reload(); }
      if (!name || !u) throw new Error('Nombre y URL/orden son obligatorios');
      if (t === 'http') cfg.mcpServers[name] = { label: name, transport: 'http', url: u, token: tok, enabled: true, source: 'personalizado', headers: {} };
      else { const parts = u.match(/"[^"]+"|\S+/g).map(x => x.replace(/^"|"$/g, '')); cfg.mcpServers[name] = { label: name, transport: 'stdio', command: parts[0], args: parts.slice(1), enabled: true, source: 'personalizado', env: {} }; }
      assign(name, ids);
      if (t === 'http' && !tok) return oauthFlow(name);
      await save('Conector añadido'); reload();
    } }]);
  $('#det', body)?.addEventListener('click', async () => { const r = await api('POST', '/api/integrations/detect'); await loadState(); toast(r.changed ? 'Modpack Launcher integrado' : 'Ya estaba integrado'); reload(); });
  $$('[data-en]', body).forEach(c => c.onchange = async () => { cfg.mcpServers[c.dataset.en].enabled = c.checked; await save(); });
  $$('[data-rsd]', body).forEach(b => b.onclick = async () => { cfg.skillDirs.splice(+b.dataset.rsd, 1); await save(); reload(); });
  $$('[data-test]', body).forEach(b => b.onclick = async () => {
    const out = $(`[data-out="${CSS.escape(b.dataset.test)}"]`, body);
    out.innerHTML = '<div class="muted" style="font-size:12.5px;margin-top:8px">Conectando…</div>';
    try {
      const r = await api('POST', `/api/mcp/${encodeURIComponent(b.dataset.test)}/test`);
      out.innerHTML = `<div class="model-list" style="margin-top:8px">${r.tools.map(t => `<span class="chip" title="${esc(t.description)}">${t.readOnly ? ico('eye', 11) : ico('pencil', 11)} ${esc(t.name)}</span>`).join('')}</div>`;
    } catch (e) { out.innerHTML = `<div class="err" style="font-size:12.5px;margin-top:8px">${esc(e.message.slice(0, 300))}</div>`; }
  });
}

const CONNECT_HELP = {
  github: { tokenUrl: 'https://github.com/settings/personal-access-tokens/new' },
  elevenlabs: { keyUrl: 'https://elevenlabs.io/app/settings/api-keys' },
  google: { preview: 'https://developers.google.com/workspace/preview', library: 'https://console.cloud.google.com/apis/library', credentials: 'https://console.cloud.google.com/apis/credentials', api: { gdrive: 'drivemcp.googleapis.com', gmail: 'gmailmcp.googleapis.com', gcalendar: 'calendarmcp.googleapis.com' } },
};
const REDIRECT_URI = 'http://127.0.0.1:4317/oauth/callback';

function connectWizard(c, cfg, save, reload, assign) {
  const head = `<div class="wiz-head">${brandTile(c.id, c.name, 44)}<div><b>Conectar ${esc(c.name)}</b><div class="muted" style="font-size:13px">${esc(c.desc)}</div></div></div>`;
  const base = { label: c.name, description: c.desc, transport: 'http', url: c.url, enabled: true, source: 'catálogo', headers: c.headers || {} };
  const finishOAuth = async (o, name) => {
    const body = o.querySelector('.body'); const foot = o.querySelector('footer');
    foot.innerHTML = '<button class="btn" data-cancel>Cancelar</button>';
    body.innerHTML = head + `<div class="wiz-wait"><svg class="spark" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M18.4 5.6l-2.8 2.8M8.4 15.6l-2.8 2.8"/></svg><div><b>Esperando la autorización…</b><div class="muted" style="font-size:13px">Se abrió tu navegador. Inicia sesión en ${esc(c.name)} y acepta el acceso de faisp; esto se actualiza solo.</div></div></div>`;
    let cancelled = false;
    foot.querySelector('[data-cancel]').onclick = () => { cancelled = true; o.remove(); };
    try {
      await save('Guardado');
      await api('POST', `/api/mcp/${encodeURIComponent(name)}/connect`);
    } catch (e) { body.insertAdjacentHTML('beforeend', `<div class="test bad">${ico('x', 13)} ${esc(e.message.slice(0, 300))}</div>`); return; }
    for (let i = 0; i < 100 && !cancelled; i++) {
      await new Promise(r => setTimeout(r, 3000));
      await loadState();
      if (S.st.config.mcpServers?.[name]?.oauth) {
        const t = await api('POST', `/api/mcp/${encodeURIComponent(name)}/test`).catch(e => ({ error: e.message }));
        body.innerHTML = head + (t.error ? `<div class="test bad">${ico('x', 13)} Autorizado, pero falló la conexión: ${esc(t.error.slice(0, 200))}</div>` : `<div class="test ok">${ico('tick', 13)} Conectado · ${t.tools.length} herramientas disponibles</div>`);
        foot.innerHTML = '<button class="btn primary" data-done>Listo</button>';
        foot.querySelector('[data-done]').onclick = () => { o.remove(); reload(); };
        return;
      }
    }
    if (!cancelled) body.insertAdjacentHTML('beforeend', '<div class="test bad">No se completó la autorización. Puedes cerrar y volver a intentarlo.</div>');
  };

  if (c.auth === 'vault') {
    api('GET', '/api/obsidian/vaults').then(({ vaults }) => {
      const o = modal('', head + (vaults.length ? `<p>Bóvedas encontradas en este PC:</p><div class="choice">${vaults.map((v, i) => `<label class="opt"><input type="radio" name="vlt" value="${esc(v.path)}" ${i === 0 ? 'checked' : ''}><div><b>${esc(v.name)}</b><span class="mono">${esc(v.path)}</span></div></label>`).join('')}</div>`
        : '<p class="muted">No encontré Obsidian en este PC. Puedes elegir cualquier carpeta de notas Markdown (una bóveda de Obsidian es eso: una carpeta).</p>')
        + `<div class="row" style="margin-top:8px"><button class="btn sm" id="vPick">${ico('folder', 13)} Elegir otra carpeta…</button><span class="mono muted" id="vPicked" style="font-size:12px"></span></div>
        <p class="muted" style="font-size:12.5px">Las notas se leen y escriben directamente en tu disco (no salen de tu PC salvo lo que el agente envíe al modelo). Las escrituras siguen el modo de permisos y guardan copia.</p>`,
        [{ label: 'Cancelar' }, { label: 'Conectar', cls: 'primary', run: async o => {
          const picked = o.querySelector('#vPicked').dataset.path || o.querySelector('input[name=vlt]:checked')?.value;
          if (!picked) throw new Error('Elige una bóveda o una carpeta');
          cfg.obsidianVault = picked; assign('obsidian', c.agents); await save('Obsidian conectado'); reload();
        } }]);
      o.querySelector('header').remove();
      o.querySelector('#vPick').onclick = async () => { const { path } = await api('POST', '/api/pick-folder'); if (path) { const e = o.querySelector('#vPicked'); e.textContent = path; e.dataset.path = path; o.querySelectorAll('input[name=vlt]').forEach(r => r.checked = false); } };
    });
    return;
  }
  if (c.auth === 'apikey') {
    const o = modal('', head + `<ol class="steps"><li>Abre <a href="${CONNECT_HELP.elevenlabs.keyUrl}" target="_blank" rel="noopener">tus claves de ElevenLabs</a> y crea una (con permiso de voces, texto a voz, efectos y música).</li><li>Pégala aquí:</li></ol>
      <div class="form"><div class="keybox"><input type="password" id="wKey" placeholder="sk_…" autocomplete="off"><button type="button" class="icon-btn" id="wEye">${ico('eye', 15)}</button></div><div id="wOut"></div></div>`,
      [{ label: 'Cancelar' }, { label: 'Conectar', cls: 'primary', run: async o => {
        const key = o.querySelector('#wKey').value.trim(); if (!key) throw new Error('Pega la clave');
        cfg.providers.elevenlabs = { ...(cfg.providers.elevenlabs || { label: 'ElevenLabs', type: 'elevenlabs', baseUrl: 'https://api.elevenlabs.io' }), apiKey: key };
        assign('elevenlabs', c.agents); await save('ElevenLabs conectado');
        const d = await api('GET', '/api/limits').catch(() => null); const acc = d?.providers?.elevenlabs?.account;
        if (!acc) { o.querySelector('#wOut').innerHTML = `<div class="test bad">${ico('x', 13)} Guardada, pero no pude leer tu cuenta: revisa la clave.</div>`; return true; }
        toast(`ElevenLabs conectado · plan ${acc.tier || ''}`); reload();
      } }]);
    o.querySelector('header').remove();
    o.querySelector('#wEye').onclick = () => { const i = o.querySelector('#wKey'); i.type = i.type === 'password' ? 'text' : 'password'; };
    return;
  }
  if (c.auth === 'gh') {
    const o = modal('', head + `<div class="choice"><label class="opt"><input type="radio" name="gm" value="gh" checked><div><b>Usar mi sesión de GitHub CLI</b><span>Recomendado. faisp pide el token a <span class="mono">gh</span> cada vez; no guarda nada.</span></div></label>
      <label class="opt"><input type="radio" name="gm" value="pat"><div><b>Token personal (PAT)</b><span>Créalo en <a href="${CONNECT_HELP.github.tokenUrl}" target="_blank" rel="noopener">GitHub → Tokens</a> con acceso a los repos que quieras.</span></div></label>
      <div class="form" id="patBox" style="display:none"><input type="password" id="wPat" placeholder="github_pat_…" autocomplete="off"></div></div><div id="wOut"></div>`,
      [{ label: 'Cancelar' }, { label: 'Conectar', cls: 'primary', run: async o => {
        const mode = o.querySelector('input[name=gm]:checked').value;
        const srv = { ...base };
        if (mode === 'gh') srv.tokenCommand = 'gh auth token'; else { const t = o.querySelector('#wPat').value.trim(); if (!t) throw new Error('Pega el token'); srv.token = t; }
        cfg.mcpServers[c.id] = srv; assign(c.id, c.agents); await save('Guardado');
        const out = o.querySelector('#wOut'); out.innerHTML = '<div class="muted" style="margin-top:10px">Comprobando…</div>';
        const t = await api('POST', `/api/mcp/${c.id}/test`).catch(e => ({ error: e.message }));
        if (t.error) { out.innerHTML = `<div class="test bad">${ico('x', 13)} ${esc(t.error.slice(0, 220))}</div>`; return true; }
        toast(`GitHub conectado · ${t.tools.length} herramientas`); reload();
      } }]);
    o.querySelector('header').remove();
    o.querySelectorAll('input[name=gm]').forEach(r => r.onchange = () => { o.querySelector('#patBox').style.display = o.querySelector('input[name=gm]:checked').value === 'pat' ? '' : 'none'; });
    return;
  }
  if (c.auth === 'google') {
    const g = CONNECT_HELP.google;
    const o = modal('', head + `<div class="test warnbox">${ico('alert', 13)} Google ofrece estos conectores en vista previa para desarrolladores y exige que crees tu propio cliente OAuth. Es una configuración única.</div>
      <ol class="steps">
        <li>Únete al <a href="${g.preview}" target="_blank" rel="noopener">programa de vista previa de Google Workspace</a>.</li>
        <li>En Google Cloud, activa la API <span class="mono">${g.api[c.id]}</span> desde la <a href="${g.library}" target="_blank" rel="noopener">biblioteca de APIs</a>.</li>
        <li>En <a href="${g.credentials}" target="_blank" rel="noopener">Credenciales</a>, crea un «ID de cliente de OAuth» de tipo <b>Aplicación web</b> y añade esta URI de redirección autorizada:
          <div class="copyline"><span class="mono">${REDIRECT_URI}</span><button class="btn sm" id="wCopy">${ico('copy', 12)} Copiar</button></div></li>
        <li>Pega aquí el ID y el secreto del cliente:</li></ol>
      <div class="form"><label>Client ID<input type="text" id="wCid" placeholder="…apps.googleusercontent.com" value="${esc(cfg.mcpServers?.[c.id]?.oauthClientId || '')}"></label><label>Client secret<input type="password" id="wSec" autocomplete="off"></label></div>`,
      [{ label: 'Cancelar' }, { label: 'Continuar en el navegador', cls: 'primary', run: async o => {
        const id = o.querySelector('#wCid').value.trim(), sec = o.querySelector('#wSec').value.trim();
        if (!id || !sec) throw new Error('Faltan el Client ID o el secret');
        cfg.mcpServers[c.id] = { ...base, oauthClientId: id, oauthClientSecret: sec }; assign(c.id, c.agents);
        finishOAuth(o, c.id); return true;
      } }]);
    o.querySelector('header').remove();
    o.querySelector('#wCopy').onclick = async () => { await navigator.clipboard.writeText(REDIRECT_URI); toast('URI copiada'); };
    return;
  }
  // OAuth estándar (Vercel, Notion, Linear)
  const o = modal('', head + `<ol class="steps"><li>Se abrirá tu navegador en la página oficial de ${esc(c.name)}.</li><li>Inicia sesión y acepta el acceso de <b>faisp</b>.</li><li>Vuelve aquí: la conexión se completa sola.</li></ol>
    <p class="muted" style="font-size:12.5px">faisp guarda el permiso solo en este PC. Puedes desconectarlo cuando quieras.</p>`,
    [{ label: 'Cancelar' }, { label: 'Continuar en el navegador', cls: 'primary', run: async o => { cfg.mcpServers[c.id] = base; assign(c.id, c.agents); finishOAuth(o, c.id); return true; } }]);
  o.querySelector('header').remove();
}

function agentsUsing(cfg, name) {
  const list = cfg.agents.filter(a => (a.mcp || []).includes(name)).map(a => a.name);
  return list.length ? 'Lo usan: ' + list.join(', ') : 'Ningún agente lo usa';
}

function setBudget(body, cfg, save) {
  body.innerHTML = `<section class="block"><h2>Presupuesto de contexto</h2><div class="form three">
      ${[['historyTurns', 'Turnos de historial'], ['blackboardItems', 'Eventos de pizarra visibles'], ['maxFileChars', 'Máx. caracteres por archivo'], ['maxFilesPerStep', 'Máx. archivos adjuntos/paso'], ['compressAt', 'Comprimir pizarra a partir de (tok)'], ['maxToolRounds', 'Máx. rondas de herramientas'], ['monthlyUsdLimit', 'Límite mensual USD (0 = sin límite)']].map(([k, l]) => `<label>${l}<input type="number" data-b="${k}" value="${cfg.budget[k]}"></label>`).join('')}</div></section>
    <section class="block"><h2>Precios (USD por millón: entrada, salida, caché)</h2><textarea class="in code" id="pricing" rows="6">${esc(JSON.stringify(cfg.pricing, null, 2))}</textarea></section>
    <button class="btn primary" id="sv">Guardar</button>`;
  $('#sv', body).onclick = async () => {
    try { $$('[data-b]', body).forEach(i => cfg.budget[i.dataset.b] = Number(i.value)); cfg.pricing = JSON.parse($('#pricing').value); await save(); }
    catch (e) { toast('Error: ' + e.message); }
  };
}

// ---------- Arranque ----------
addEventListener('focus', () => {
  if (S.view === 'settings' && (S.settingsTab === 'account' || S.settingsTab === 'usage')) viewSettings($('#view'));
});

(async function init() {
  $$('[data-i]').forEach(e => e.insertAdjacentHTML('afterbegin', ico(e.dataset.i, +e.dataset.s || 17)));
  $$('#sidebar .nav-item').forEach(b => { const l = $('.label', b); if (l && !b.title) b.title = l.textContent; });
  const toggleSide = window.toggleSide = () => { document.body.classList.toggle('collapsed'); store.set('collapsed', document.body.classList.contains('collapsed') ? '1' : '0'); syncOpenSide(); $('#toggleSide').title = document.body.classList.contains('collapsed') ? 'Abrir barra lateral (Ctrl+B)' : 'Contraer barra lateral (Ctrl+B)'; };
  $('#toggleSide').onclick = toggleSide;
  $('.brand img').onclick = () => { if (document.body.classList.contains('collapsed')) toggleSide(); };

  if (document.documentElement.classList.contains('pre-collapsed')) document.body.classList.add('collapsed');
  syncOpenSide(); addEventListener('resize', syncOpenSide);
  const ping = () => fetch('/api/ping', { method: 'POST' }).catch(() => {});
  ping(); setInterval(ping, 25000);
  try { await loadState(); await refreshArtifacts(); render(); }
  catch (e) { $('#view').innerHTML = `<div class="page err">No se pudo conectar con el servidor local: ${esc(e.message)}</div>`; }
})();
