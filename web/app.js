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
  list: '<path d="M9 6h11M9 12h11M9 18h11"/><path d="M4 6h.01M4 12h.01M4 18h.01" stroke-width="2.6"/>',
  terminal: '<rect x="3" y="4.5" width="18" height="15" rx="2.5"/><path d="m7.5 10 3 2.5-3 2.5M12.5 15h4"/>',
  diff: '<path d="M12 4v7M8.5 7.5h7M8.5 17h7"/><rect x="4" y="2.5" width="16" height="19" rx="2.5"/>',
  dots: '<path d="M5 12h.01M12 12h.01M19 12h.01" stroke-width="3"/>',
  arrowLeft: '<path d="M19 12H5M11 6l-6 6 6 6"/>',
  branch: '<circle cx="6" cy="5.5" r="2"/><circle cx="6" cy="18.5" r="2"/><circle cx="18" cy="7.5" r="2"/><path d="M6 7.5v9M18 9.5c0 4-6 3-11 7"/>',
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
  streaming: false, abort: null, attachments: [], queue: [], autoStick: true, planStatus: {}, agent: 'auto', mode: store.get('mode', ''), effort: store.get('effort', 'auto'), panelTab: 'board', artifactId: null,
  artifacts: [], lastPlan: null, code: [],
};

async function api(method, url, body) {
  const r = await fetch(url, { method, headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined });
  if (!r.ok) throw new Error((await r.text()) || r.statusText);
  const t = await r.text();
  return t ? JSON.parse(t) : null;
}
// Sin corrector del navegador (Edge): faisp tiene el suyo
document.addEventListener('focusin', e => { const t = e.target; if (t?.matches?.('input, textarea, [contenteditable]')) t.spellcheck = false; });
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
const md = text => DOMPurify.sanitize(marked.parse(text || ''), { ADD_ATTR: ['target'] }).replace(/<code>([\w.\/\\-]+\.[A-Za-z0-9]{1,8})<\/code>/g, (m, p) => `<code class="fpath" data-fpath="${p}" title="Abrir ${p}">${p}</code>`);

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
  // Al salir del chat que trabaja se deja de mirar (el trabajo sigue); al volver se reengancha
  if (S.streaming && (S.view !== 'chat' || S.chatId !== S.streamChatId)) detachStream();
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
  if (S.streamChatId === id) return;
  // ¿Sigue trabajando? Volver a verlo en directo desde donde va
  const runs = await api('GET', '/api/runs').catch(() => null);
  const r = runs?.running?.find(x => x.chatId === id);
  if (S.chatId !== id || S.view !== 'chat') return;
  if (r) streamChat(id, signal => fetch(`/api/chats/${id}/live`, { signal }), r.startedAt);
  else runQueue(id);
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
  const chs = S.chat.chapters || [];
  v.innerHTML = `${chs.length ? `<div class="chapters">${ico('book', 13)} ${chs.map(c => `<button class="chip" data-goch="${esc(c.messageId)}">${esc(c.title)}</button>`).join('')}</div>` : ''}<div class="thread" id="thread">${S.chat.messages.map(renderMessage).join('')}</div><button class="jump" id="jumpBtn" title="Ir al final">${ico('chevron', 16)}</button>`;
  wireScroll(v);
  if (S.streaming && S.streamChatId === S.chatId && S.liveEl) $('#thread').appendChild(S.liveEl);
  $('#composerWrap').appendChild(composer());
  drawLimitBanner();
  $('#composerWrap').insertAdjacentHTML('beforeend', '<div class="hint">El orquestador reparte la tarea entre agentes. Revisa los cambios antes de aplicarlos.</div>');
  v.scrollTop = v.scrollHeight;
}

function drawLimitBanner() {
  $$('.limit-note.lim').forEach(e => e.remove());
  const info = normLimits(S.limits?.info); if (!info) return;
  const w = info.unifiedWindows || {};
  const hot = Object.entries(w).filter(([, v]) => (v.utilization || 0) >= 0.8 && v.resetsAt).sort((a, b) => b[1].utilization - a[1].utilization)[0];
  const rejected = info.status === 'rejected';
  if (!rejected && !hot) return;
  const type = rejected ? info.rateLimitType : hot[0], win = rejected ? info : hot[1];
  const key = type + ':' + win.resetsAt;
  if (store.get('limitBannerHidden', '') === key) return;
  const what = type === 'five_hour' ? 'de la sesión' : 'semanal';
  const d = win.resetsAt ? new Date(win.resetsAt * 1000) : null;
  const hm = d ? d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }) : '';
  const when = d ? (d.toDateString() === new Date().toDateString() ? 'a las ' + hm : 'el ' + d.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric' }) + ' a las ' + hm) : '';
  const pct = Math.round((win.utilization || 0) * 100);
  const html = `<div class="limit-note lim ${rejected ? 'bad' : ''}">${ico('clock', 13)}<span>${rejected ? 'Límite ' + what + ' alcanzado' : 'Llevas el ' + pct + ' % del límite ' + what}${when ? ' · se restablece ' + when : ''}</span><button class="lnk" data-lb="usage">Ver uso</button><button class="icon-btn" data-lb="x" title="Ocultar">${ico('x', 12)}</button></div>`;
  const host = $('#homeComposer') || $('#composerWrap');
  if (!host) return;
  host.insertAdjacentHTML('afterbegin', html);
  const b = $('.limit-note.lim');
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
  const arts = (s.artifacts || []).map(id => { const a = S.artifacts.find(x => x.id === id); return a ? artChip(a.id, a.title, a.versions, a.appliedVersion) : ''; }).join('');
  const has = s.text || s.timeline?.length || s.tools?.length;
  return `<div class="step ${single ? 'single' : ''} ${open ? '' : 'closed'}" data-step="${esc(s.id)}">
    <div class="step-head">${agentBadge(s.agentId, s.model)}<span class="meta">${s.effort ? `<span class="chip effchip">${esc(EFFORT_NAMES[s.effort] || s.effort)}</span>` : ''}${usageMeta(s.usage)}${single ? '' : '<span class="caret">' + ico('chevron', 14) + '</span>'}</span></div>
    <div class="step-body">${!single && s.task ? `<div class="step-task">${esc(s.task.slice(0, 400))}</div>` : ''}<div class="tools"></div><div class="flow">${has ? stepFlow(s) : ''}</div>${arts ? `<div class="art-chips">${arts}</div>` : ''}</div></div>`;
}

const EFFORT_NAMES = { low: 'bajo', medium: 'medio', high: 'alto', xhigh: 'muy alto', max: 'máximo' };
function changesHtml(ch) {
  if (!ch || !ch.length) return '';
  const a = ch.reduce((x, c) => x + (c.added || 0), 0), r = ch.reduce((x, c) => x + (c.removed || 0), 0);
  return `<details class="changes" open><summary>${ico('file', 13)} ${ch.length} archivo${ch.length > 1 ? 's' : ''} ${ch.some(c => !c.applied) ? 'propuestos' : 'modificados'} <span class="add">+${a}</span> <span class="rem">−${r}</span></summary>${ch.map(c => `<div class="ch-row"><span class="mono">${esc(c.path)}</span>${c.applied ? '' : '<span class="chip" style="font-size:10.5px">propuesta</span>'}<span style="flex:1"></span><span class="add">+${c.added}</span><span class="rem">−${c.removed}</span></div>`).join('')}</details>`;
}

const IMG_RE = /\.(png|jpe?g|webp|gif)$/i;
const fileName = p => String(p).split(/[\\/]/).pop();
function attChip(f, removable, i) {
  const img = IMG_RE.test(f) ? `<img class="thumb" src="/api/file?path=${encodeURIComponent(f)}" data-zoom="${esc(f)}" alt="">` : ico('file', 13);
  return `<span class="chip att-chip" title="${esc(f)}">${img} ${esc(fileName(f))}${removable ? `<button data-rm-att="${i}">${ico('x', 12)}</button>` : ''}</span>`;
}
function msgActions(m) {
  if (!m.id) return '';
  const b = (act, icon, title) => `<button class="icon-btn" data-mact="${act}" data-mid="${esc(m.id)}" title="${title}">${ico(icon, 15)}</button>`;
  return m.role === 'user'
    ? `<div class="msg-actions">${b('copy', 'copy', 'Copiar')}${b('edit', 'pencil', 'Editar')}${b('rewind', 'refresh', 'Rebobinar hasta aquí')}${b('fork', 'layers', 'Bifurcar desde aquí')}</div>`
    : `<div class="msg-actions">${b('copy', 'copy', 'Copiar')}${b('fork', 'layers', 'Bifurcar desde aquí')}${b('chapter', 'book', 'Fijar como capítulo')}${b('speak', 'music', 'Leer en voz alta')}</div>`;
}
function chapterMark(m) {
  const ch = (S.chat?.chapters || []).find(c => c.messageId === m.id);
  return ch ? `<div class="chapter-mark" id="ch-${esc(m.id)}">${ico('book', 13)} ${esc(ch.title)}</div>` : '';
}

function renderMessage(m) {
  if (m.role === 'user') {
    const att = (m.attachments || []).map(f => attChip(f)).join('');
    const md0 = m.mode && m.mode !== 'auto' ? MODES.find(x => x.id === m.mode) : null;
    return `${chapterMark(m)}<div class="msg-user" data-msg="${esc(m.id || '')}"><div>${md0 ? `<div class="att" style="margin:0 0 4px"><span class="chip">${ico(md0.icon, 12)} ${md0.label}</span></div>` : ''}<div class="bubble">${esc(m.content)}</div>${att ? `<div class="att">${att}</div>` : ''}${msgActions(m)}</div></div>`;
  }
  const steps = m.steps || [];
  if (!steps.length) return `${chapterMark(m)}<div class="msg-ai" data-msg="${esc(m.id || '')}"><div class="step single"><div class="step-head">${agentBadge('orquestador')}<span class="meta">${usageMeta(m.planUsage)}</span></div><div class="md">${md(m.content)}</div></div>${msgActions(m)}</div>`;
  const plan = steps.length > 1 ? `<div class="plan-line">Plan: ${steps.map(s => `${agentIcon(agentById(s.agentId), 14)} ${esc(s.agentName)}`).join(' <span class="arrow">→</span> ')}${m.planUsage ? ` · <span title="Planificación">${usageMeta(m.planUsage)}</span>` : ''}</div>` : '';
  return `${chapterMark(m)}<div class="msg-ai" data-msg="${esc(m.id || '')}">${plan}${steps.map(s => renderStep(s, steps.length === 1, true)).join('')}${changesCard(steps)}${msgActions(m)}</div>`;
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
      <button class="chip ctx" id="ctxChip" title="Contexto de esta conversación"></button>
      <button class="send ${S.streaming ? 'stop' : ''}" id="sendBtn" title="${S.streaming ? 'Detener (si escribes algo, queda en cola)' : 'Enviar'}">${S.streaming ? ico('stop', 14) : ico('arrowUp', 17, 2.2)}</button>
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
  ta.value = loadDraft().text || ''; setTimeout(() => autosize(ta), 0);
  ta.addEventListener('input', () => { autosize(ta); updateSendBtn(); saveDraft(); });
  pick.addEventListener('redraw', drawPick);
  ta.addEventListener('paste', e => { const files = [...(e.clipboardData?.files || [])]; if (files.length) { e.preventDefault(); files.forEach(uploadAndAttach); } });
  wrap.addEventListener('dragover', e => { e.preventDefault(); wrap.classList.add('drop'); });
  wrap.addEventListener('dragleave', () => wrap.classList.remove('drop'));
  wrap.addEventListener('drop', e => { e.preventDefault(); wrap.classList.remove('drop'); [...(e.dataTransfer?.files || [])].forEach(uploadAndAttach); });
  setupPop(ta, wrap);
  setupSpell(ta, $('#taMirror', wrap));
  ta.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); send(); } });
  setTimeout(updateSendBtn, 0);
  sendBtn.onclick = () => S.streaming && !ta.value.trim() ? stopStream() : send();
  wrap.insertAdjacentHTML('afterbegin', '<div id="queueBox"></div>');
  setTimeout(() => { renderQueue(); updateContext(); }, 0);
  $('#attachBtn', wrap).onclick = () => menu($('#attachBtn', wrap), [
    { label: ico('folder', 16) + '<div><div>Archivo del proyecto</div><div class="sub">Código, textos, modelos…</div></div>', run: attachDialog },
    { label: ico('pencil', 16) + '<div><div>Dibujar un boceto</div><div class="sub">Haz un dibujo simple de tu idea</div></div>', run: () => openSketch() },
    { label: ico('file', 16) + '<div><div>Archivo del PC</div><div class="sub">PDF, Word, Excel, PowerPoint, vídeo, audio, imagen…</div></div>', run: async () => {
      const r = await api('POST', '/api/pick-file').catch(e => ({ error: e.message }));
      if (r.path) { S.attachments = [...new Set([...S.attachments, r.path])]; renderAttachments(); }
    } },
  ]);
  renderAttachments(wrap);
  return wrap;
}
// ---------- Borradores, subidas, cola, contexto, scroll ----------
const draftKey = () => 'draft:' + (S.chatId || 'new:' + (S.projectId || ''));
function loadDraft() { try { const d = JSON.parse(store.get(draftKey(), '{}')); if (d.attachments && !S.attachments.length) S.attachments = d.attachments; return d; } catch { return {}; } }
let draftTimer;
function saveDraft() { clearTimeout(draftTimer); draftTimer = setTimeout(() => { const ta = $('#prompt'); store.set(draftKey(), JSON.stringify({ text: ta?.value || '', attachments: S.attachments })); }, 250); }
function clearDraft() { clearTimeout(draftTimer); try { localStorage.removeItem(draftKey()); } catch {} }
async function uploadAndAttach(file) {
  if (S.attachments.length >= 20) return toast('Máximo 20 archivos por mensaje');
  if (file.size > 30 * 1024 * 1024) return toast(`«${file.name}» supera 30 MB`);
  const name = file.name || ('imagen-' + Date.now() + '.' + ((file.type.split('/')[1] || 'png').replace('jpeg', 'jpg')));
  try {
    const r = await fetch('/api/upload', { method: 'POST', headers: { 'X-File-Name': encodeURIComponent(name) }, body: file });
    if (!r.ok) throw new Error(await r.text());
    const j = await r.json(); S.attachments = [...S.attachments, j.path]; renderAttachments();
  } catch (e) { toast('No se pudo adjuntar: ' + e.message.slice(0, 120)); }
}
function renderQueue() {
  const box = $('#queueBox'); if (!box) return;
  const q = S.queue.filter(x => x.chatId === S.chatId);
  box.innerHTML = q.map((x, i) => `<div class="queued">${ico('clock', 13)}<span class="qt">${esc(x.text.slice(0, 140))}</span><button class="btn sm" data-qnow="${i}" title="Detiene lo que está haciendo y envía esto ya">Enviar ahora</button><button class="icon-btn" data-qdel="${i}" title="Quitar">${ico('x', 13)}</button></div>`).join('');
  $$('[data-qdel]', box).forEach(b => b.onclick = () => { const it = q[+b.dataset.qdel]; S.queue.splice(S.queue.indexOf(it), 1); renderQueue(); });
  $$('[data-qnow]', box).forEach(b => b.onclick = () => { const it = q[+b.dataset.qnow]; S.queue.splice(S.queue.indexOf(it), 1); S.queue.unshift(it); renderQueue(); stopStream(); toast('Deteniendo para enviar tu mensaje…'); });
}
async function updateContext() {
  const chip = $('#ctxChip'); if (!chip) return;
  if (!S.chat?.id) { chip.classList.add('hidden'); return; }
  try {
    const c = await api('GET', `/api/chats/${S.chat.id}/context`);
    const p = Math.max(0.1, c.tokens / c.window * 100);
    chip.classList.remove('hidden');
    chip.innerHTML = `${ico('layers', 12)} ${p < 1 ? p.toFixed(1) : Math.round(p)} %`;
    chip.title = `Contexto enviado: ~${fmtTok(c.tokens)} de ${fmtTok(c.window)} tokens · conversación completa: ${fmtTok(c.fullTokens)}${c.hasSummary ? ' · con resumen compactado' : ''}`;
    chip.onclick = () => menu(chip, [
      { label: `<div><div>~${fmtTok(c.tokens)} tokens de contexto</div><div class="sub">${c.messages} mensajes${c.hasSummary ? ` · ${c.summarized} resumidos` : ''}</div></div>`, run: () => {} },
      '-',
      { label: ico('layers', 15) + ' Compactar conversación ahora', run: async () => { toast('Compactando…'); await api('POST', `/api/chats/${S.chat.id}/compact`); updateContext(); toast('Conversación compactada'); } },
    ]);
    $$('.paused-banner').forEach(e => e.remove());
    if (c.pending) {
      $('#composerWrap')?.insertAdjacentHTML('afterbegin', `<div class="limit-banner paused-banner">${ico('clock', 15)}<b>En pausa por el límite de Claude</b><span class="muted">Continuará solo a las ${new Date(c.pending.resumeAt * 1000).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}</span><span style="flex:1"></span><button class="btn sm" id="cancelResume">Cancelar</button></div>`);
      $('#cancelResume').onclick = async () => { await api('POST', `/api/chats/${S.chat.id}/resume`); updateContext(); };
    }
  } catch { chip.classList.add('hidden'); }
}
function wireScroll(v) {
  // Solo se pega al final si tú estás al final: en cuanto subes (rueda, barra o teclado) te deja leer
  const jump = $('#jumpBtn');
  let lastTop = v.scrollTop;
  const at = () => v.scrollHeight - v.scrollTop - v.clientHeight < 40;
  const release = () => { S.autoStick = false; jump?.classList.add('show'); };
  v.onscroll = () => {
    const t = v.scrollTop;
    if (t < lastTop - 1) release(); else if (at()) S.autoStick = true;
    lastTop = t; jump?.classList.toggle('show', !S.autoStick);
  };
  v.onwheel = e => { if (e.deltaY < 0) release(); };
  v.onmousedown = e => { if (e.target === v && e.offsetX > v.clientWidth - 2) release(); };
  v.onkeydown = e => { if (['PageUp', 'ArrowUp', 'Home'].includes(e.key)) release(); };
  if (jump) jump.onclick = () => { S.autoStick = true; v.scrollTop = v.scrollHeight; lastTop = v.scrollTop; jump.classList.remove('show'); };
}

function curMode() { return S.mode || S.st?.config?.defaults?.mode || 'auto'; }
// ---------- Corrector (estilo Google Docs) ----------
function setupSpell(ta, mirror) {
  // Como Google Docs: subrayado rojo (ortografía) o azul (gramática/estilo) que se mantiene mientras
  // escribes; al pasar el ratón por encima sale una tarjeta con la corrección: Tab la acepta.
  let matches = [], timer, seq = 0, prev = ta.value, card = null, cardIdx = -1, hideT;
  const ignKey = () => 'spellIgnore:' + (S.chatId || 'new:' + (S.projectId || ''));
  const ignored = () => { try { return JSON.parse(store.get(ignKey(), '[]')); } catch { return []; } };
  const on = () => S.st?.config?.profile?.spellcheck !== false;
  const draw = () => {
    const t = ta.value; let html = '', last = 0;
    matches.forEach((m, i) => {
      if (m.offset < last || m.offset + m.length > t.length) return;
      html += esc(t.slice(last, m.offset)) + `<mark class="${m.type === 'misspelling' ? 'gerr' : 'gstyle'}" data-i="${i}">${esc(t.slice(m.offset, m.offset + m.length))}</mark>`;
      last = m.offset + m.length;
    });
    mirror.innerHTML = html + esc(t.slice(last)) + '\n';
    mirror.scrollTop = ta.scrollTop;
  };
  const check = async () => {
    const my = ++seq, text = ta.value;
    if (!on() || text.trim().length < 3) { matches = []; draw(); return; }
    try {
      const r = await api('POST', '/api/grammar', { text, language: S.st.config.profile?.spellLang || 'auto' });
      if (my !== seq || ta.value !== text) return;
      const ig = ignored();
      matches = r.matches.filter(m => !ig.includes(text.slice(m.offset, m.offset + m.length).toLowerCase()));
      draw();
    } catch { /* sin conexión o límite: se conservan los subrayados que ya había */ }
  };
  // Al escribir no se borra nada: los subrayados se desplazan; solo cae el de la palabra que tocas
  const shift = () => {
    const a = prev, b = ta.value; prev = b;
    let s = 0; while (s < a.length && s < b.length && a[s] === b[s]) s++;
    let e = 0; while (e < a.length - s && e < b.length - s && a[a.length - 1 - e] === b[b.length - 1 - e]) e++;
    const endOld = a.length - e, delta = b.length - a.length;
    matches = matches.filter(m => m.offset + m.length <= s || m.offset >= endOld).map(m => m.offset >= endOld ? { ...m, offset: m.offset + delta } : m);
  };
  const hideCard = () => { cardIdx = -1; card?.classList.add('hidden'); };
  const hideSoon = () => { clearTimeout(hideT); hideT = setTimeout(hideCard, 280); };
  const apply = (i, v) => {
    const m = matches[i]; if (!m) return;
    matches.splice(i, 1);
    ta.value = ta.value.slice(0, m.offset) + v + ta.value.slice(m.offset + m.length);
    ta.focus(); ta.selectionStart = ta.selectionEnd = m.offset + v.length;
    hideCard(); ta.dispatchEvent(new Event('input'));
  };
  const ignore = word => {
    const ig = ignored(); if (!ig.includes(word)) ig.push(word); store.set(ignKey(), JSON.stringify(ig));
    matches = matches.filter(m => ta.value.slice(m.offset, m.offset + m.length).toLowerCase() !== word);
    draw(); hideCard(); ta.focus();
  };
  const showCard = (i, rect) => {
    const m = matches[i]; if (!m || !rect) return;
    clearTimeout(hideT); cardIdx = i;
    if (!card) {
      card = document.createElement('div'); card.className = 'spell-card hidden'; document.body.appendChild(card);
      card.onmouseenter = () => clearTimeout(hideT); card.onmouseleave = hideSoon;
      card.onmousedown = e => e.preventDefault();
    }
    const word = ta.value.slice(m.offset, m.offset + m.length);
    const reps = (m.replacements || []).slice(0, 3);
    card.innerHTML = `<div class="sc-top">${reps.length ? reps.map((r, k) => `<button class="sc-rep ${k ? '' : 'first'}" data-r="${esc(r)}">${esc(r)}</button>`).join('') : '<span class="muted" style="font-size:13px">Sin sugerencias</span>'}<span style="flex:1"></span><button class="sc-ign" title="No volver a marcar «${esc(word)}» en este chat">Ignorar</button></div><div class="sc-msg">${esc(m.message || '')}</div>${reps.length ? '<div class="sc-hint"><kbd>Tab</kbd> acepta la primera</div>' : ''}`;
    $$('.sc-rep', card).forEach(b => b.onclick = () => apply(i, b.dataset.r));
    $('.sc-ign', card).onclick = () => ignore(word.toLowerCase());
    card.classList.remove('hidden');
    const w = card.offsetWidth, h = card.offsetHeight;
    card.style.left = Math.max(8, Math.min(rect.left, innerWidth - w - 8)) + 'px';
    card.style.top = (rect.bottom + 6 + h > innerHeight ? rect.top - h - 6 : rect.bottom + 6) + 'px';
  };
  const markRect = i => mirror.querySelector(`mark[data-i="${i}"]`)?.getClientRects()[0];
  const hitAt = (x, y) => {
    for (const mk of mirror.querySelectorAll('mark')) for (const r of mk.getClientRects()) if (x >= r.left && x <= r.right && y >= r.top - 2 && y <= r.bottom + 3) return { i: +mk.dataset.i, rect: r };
    return null;
  };
  const atCaret = () => { const p = ta.selectionStart; if (ta.selectionEnd !== p) return -1; return matches.findIndex(m => p >= m.offset && p <= m.offset + m.length); };
  ta.addEventListener('input', () => { shift(); draw(); if (cardIdx >= 0) hideCard(); clearTimeout(timer); timer = setTimeout(check, 650); });
  ta.addEventListener('scroll', () => { mirror.scrollTop = ta.scrollTop; hideCard(); });
  ta.addEventListener('mousemove', e => {
    const h = hitAt(e.clientX, e.clientY);
    if (h) { if (h.i !== cardIdx || card?.classList.contains('hidden')) showCard(h.i, h.rect); else clearTimeout(hideT); }
    else if (cardIdx >= 0) hideSoon();
  });
  ta.addEventListener('mouseleave', () => { if (cardIdx >= 0) hideSoon(); });
  ta.addEventListener('click', () => { const i = atCaret(); if (i >= 0) showCard(i, markRect(i)); });
  ta.addEventListener('blur', hideSoon);
  ta.addEventListener('keydown', e => {
    const shown = cardIdx >= 0 && card && !card.classList.contains('hidden');
    if (e.key === 'Tab' && !e.shiftKey) {
      const i = shown ? cardIdx : atCaret();
      if (i >= 0 && matches[i]?.replacements?.length) { e.preventDefault(); e.stopImmediatePropagation(); apply(i, matches[i].replacements[0]); }
    } else if (e.key === 'Escape' && shown) { e.preventDefault(); hideCard(); }
    else if (e.ctrlKey && e.key === ' ') { e.preventDefault(); const i = atCaret(); if (i >= 0) showCard(i, markRect(i)); }
  });
  if (ta.value.trim()) check();
}

function autosize(ta) { ta.style.height = 'auto'; ta.style.height = Math.min(ta.scrollHeight, 280) + 'px'; }
function renderAttachments(root = document) {
  const el = $('#attList', root); if (!el) return;
  el.innerHTML = S.attachments.map((f, i) => attChip(f, true, i)).join('');
  saveDraft();
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

function stopStream() { if (S.chat?.id) api('POST', `/api/chats/${S.chat.id}/stop`).catch(() => {}); }

// ---------- Envío y trabajo en vivo (se puede salir y volver: se reengancha) ----------
const SPIN_FR = ['·', '✢', '✳', '✶', '✻', '✽', '✻', '✶', '✳', '✢'];
let streamSeq = 0;
function detachStream() { streamSeq++; S.abort?.abort(); S.abort = null; S.streaming = false; S.streamChatId = null; S.liveEl = null; }

function updateSendBtn() {
  const b = $('#sendBtn'), ta = $('#prompt'); if (!b || !ta) return;
  const has = !!ta.value.trim(); const stop = S.streaming && !has;
  b.classList.toggle('stop', stop);
  b.innerHTML = stop ? ico('stop', 14) : ico('arrowUp', 17, 2.2);
  b.title = stop ? 'Detener' : S.streaming ? 'Poner en cola: se envía al terminar (o pulsa «Enviar ahora»)' : 'Enviar';
  b.disabled = !S.streaming && !has;
}

function runQueue(chatId) {
  const qi = S.queue.findIndex(q => q.chatId === chatId);
  if (qi < 0 || S.chatId !== chatId || S.view !== 'chat' || S.streaming) return;
  const q = S.queue.splice(qi, 1)[0]; renderQueue();
  setTimeout(() => send(q.text, q.attachments), 150);
}

async function send(override, overrideAtt, agentOverride) {
  const ta = $('#prompt'); const text = (override ?? ta?.value ?? '').trim();
  if (!text) return;
  const cmd = override == null && SLASH.find(c => text === '/' + c.c);
  if (cmd) { ta.value = ''; autosize(ta); clearDraft(); updateSendBtn(); cmd.run(); return; }
  if (S.streaming) {
    // Como en Claude: lo que escribes mientras trabaja queda en cola y se envía al terminar
    S.queue.push({ text, attachments: [...S.attachments], chatId: S.chatId });
    if (ta) { ta.value = ''; autosize(ta); }
    S.attachments = []; renderAttachments(); clearDraft(); renderQueue(); updateSendBtn();
    toast('En cola: se enviará cuando termine');
    return;
  }
  if (!S.chat) {
    S.chat = await api('POST', '/api/chats', { projectId: S.projectId });
    S.chatId = S.chat.id;
  }
  const attachments = overrideAtt ?? [...S.attachments];
  S.chat.messages.push({ role: 'user', content: text, attachments, mode: curMode() });
  S.attachments = [];
  clearDraft();
  const id = S.chat.id;
  const body = JSON.stringify({ text, agentId: agentOverride || S.agent, attachments, mode: curMode(), effort: S.effort === 'agent' ? '' : S.effort });
  streamChat(id, signal => fetch(`/api/chats/${id}/send`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, signal }));
}

async function streamChat(chatId, open, startedAt) {
  detachStream();
  const my = streamSeq;
  S.streaming = true; S.streamChatId = chatId; S.autoStick = true; S.planStatus = {};
  render();
  const thread = $('#thread'); if (!thread) return;
  const live = document.createElement('div'); live.className = 'msg-ai live';
  live.innerHTML = `<div class="status-line" id="liveStatus"><span class="spin">✻</span><span class="verb">Pensando…</span><span class="st-meta"></span></div>`;
  thread.appendChild(live);
  S.liveEl = live;
  const view = $('#view');
  const stick = () => { if (S.autoStick && S.liveEl === live && live.isConnected) view.scrollTop = view.scrollHeight; };
  stick();

  const steps = {};
  let single = false, outChars = 0, lastAt = Date.now(), lastKind = '', verb = 'Pensando', fr = 0;
  const t0 = startedAt ? new Date(startedAt).getTime() : Date.now();
  const who = s => (single || !s ? '' : s.name + ': ');
  const setVerb = (v, kind) => { verb = v; lastKind = kind || ''; lastAt = Date.now(); };
  const seg = (s, kind) => {
    let last = s.segs[s.segs.length - 1];
    if (!last || last.kind !== kind) {
      const el = document.createElement('div');
      if (kind === 'text') el.className = 'md seg';
      else { el.className = 'act on'; el.innerHTML = '<button class="act-sum"></button><div class="act-list"></div>'; }
      $('.flow', s.el).appendChild(el);
      s.segs.forEach(g => g.el.classList.remove('on'));
      last = { kind, el, text: '', items: [], dirty: true }; s.segs.push(last);
    }
    return last;
  };
  const drawAct = (s, g) => { $('.act-sum', g.el).innerHTML = `<span class="act-spin"></span>${actSummary(g.items, s.changes)} <span class="act-time"></span><span class="chev">${ico('chevron', 13)}</span>`; $('.act-list', g.el).innerHTML = g.items.map(actItem).join(''); };
  const fmtEl = ms => { const x = Math.max(0, Math.floor(ms / 1000)); return x < 60 ? x + ' s' : Math.floor(x / 60) + ' min ' + String(x % 60).padStart(2, '0') + ' s'; };
  const flush = () => {
    for (const s of Object.values(steps)) for (const g of s.segs) if (g.dirty && g.kind === 'text') { g.el.innerHTML = md(g.text); g.dirty = false; }
    for (const s of Object.values(steps)) for (const g of s.segs) if (g.kind === 'tools' && g.el.classList.contains('on')) {
      const sp = $('.act-spin', g.el); if (sp) sp.textContent = SPIN_FR[fr % SPIN_FR.length];
      const tm = $('.act-time', g.el); const ms = Date.now() - (g.t0 || Date.now()); if (tm) tm.textContent = ms > 1500 ? fmtEl(ms) : '';
    }
    const stEl = $('#liveStatus', live);
    if (stEl) {
      const quiet = Date.now() - lastAt;
      const v = quiet > 6000 && (lastKind === 'text' || lastKind === 'tool') ? 'Pensando' : verb;
      $('.spin', stEl).textContent = SPIN_FR[fr++ % SPIN_FR.length];
      $('.verb', stEl).textContent = v + '…';
      const running = Object.values(steps).filter(s => !s.done).length;
      $('.st-meta', stEl).textContent = `(${running > 1 ? running + ' agentes a la vez · ' : ''}${fmtEl(Date.now() - t0)}${outChars ? ' · ↓ ' + fmtTok(Math.round(outChars / 4)) + ' tokens' : ''})`;
    }
    stick();
  };
  const timer = setInterval(flush, 110);

  const ac = new AbortController(); S.abort = ac;
  try {
    const res = await open(ac.signal);
    if (!res.ok) throw new Error(await res.text());
    const reader = res.body.getReader(); const dec = new TextDecoder(); let buf = '';
    for (;;) {
      if (my !== streamSeq) { ac.abort(); break; }
      const { value, done } = await reader.read(); if (done) break;
      buf += dec.decode(value, { stream: true });
      let i;
      while ((i = buf.indexOf('\n\n')) >= 0) {
        const raw = buf.slice(0, i); buf = buf.slice(i + 2);
        let ev = 'message', data = '';
        for (const line of raw.split('\n')) { if (line.startsWith('event:')) ev = line.slice(6).trim(); else if (line.startsWith('data:')) data += line.slice(5).trim(); }
        if (!data || my !== streamSeq) continue;
        try { handle(ev, JSON.parse(data)); } catch (e) { console.error(e); }
      }
    }
  } catch (err) {
    if (err.name !== 'AbortError' && my === streamSeq) live.insertAdjacentHTML('beforeend', `<div class="err">${ico('alert', 14)} ${esc(err.message)}</div>`);
  } finally {
    clearInterval(timer);
    if (my === streamSeq) {
      flush();
      S.streaming = false; S.abort = null; S.streamChatId = null; S.liveEl = null;
      try { S.chat = S.chatId === chatId ? await api('GET', '/api/chats/' + chatId) : S.chat; await refreshArtifacts(); await loadState(); } catch {}
      if (my === streamSeq) {
        if (S.view === 'chat' && S.chatId === chatId) render();
        if (document.body.classList.contains('panel-open')) renderPanel();
        runQueue(chatId);
      }
    }
  }

  function setPs(id, st) { const el = $(`[data-ps="${CSS.escape(id)}"]`, live); if (!el) return; el.className = 'todo ' + st; el.firstElementChild.outerHTML = st === 'completed' ? ico('check', 14) : '<span class="todo-c"></span>'; }
  function handle(ev, d) {
    if (ev === 'idle') return;
    if (ev === 'status') setVerb(String(d.text || '').replace(/…$/, ''), 'status');
    else if (ev === 'file_change') {
      const s = steps[d.stepId]; if (!s) return;
      const c = s.changes.find(x => x.path === d.path);
      if (c) { c.added += d.added; c.removed += d.removed; c.applied = c.applied || d.applied; } else s.changes.push({ path: d.path, added: d.added, removed: d.removed, applied: d.applied });
      s.segs.filter(g => g.kind === 'tools').forEach(g => drawAct(s, g));
      studioMaybeReload(d.path);
    } else if (ev === 'stopped') setVerb('Deteniendo', 'status');
    else if (ev === 'paused') { live.insertAdjacentHTML('beforeend', `<div class="limit-note">${ico('clock', 13)}<span>Límite de Claude agotado · seguirá solo a las ${new Date(d.resumeAt * 1000).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}</span></div>`); }
    else if (ev === 'plan') {
      S.lastPlan = { steps: d.steps, ctx: {} };
      if (d.reply) { $('#liveStatus', live)?.remove(); live.insertAdjacentHTML('beforeend', `<div class="step single"><div class="md">${md(d.reply)}</div></div>`); return; }
      single = d.steps.length === 1;
      if (!single) live.insertAdjacentHTML('afterbegin', `<div class="todo-box plan-box"><div class="todo-head">Plan</div>${d.steps.map(s => `<div class="todo pending" data-ps="${esc(s.id)}"><span class="todo-c"></span><span>${agentIcon(agentById(s.agent), 13)} <b>${esc(s.agentName || s.agent)}</b> <span class="muted">· ${esc((s.task || '').slice(0, 140))}</span></span></div>`).join('')}</div>`);
      setVerb(single ? 'Empezando' : `Repartiendo ${d.steps.length} tareas`, 'status');
    } else if (ev === 'step_start') {
      S.lastPlan && (S.lastPlan.ctx[d.stepId] = d); S.planStatus[d.stepId] = 'run'; setPs(d.stepId, 'in_progress');
      const html = renderStep({ id: d.stepId, agentId: d.agent, model: d.model, task: d.task, text: '' }, single, true);
      $('#liveStatus', live)?.insertAdjacentHTML('beforebegin', html);
      const el = $(`[data-step="${CSS.escape(d.stepId)}"]`, live);
      $('.meta', el).insertAdjacentHTML('afterbegin', `<span class="dot run"></span>${d.effort ? `<span class="chip effchip" title="Esfuerzo de este paso">${esc(EFFORT_NAMES[d.effort] || d.effort)}</span>` : ''}<span title="Contexto estimado enviado">~${fmtTok(d.context?.estTokens || 0)} ctx</span>`);
      steps[d.stepId] = { el, segs: [], changes: [], name: agentById(d.agent)?.name || d.agent, done: false };
      setVerb(who(steps[d.stepId]) + 'Pensando', 'status');
      if (document.body.classList.contains('panel-open') && (S.panelTab === 'board' || S.panelTab === 'plan')) renderPanel();
    } else if (ev === 'delta') {
      const s = steps[d.stepId]; if (!s) return;
      const g = seg(s, 'text'); g.text += d.text; g.dirty = true; outChars += d.text.length;
      setVerb(who(s) + 'Escribiendo', 'text');
    } else if (ev === 'tool') {
      const s = steps[d.stepId]; if (!s) return;
      const it = toolInfo(d.name, d.input);
      if (it.k === 'todo') {
        const todos = parseMaybe(d.input)?.todos;
        if (Array.isArray(todos)) {
          if (!s.todoEl) { s.todoEl = document.createElement('div'); $('.flow', s.el).appendChild(s.todoEl); s.segs.forEach(g => g.el.classList.remove('on')); s.segs.push({ kind: 'todo', el: s.todoEl }); }
          s.todoEl.innerHTML = todoHtml(todos);
          const cur = todos.find(t => t.status === 'in_progress');
          setVerb(who(s) + (cur ? (cur.activeForm || cur.content) : 'Organizando tareas'), 'tool');
          return;
        }
      }
      const g = seg(s, 'tools'); g.items.push(it); g.t0 = Date.now(); drawAct(s, g);
      const fileVerb = ['read', 'edit', 'write'].includes(it.k) && it.arg ? ' ' + fileName(it.arg) : '';
      const extra = it.k === 'other' ? ' ' + it.label : it.k === 'cmd' && it.arg ? ': ' + it.arg.slice(0, 60) : fileVerb;
      setVerb(who(s) + ACT_VERB[it.k] + extra, 'tool');
    } else if (ev === 'artifact') {
      const s = steps[d.stepId]; if (!s) return;
      let box = $('.art-chips', s.el); if (!box) { $('.step-body', s.el).insertAdjacentHTML('beforeend', '<div class="art-chips"></div>'); box = $('.art-chips', s.el); }
      $(`[data-art="${CSS.escape(d.id)}"]`, box)?.remove();
      box.insertAdjacentHTML('beforeend', artChip(d.id, d.title, d.version, d.applied));
    } else if (ev === 'step_done') {
      const s = steps[d.stepId]; if (!s) return;
      s.done = true; s.segs.forEach(g => g.el.classList.remove('on')); setPs(d.stepId, 'completed');
      const meta = $('.meta', s.el); $('.dot', meta)?.remove(); S.planStatus[d.stepId] = 'done';
      const mc = $('.model', s.el); if (mc && d.model) mc.textContent = d.model;
      if (d.fallbacks?.length) $('.tools', s.el).insertAdjacentHTML('afterbegin', `<div class="tool-row" title="${esc(d.fallbacks.join('\n'))}">${ico('refresh', 13)} <b>respaldo</b> ${d.fallbacks.length} modelo(s) fallaron; se usó ${esc(d.model)}</div>`);
      meta.insertAdjacentHTML('afterbegin', usageMeta(d.usage));
      if (!single) setVerb('Siguiente paso', 'status');
    } else if (ev === 'step_error') { const s = steps[d.stepId]; if (s) { const g = seg(s, 'text'); g.text += `\n\n> Error: ${d.error}`; g.dirty = true; } }
    else if (ev === 'approval') {
      const s = steps[d.stepId]; const host = s ? $('.step-body', s.el) : live;
      const what = { edit: 'quiere escribir un archivo', exec: 'quiere ejecutar un comando', mcp: 'quiere hacer un cambio' }[d.kind] || 'pide permiso';
      host.insertAdjacentHTML('beforeend', `<div class="approval" data-ap="${esc(d.id)}"><div class="row">${ico(d.kind === 'exec' ? 'code' : d.kind === 'mcp' ? 'plug' : 'pencil', 16)}<b>${esc(d.tool)}</b><span class="muted">${what}</span></div><pre>${esc(d.detail)}</pre><div class="row"><button class="btn primary sm" data-allow="1">Permitir</button><button class="btn sm" data-allow="0">Denegar</button></div></div>`);
      setVerb('Esperando tu permiso', 'approval');
      stick();
    } else if (ev === 'approval_done') {
      const el = document.querySelector(`[data-ap="${CSS.escape(d.id)}"]`);
      if (el) el.outerHTML = `<div class="tool-row">${ico(d.allowed ? 'tick' : 'x', 13)} <b>${d.allowed ? 'Permitido' : 'Denegado'}</b></div>`;
      setVerb('Continuando', 'status');
    }
    else if (ev === 'error') { $('#liveStatus', live)?.remove(); live.insertAdjacentHTML('beforeend', `<div class="err">${ico('alert', 14)} ${esc(d.error)}</div>`); }
    else if (ev === 'done') $('#liveStatus', live)?.remove();
  }
}

// ---------- Actividad estilo Claude Code ----------
function parseMaybe(x) {
  if (x && typeof x === 'object') return x;
  try { return JSON.parse(x); } catch {}
  const o = {}; const re = /"(file_path|path|ruta|command|pattern|query|url|description)"\s*:\s*"((?:[^"\\]|\\.)*)/g; let m;
  while ((m = re.exec(String(x || '')))) o[m[1]] = m[2].replace(/\\\\/g, '\\');
  return o;
}
function toolInfo(name, inp) {
  const n = String(name || '').toLowerCase(); inp = parseMaybe(inp) || {};
  const path = inp.file_path || inp.path || inp.ruta || inp.notebook_path || (Array.isArray(inp) ? inp.map(c => c.path).filter(Boolean).join(', ') : '') || '';
  if (/^(read|read_file|leer_google_doc|obsidian_leer|notebookread)$/.test(n)) return { k: 'read', label: 'Leer', arg: path || inp.url || '' };
  if (/^(grep|glob|ls|search_files|search_project|list_files|obsidian_buscar|obsidian_listar)$/.test(n)) return { k: 'search', label: 'Buscar', arg: inp.pattern || inp.query || inp.consulta || path };
  if (/^(bash|shell|run_command|powershell|command_execution)$/.test(n)) return { k: 'cmd', label: 'Ejecutar', arg: inp.command || inp.comando || '' };
  if (/^(write|write_file|obsidian_escribir|create_file)$/.test(n)) return { k: 'write', label: 'Crear', arg: path };
  if (/^(edit|multiedit|file_change|str_replace|notebookedit|edit_file)$/.test(n)) return { k: 'edit', label: 'Editar', arg: path };
  if (/(web_search|websearch|webfetch|^fuente$)/.test(n)) return { k: 'web', label: 'Web', arg: inp.query || inp.url || '' };
  if (/todo/.test(n)) return { k: 'todo', label: 'Tareas', arg: '' };
  if (/elevenlabs/.test(n)) return { k: 'audio', label: 'Audio', arg: inp.texto || inp.text || inp.prompt || inp.descripcion || '' };
  if (/gemini/.test(n)) return { k: 'media', label: 'Gemini', arg: inp.ruta || '' };
  if (/^(task|agent)$/.test(n)) return { k: 'agent', label: 'Subagente', arg: inp.description || '' };
  const label = String(name || '').replace(/^mcp__/, '').replace(/__/g, ' › ');
  return { k: 'other', label, arg: JSON.stringify(inp).slice(0, 140) };
}
const ACT_VERB = { read: 'Leyendo', search: 'Buscando en el código', cmd: 'Ejecutando', edit: 'Editando', write: 'Creando', web: 'Buscando en la web', audio: 'Generando audio', media: 'Analizando con Gemini', todo: 'Organizando tareas', agent: 'Lanzando un subagente', other: 'Usando' };
function relPath(p) {
  let s = String(p || '').replace(/\\/g, '/');
  const pr = project()?.path;
  if (pr) { const b = pr.replace(/\\/g, '/').replace(/\/$/, '') + '/'; if (s.toLowerCase().startsWith(b.toLowerCase())) s = s.slice(b.length); }
  return s;
}
const sameFile = (a, b) => { a = relPath(a).toLowerCase(); b = relPath(b).toLowerCase(); return a === b || a.endsWith('/' + b) || b.endsWith('/' + a); };
function actSummary(items, changes = []) {
  const g = {}; items.forEach(i => (g[i.k] = g[i.k] || []).push(i));
  const n = k => g[k]?.length || 0, pl = (c, s, p) => c + ' ' + (c === 1 ? s : p);
  const parts = [];
  const files = (k, verb) => {
    if (!g[k]) return;
    const fs = [...new Set(g[k].map(i => i.arg).filter(Boolean))];
    if (!fs.length) { parts.push(verb + ' ' + pl(n(k), 'archivo', 'archivos')); return; }
    const ch = changes.filter(c => fs.some(f => sameFile(c.path, f)));
    const a = ch.reduce((x, c) => x + (c.added || 0), 0), r = ch.reduce((x, c) => x + (c.removed || 0), 0);
    parts.push(`${verb} ${fs.length === 1 ? `<span class="fname">${esc(fileName(fs[0]))}</span>` : fs.length + ' archivos'}${a ? ` <span class="add">+${a}</span>` : ''}${r ? ` <span class="rem">−${r}</span>` : ''}`);
  };
  if (n('read')) parts.push('leyó ' + pl(n('read'), 'archivo', 'archivos'));
  if (n('search')) parts.push('buscó ' + pl(n('search'), 'vez', 'veces'));
  if (n('cmd')) parts.push('ejecutó ' + pl(n('cmd'), 'comando', 'comandos'));
  files('write', 'creó'); files('edit', 'editó');
  if (n('web')) parts.push('consultó la web ' + pl(n('web'), 'vez', 'veces'));
  if (n('media')) parts.push('analizó ' + pl(n('media'), 'archivo', 'archivos') + ' con Gemini');
  if (n('audio')) parts.push('generó ' + pl(n('audio'), 'audio', 'audios'));
  if (n('todo')) parts.push('actualizó su lista de tareas');
  if (n('agent')) parts.push('lanzó ' + pl(n('agent'), 'subagente', 'subagentes'));
  if (n('other')) parts.push('usó ' + [...new Set(g.other.map(i => i.label))].slice(0, 3).map(esc).join(', '));
  const s = parts.join(', ');
  return s.charAt(0).toUpperCase() + s.slice(1);
}
function actItem(i) {
  const file = ['edit', 'write', 'read'].includes(i.k) && i.arg;
  return `<div class="act-item ${file ? 'click' : ''}" ${file ? `data-file="${esc(i.arg)}" data-fk="${i.k}"` : ''}><span class="k">${esc(i.k === 'other' ? 'Herramienta' : i.label)}</span><span class="a" title="${esc(i.arg)}">${esc(file ? relPath(i.arg) : i.k === 'other' ? i.label : i.arg)}</span></div>`;
}
function actHtml(items, changes) {
  return `<div class="act"><button class="act-sum">${actSummary(items, changes)} <span class="chev">${ico('chevron', 13)}</span></button><div class="act-list">${items.map(actItem).join('')}</div></div>`;
}
function stepFlow(s) {
  let tl = s.timeline?.length && !s.error ? s.timeline : null;
  if (!tl) tl = [...(s.tools || []).map(t => ({ t: 'tool', name: t.name, input: t.input })), { t: 'text', text: s.text }];
  const out = []; let grp = null;
  const lastTodo = tl.map((e, i) => e.t === 'tool' && toolInfo(e.name, e.input).k === 'todo' ? i : -1).filter(i => i >= 0).pop();
  for (const [ix, e] of tl.entries()) {
    if (e.t === 'tool' && toolInfo(e.name, e.input).k === 'todo') { const todos = parseMaybe(e.input)?.todos; if (Array.isArray(todos)) { grp = null; if (ix === lastTodo) out.push({ t: 'todo', todos }); continue; } }
    if (e.t === 'tool') { const it = toolInfo(e.name, e.input); if (grp) grp.push(it); else { grp = [it]; out.push({ t: 'tools', items: grp }); } }
    else { grp = null; if ((e.text || '').trim()) out.push(e); }
  }
  return out.map(e => e.t === 'todo' ? todoHtml(e.todos) : e.t === 'tools' ? actHtml(e.items, s.changes || []) : `<div class="md seg ${s.error ? 'err' : ''}">${md(e.text)}</div>`).join('');
}
function todoHtml(todos) {
  if (!Array.isArray(todos) || !todos.length) return '';
  const done = todos.filter(t => t.status === 'completed').length;
  return `<div class="todo-box"><div class="todo-head">Tareas <span class="muted">${done}/${todos.length}</span></div>${todos.map(t => `<div class="todo ${esc(t.status || 'pending')}">${t.status === 'completed' ? ico('check', 14) : '<span class="todo-c"></span>'}<span>${esc(t.status === 'in_progress' ? (t.activeForm || t.content) : t.content)}</span></div>`).join('')}</div>`;
}
function aggChanges(steps) {
  const m = new Map();
  for (const s of steps || []) for (const c of s.changes || []) {
    const k = relPath(c.path); const o = m.get(k) || { path: k, added: 0, removed: 0, applied: true };
    o.added += c.added || 0; o.removed += c.removed || 0; o.applied = o.applied && c.applied !== false; m.set(k, o);
  }
  return [...m.values()];
}
function changeRow(c) {
  const dir = c.path.split('/').slice(0, -1).join('/');
  return `<div class="cc-row" data-file="${esc(c.path)}" data-fk="edit" title="${esc(c.path)}">${ico('code', 14)}<span class="cc-name">${esc(fileName(c.path))}</span><span class="cc-dir">${esc(dir)}</span>${c.applied ? '' : '<span class="chip" style="font-size:10.5px">propuesta</span>'}<span style="flex:1"></span>${c.added ? `<span class="add">+${c.added}</span>` : ''}${c.removed ? `<span class="rem">−${c.removed}</span>` : ''}</div>`;
}
function changesCard(steps) {
  const list = aggChanges(steps); if (!list.length) return '';
  const A = list.reduce((x, c) => x + c.added, 0), R = list.reduce((x, c) => x + c.removed, 0);
  return `<div class="changes-card"><div class="cc-head">${list.length === 1 ? 'Se modificó 1 archivo' : `Se modificaron ${list.length} archivos`}</div>${list.slice(0, 3).map(changeRow).join('')}${list.length > 3 ? `<div class="cc-more">${list.slice(3).map(changeRow).join('')}</div>` : ''}<button class="cc-all"><span>${list.length > 3 ? 'Ver todo' : 'Ver diferencias'}</span><span style="flex:1"></span><span class="add">+${A}</span> <span class="rem">−${R}</span></button></div>`;
}
function openFileRef(path, kind) {
  if (isModelFile(path)) { openStudio(path); return; }
  if (kind === 'read') { S.fileView = relPath(path); openPanelTab('files'); return; }
  S.diffPath = relPath(path); openPanelTab('changes');
}

// ---------- Paneles como Claude Code: terminal, cambios, navegador, archivos ----------
function togglePanelTab(t) {
  if (document.body.classList.contains('panel-open') && S.panelTab === t) { document.body.classList.remove('panel-open'); markPanelBtns(); return; }
  openPanelTab(t);
}
function markPanelBtns() { const open = document.body.classList.contains('panel-open'); if ((!open || S.panelTab !== 'studio') && S.studio) { S.studio.dispose(); S.studio = null; } $$('[data-ptab]').forEach(b => b.classList.toggle('on', open && b.dataset.ptab === S.panelTab)); }
const shortCwd = p => { const a = String(p || '').replace(/\\/g, '/').split('/').filter(Boolean); return a.length > 2 ? '…/' + a.slice(-2).join('/') : a.join('/') || '~'; };

function renderTermTab(body) {
  const T = S.term || (S.term = { lines: [], cwd: null, hist: [], hi: 0, busy: false, pid: null });
  if (T.pid !== S.projectId) { T.pid = S.projectId; T.cwd = null; }
  body.innerHTML = `<div class="term"><div class="term-out" id="termOut"></div><div class="term-in"><span class="term-cwd" id="termCwd"></span><span class="term-p">&gt;</span><input id="termIn" spellcheck="false" autocomplete="off" placeholder="git status, gradlew build, dir…"></div></div>`;
  const draw = () => {
    const out = $('#termOut'); if (!out) return;
    out.innerHTML = T.lines.map(l => `<div class="tl-cmd"><span class="muted">${esc(shortCwd(l.cwd))}&gt;</span> ${esc(l.cmd)}</div>${l.out ? `<pre class="tl-out ${l.code ? 'bad' : ''}">${esc(l.out)}</pre>` : ''}${l.run ? '<div class="muted tl-run">Ejecutando…</div>' : ''}`).join('')
      || '<div class="muted" style="font-size:12.5px;line-height:1.5">Terminal en la carpeta del proyecto (cmd de Windows).<br>Usa <b>cd</b> para moverte, <b>cls</b> para limpiar y las flechas para repetir comandos.</div>';
    out.scrollTop = out.scrollHeight;
    $('#termCwd').textContent = shortCwd(T.cwd || project()?.path || '~');
  };
  draw();
  const inp = $('#termIn'); inp.focus();
  inp.onkeydown = async e => {
    if (e.key === 'ArrowUp') { T.hi = Math.max(0, T.hi - 1); inp.value = T.hist[T.hi] || ''; e.preventDefault(); return; }
    if (e.key === 'ArrowDown') { T.hi = Math.min(T.hist.length, T.hi + 1); inp.value = T.hist[T.hi] || ''; e.preventDefault(); return; }
    if (e.key !== 'Enter') return;
    const cmd = inp.value.trim(); if (!cmd || T.busy) return; inp.value = '';
    T.hist.push(cmd); T.hi = T.hist.length;
    if (cmd === 'cls' || cmd === 'clear') { T.lines = []; draw(); return; }
    const line = { cmd, cwd: T.cwd || project()?.path || '', out: '', run: true }; T.lines.push(line); T.busy = true; draw();
    try {
      const r = await fetch('/api/terminal', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Faisp': '1' }, body: JSON.stringify({ projectId: S.projectId, command: cmd, cwd: T.cwd }) });
      const j = await r.json(); line.out = j.out; line.code = j.code; if (j.cwd) T.cwd = j.cwd;
    } catch (err) { line.out = err.message; line.code = 1; }
    line.run = false; T.busy = false; T.lines = T.lines.slice(-80); draw();
  };
}

async function renderChangesTab(body) {
  const p = project();
  if (!p?.path) { body.innerHTML = '<h3>Cambios</h3><div class="muted" style="font-size:13px">Este proyecto no tiene carpeta.</div>'; return; }
  body.innerHTML = '<div class="muted" style="font-size:13px">Cargando cambios…</div>';
  const g = await api('GET', `/api/projects/${p.id}/git`).catch(() => ({ repo: false, files: [] }));
  if (S.panelTab !== 'changes') return;
  const files = g.repo ? g.files : aggChanges((S.chat?.messages || []).flatMap(m => m.steps || [])).map(c => ({ ...c, status: c.applied ? 'M' : 'P' }));
  const A = files.reduce((x, c) => x + (c.added || 0), 0), R = files.reduce((x, c) => x + (c.removed || 0), 0);
  const stName = s => ({ '??': ['U', 'nuevo'], A: ['A', 'añadido'], M: ['M', 'modificado'], D: ['D', 'borrado'], R: ['R', 'renombrado'], P: ['P', 'propuesto'] })[s] || [s || 'M', s];
  body.innerHTML = `<div class="ch-top">${g.repo ? `<span class="chip">${ico('branch', 12)} ${esc(g.branch || '')}</span>` : '<span class="muted" style="font-size:12.5px">Sin git: cambios de este chat</span>'}<span class="muted" style="font-size:12.5px">${files.length} archivo${files.length === 1 ? '' : 's'}</span><span class="add">+${A}</span><span class="rem">−${R}</span><span style="flex:1"></span><button class="icon-btn" id="chRef" title="Actualizar">${ico('refresh', 14)}</button></div>
    <div class="ch-files">${files.map(f => { const [l, t] = stName(f.status); const dir = f.path.split('/').slice(0, -1).join('/'); return `<div class="ch-file ${S.diffPath && sameFile(S.diffPath, f.path) ? 'on' : ''}" data-dp="${esc(f.path)}" title="${esc(f.path)}"><span class="st st-${esc(l)}" title="${esc(t)}">${esc(l)}</span><span class="cc-name">${esc(fileName(f.path))}</span><span class="cc-dir">${esc(dir)}</span><span style="flex:1"></span>${f.added ? `<span class="add">+${f.added}</span>` : ''}${f.removed ? `<span class="rem">−${f.removed}</span>` : ''}</div>`; }).join('') || '<div class="muted" style="font-size:13px;padding:8px 0">No hay cambios sin guardar.</div>'}</div>
    <div id="diffBox"></div>`;
  $('#chRef').onclick = () => renderChangesTab(body);
  const show = async path => {
    S.diffPath = path; $$('.ch-file', body).forEach(x => x.classList.toggle('on', x.dataset.dp === path));
    const box = $('#diffBox'); box.innerHTML = '<div class="muted" style="font-size:13px">Cargando diferencias…</div>';
    const r = await api('GET', `/api/projects/${p.id}/git/diff?path=${encodeURIComponent(path)}`).catch(e => ({ diff: '', err: e.message }));
    const cls = l => l.startsWith('+++') || l.startsWith('---') || l.startsWith('diff ') || l.startsWith('index ') ? 'dl-meta' : l.startsWith('+') ? 'dl-add' : l.startsWith('-') ? 'dl-rem' : l.startsWith('@@') ? 'dl-hunk' : '';
    box.innerHTML = `<div class="diff-head">${ico('code', 13)} <span class="mono">${esc(path)}</span><span style="flex:1"></span><button class="btn sm" id="dfOpen">Ver archivo</button></div>${r.diff ? `<pre class="diff-pre">${r.diff.split('\n').map(l => `<span class="${cls(l)}">${esc(l) || ' '}</span>`).join('\n')}</pre>` : `<div class="muted" style="font-size:13px">${esc(r.err || 'Sin diferencias que mostrar (¿ya está guardado en git o fuera del proyecto?).')}</div>`}`;
    $('#dfOpen').onclick = () => { S.fileView = path; openPanelTab('files'); };
  };
  $$('.ch-file', body).forEach(x => x.onclick = () => show(x.dataset.dp));
  if (S.diffPath) { const f = files.find(f => sameFile(S.diffPath, f.path)); show(f ? f.path : S.diffPath); }
}

function renderBrowserTab(body) {
  const url = S.browserUrl || '';
  body.innerHTML = `<div class="br"><div class="br-bar"><button class="icon-btn" id="brReload" title="Recargar">${ico('refresh', 14)}</button><input class="in" id="brUrl" value="${esc(url)}" placeholder="localhost:3000 o una dirección web" spellcheck="false"><button class="icon-btn" id="brExt" title="Abrir en el navegador del sistema">${ico('external', 14)}</button></div>
    ${url ? `<iframe id="brFrame" src="${esc(url)}" sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals allow-downloads"></iframe><div class="muted br-note">¿Sale en blanco? Algunos sitios no permiten verse dentro de otra app: ábrelo fuera con el botón de arriba.</div>`
      : `<div class="br-empty"><div class="muted" style="font-size:13px;margin-bottom:10px">Vista previa de tu web o servidor local mientras trabajas.</div>${['localhost:3000', 'localhost:5173', 'localhost:8080', 'localhost:4321'].map(u => `<button class="chip" data-bru="${u}">${u}</button>`).join(' ')}</div>`}</div>`;
  const go = v => { v = v.trim(); if (!v) return; if (!/^https?:\/\//i.test(v)) v = (/^(localhost|127\.|\[::1\]|\d+\.\d+\.\d+\.\d+)/i.test(v) ? 'http://' : 'https://') + v; S.browserUrl = v; renderBrowserTab(body); };
  $('#brUrl').onkeydown = e => { if (e.key === 'Enter') go(e.target.value); };
  $('#brReload').onclick = () => { const f = $('#brFrame'); if (f) f.src = f.src; };
  $('#brExt').onclick = () => { if (S.browserUrl) window.open(S.browserUrl, '_blank'); };
  $$('[data-bru]', body).forEach(b => b.onclick = () => go(b.dataset.bru));
}

async function projectFiles(p) {
  S.treeCache = S.treeCache || {};
  const c = S.treeCache[p.id]; if (c && Date.now() - c.t < 60000) return c.files;
  const r = await api('GET', `/api/projects/${p.id}/tree`).catch(() => ({ files: [] }));
  const files = (r.files || []).map(f => String(f).replace(/\\/g, '/'));
  S.treeCache[p.id] = { t: Date.now(), files };
  return files;
}
function mentionFile(rel) {
  const ta = $('#prompt');
  if (ta) { const p = ta.selectionStart ?? ta.value.length; const ins = (p && !/\s$/.test(ta.value.slice(0, p)) ? ' ' : '') + '@' + rel + ' '; ta.value = ta.value.slice(0, p) + ins + ta.value.slice(p); ta.focus(); ta.selectionStart = ta.selectionEnd = p + ins.length; autosize(ta); updateSendBtn(); }
  if (!S.attachments.includes(rel)) { S.attachments = [...S.attachments, rel]; renderAttachments(); }
}
async function renderFilesTab(body) {
  const p = project();
  if (!p?.path) { body.innerHTML = '<h3>Archivos</h3><div class="muted" style="font-size:13px">Este proyecto no tiene carpeta.</div>'; return; }
  if (S.fileView) return renderFileView(body, p, S.fileView);
  S.openDirs = S.openDirs || new Set();
  body.innerHTML = `<div class="files"><input class="in" id="fFilter" placeholder="Filtrar archivos…" value="${esc(S.fileFilter || '')}" spellcheck="false"><div class="ftree" id="fTree"><div class="muted" style="font-size:13px">Cargando…</div></div></div>`;
  const files = await projectFiles(p);
  if (S.panelTab !== 'files') return;
  const tree = {};
  for (const f of files) { let n = tree; const parts = f.split('/'); parts.forEach((x, i) => { if (i === parts.length - 1) (n.__f = n.__f || []).push(f); else n = n[x] = n[x] || {}; }); }
  const node = (n, base, depth) => Object.keys(n).filter(k => k !== '__f').sort((a, b) => a.localeCompare(b)).map(d => { const path = base + d + '/'; const open = S.openDirs.has(path); return `<div class="fdir ${open ? 'open' : ''}" data-dir="${esc(path)}" style="padding-left:${depth * 14 + 4}px">${ico('chevron', 12)}${ico('folder', 14)} ${esc(d)}</div>${open ? node(n[d], path, depth + 1) : ''}`; }).join('')
    + (n.__f || []).sort((a, b) => a.localeCompare(b)).map(f => `<div class="ffile" data-fv="${esc(f)}" style="padding-left:${depth * 14 + 20}px">${ico('file', 13)} ${esc(fileName(f))}</div>`).join('');
  const draw = () => {
    const q = (S.fileFilter || '').toLowerCase().trim();
    const el = $('#fTree'); if (!el) return;
    el.innerHTML = q ? files.filter(f => f.toLowerCase().includes(q)).slice(0, 300).map(f => `<div class="ffile" data-fv="${esc(f)}">${ico('file', 13)} ${esc(fileName(f))} <span class="cc-dir">${esc(f.split('/').slice(0, -1).join('/'))}</span></div>`).join('') || '<div class="muted" style="font-size:13px">Sin coincidencias</div>'
      : node(tree, '', 0) || '<div class="muted" style="font-size:13px">Carpeta vacía</div>';
    $$('.fdir', el).forEach(d => d.onclick = () => { const k = d.dataset.dir; S.openDirs.has(k) ? S.openDirs.delete(k) : S.openDirs.add(k); draw(); });
    $$('.ffile', el).forEach(f => f.onclick = () => { if (isModelFile(f.dataset.fv)) return openStudio(f.dataset.fv); S.fileView = f.dataset.fv; renderFilesTab(body); });
  };
  draw();
  const fi = $('#fFilter'); fi.oninput = () => { S.fileFilter = fi.value; draw(); };
}
async function renderFileView(body, p, rel) {
  body.innerHTML = `<div class="fv-head"><button class="icon-btn" id="fvBack" title="Volver">${ico('arrowLeft', 15)}</button><span class="mono fv-path" title="${esc(rel)}">${esc(rel)}</span><button class="btn sm" id="fvMention" title="Añadirlo a tu mensaje">@ Mencionar</button></div><div id="fvBody" class="muted" style="font-size:13px">Cargando…</div>`;
  $('#fvBack').onclick = () => { S.fileView = null; renderFilesTab(body); };
  $('#fvMention').onclick = () => mentionFile(rel);
  const box = $('#fvBody');
  if (IMG_RE.test(rel)) { const abs = p.path.replace(/[\\/]$/, '') + '\\' + rel.replace(/\//g, '\\'); box.innerHTML = `<img class="fv-img" src="/api/file?path=${encodeURIComponent(abs)}" alt="" data-zoom="${esc(abs)}">`; return; }
  try {
    const r = await api('GET', `/api/projects/${p.id}/file?path=${encodeURIComponent(rel)}`);
    if (S.fileView !== rel) return;
    const lines = String(r.content || '').split('\n');
    box.className = ''; box.innerHTML = `<pre class="fv-code">${lines.map((l, i) => `<span class="ln">${i + 1}</span>${esc(l) || ' '}`).join('\n')}</pre>`;
  } catch {
    S.fileView = null; S.fileFilter = fileName(rel); renderFilesTab(body);
  }
}

// ---------- Estudio: visor 3D + pedir cambios a la IA con captura y boceto ----------
const MODEL_FILE_RE = /\.(bbmodel|gltf|glb|obj)$|(^|\/)models\/.+\.json$/i;
const isModelFile = p => MODEL_FILE_RE.test(relPath(p));
const absOf = (p, rel) => /^[a-zA-Z]:[\\/]|^\\\\/.test(rel) ? rel : p.path.replace(/[\\/]$/, '') + '\\' + rel.replace(/\//g, '\\');
const studioReady = () => window.Studio ? Promise.resolve() : new Promise(r => window.addEventListener('studio-ready', r, { once: true }));
async function uploadFile(file) {
  const name = file.name || ('imagen-' + Date.now() + '.png');
  const r = await fetch('/api/upload', { method: 'POST', headers: { 'X-File-Name': encodeURIComponent(name) }, body: file });
  if (!r.ok) throw new Error(await r.text());
  return (await r.json()).path;
}
const dataUrlToFile = async (url, name) => new File([await (await fetch(url)).blob()], name, { type: 'image/png' });

function openStudio(rel) { S.studioPath = rel ? relPath(rel) : null; openPanelTab('studio'); }

async function renderStudioTab(body) {
  const p = project();
  S.studio?.dispose?.(); S.studio = null;
  if (!p?.path) { body.innerHTML = '<h3>Estudio</h3><div class="muted" style="font-size:13px">Este proyecto no tiene carpeta.</div>'; return; }
  if (!S.studioPath) {
    body.innerHTML = `<div class="files"><div class="muted" style="font-size:12.5px;margin-bottom:8px">Modelos del proyecto (Blockbench, JSON de Minecraft, glTF, OBJ). Elige uno para verlo en 3D y pedir cambios.</div><input class="in" id="stFilter" placeholder="Buscar modelo…" value="${esc(S.studioFilter || '')}" spellcheck="false"><div class="ftree" id="stList"><div class="muted">Cargando…</div></div></div>`;
    const files = (await projectFiles(p)).filter(f => MODEL_FILE_RE.test(f));
    if (S.panelTab !== 'studio') return;
    const draw = () => {
      const q = (S.studioFilter || '').toLowerCase();
      const list = files.filter(f => f.toLowerCase().includes(q)).sort((a, b) => (/\.bbmodel$/.test(b) - /\.bbmodel$/.test(a)) || a.localeCompare(b)).slice(0, 300);
      $('#stList').innerHTML = list.map(f => `<div class="ffile" data-sp="${esc(f)}">${ico('cube', 13)} ${esc(fileName(f))} <span class="cc-dir">${esc(f.split('/').slice(0, -1).join('/'))}</span></div>`).join('') || '<div class="muted" style="font-size:13px">No hay modelos.</div>';
      $$('[data-sp]', body).forEach(x => x.onclick = () => openStudio(x.dataset.sp));
    };
    draw(); const fi = $('#stFilter'); fi.oninput = () => { S.studioFilter = fi.value; draw(); };
    return;
  }
  const rel = S.studioPath, abs = absOf(p, rel);
  body.innerHTML = `<div class="studio">
    <div class="st-bar"><button class="icon-btn" id="stBack" title="Otros modelos">${ico('arrowLeft', 15)}</button><span class="mono fv-path" title="${esc(rel)}">${esc(fileName(rel))}</span>
      <button class="icon-btn" id="stGame" title="Luz del juego / luz normal">${ico('sparkle', 15)}</button><button class="icon-btn" id="stWire" title="Ver la malla">${ico('layers', 15)}</button><button class="icon-btn" id="stSpin" title="Girar solo">${ico('refresh', 15)}</button><button class="icon-btn" id="stReload" title="Recargar desde el archivo">${ico('download', 15)}</button></div>
    <div class="st-view" id="stView"><div class="st-msg muted" id="stMsg">Cargando modelo…</div></div>
    <div class="st-parts" id="stParts"></div>
    <div class="st-ai">
      <div class="st-sel" id="stSel">Haz clic en una pieza para pedir un cambio solo sobre ella.</div>
      <textarea class="in" id="stAsk" rows="2" placeholder="Pide un cambio: «la barba más larga y con 3 mechones», «añade un gorro»…" spellcheck="false"></textarea>
      <div class="row" style="gap:6px;margin-top:6px;flex-wrap:wrap"><button class="btn sm" id="stSketch">${ico('pencil', 13)} Dibujar sobre la vista</button><span id="stSketchChip"></span><span style="flex:1"></span><button class="btn sm primary" id="stSend">Enviar al Modelador 3D</button></div>
    </div></div>`;
  $('#stBack').onclick = () => { S.studioPath = null; renderStudioTab(body); };
  await studioReady();
  if (S.panelTab !== 'studio' || S.studioPath !== rel) return;
  const assetUrl = (kind, ref) => `/api/projects/${p.id}/asset?kind=${kind}&ref=${encodeURIComponent(ref)}`;
  const loadParent = async ref => { const r = await fetch(assetUrl('models', ref)); return r.ok ? r.json() : null; };
  const textureUrl = async ref => assetUrl('textures', ref);
  const drawParts = () => {
    const parts = ctl.parts();
    $('#stParts').innerHTML = parts.length ? parts.map(x => `<div class="st-part ${ctl.selected()?.id === x.id ? 'on' : ''}" data-pid="${esc(x.id)}" style="padding-left:${(x.depth || 0) * 12 + 6}px">${ico(x.kind === 'grupo' ? 'folder' : 'cube', 12)} ${esc(x.name)}</div>`).join('') : '';
    $$('[data-pid]', body).forEach(x => x.onclick = () => ctl.select(x.dataset.pid));
  };
  const ctl = window.Studio.open($('#stView'), {
    url: '/api/file?path=' + encodeURIComponent(abs) + '&t=' + Date.now(), name: rel, loadParent, textureUrl,
    onSelect: part => { $('#stSel').innerHTML = part ? `Pieza elegida: <b>${esc(part.name)}</b> <button class="lnk" id="stUnsel">quitar</button>` : 'Haz clic en una pieza para pedir un cambio solo sobre ella.'; $('#stUnsel')?.addEventListener('click', () => ctl.select(null)); drawParts(); },
  });
  S.studio = ctl; S.studioCtlPath = rel;
  ctl.ready.then(() => { $('#stMsg')?.remove(); drawParts(); }).catch(e => { const m = $('#stMsg'); if (m) m.textContent = 'No se pudo mostrar: ' + e.message; });
  const tog = (id, k) => { const b = $(id); b.classList.toggle('on', !!ctl.get(k)); b.onclick = async () => { await ctl.set(k, !ctl.get(k)); b.classList.toggle('on', !!ctl.get(k)); drawParts(); }; };
  tog('#stGame', 'game'); tog('#stWire', 'wire'); tog('#stSpin', 'spin');
  $('#stReload').onclick = () => ctl.reload().then(drawParts);
  let sketch = null;
  $('#stSketch').onclick = () => openSketch({ background: ctl.snapshot(), title: 'Dibuja sobre la vista: marca lo que quieres cambiar', onDone: async file => { sketch = file; $('#stSketchChip').innerHTML = `<span class="chip">${ico('image', 12)} boceto listo</span>`; } });
  $('#stSend').onclick = async () => {
    const ask = $('#stAsk').value.trim(); if (!ask && !sketch) return toast('Escribe qué quieres cambiar o haz un boceto');
    const btn = $('#stSend'); btn.disabled = true; btn.textContent = 'Preparando…';
    try {
      const att = [rel];
      att.push(await uploadFile(await dataUrlToFile(ctl.snapshot(), `vista-${fileName(rel)}-${Date.now()}.png`)));
      if (sketch) att.push(await uploadFile(sketch));
      const part = ctl.selected();
      const text = `Cambio en el modelo \`${rel}\`${part ? ` — pieza «${part.name}» (${part.kind})` : ''}:\n${ask || 'Sigue lo que marqué en el boceto.'}\n\nAdjunto una captura de cómo se ve ahora${sketch ? ' y un boceto con lo que quiero' : ''}. Mira las imágenes antes de empezar, cambia el archivo (o su generador si lo hay) y no toques lo demás.`;
      $('#stAsk').value = ''; sketch = null; $('#stSketchChip').innerHTML = '';
      if (S.view !== 'chat') { S.view = 'chat'; renderSidebar(); render(); }
      await send(text, att, agentById('modelos') ? 'modelos' : undefined);
      toast('Enviado al Modelador 3D: el modelo se recargará cuando lo cambie');
    } catch (e) { toast('No se pudo enviar: ' + e.message); }
    btn.disabled = false; btn.textContent = 'Enviar al Modelador 3D';
  };
}
// Si un agente cambia el modelo abierto, se recarga solo
let studioReloadT;
function studioMaybeReload(path) {
  if (!S.studio || S.panelTab !== 'studio' || !S.studioCtlPath || !sameFile(path, S.studioCtlPath)) return;
  clearTimeout(studioReloadT); studioReloadT = setTimeout(() => S.studio?.reload().catch(() => {}), 600);
}

// ---------- Boceto: dibuja tu idea y se adjunta como imagen ----------
function openSketch({ background = null, title = 'Boceto', onDone } = {}) {
  const o = document.createElement('div'); o.className = 'overlay';
  const COLORS = ['#111111', '#ffffff', '#e5484d', '#f5a524', '#46a758', '#3e8ef7', '#8e4ec6', '#c96442'];
  o.innerHTML = `<div class="modal sketch"><header>${esc(title)}<span style="flex:1"></span><button class="icon-btn" data-x>${ico('x', 14)}</button></header>
    <div class="sk-tools">${COLORS.map((c, i) => `<button class="sk-col ${i === (background ? 2 : 0) ? 'on' : ''}" data-c="${c}" style="background:${c}"></button>`).join('')}<input type="color" id="skPick" title="Otro color">
      <span class="sk-sep"></span><button class="btn sm" data-t="pen">${ico('pencil', 13)} Pincel</button><button class="btn sm" data-t="eraser">Borrador</button><button class="btn sm" data-t="rect">Caja</button><button class="btn sm" data-t="arrow">Flecha</button>
      <span class="sk-sep"></span><label class="muted" style="font-size:12px">Grosor <input type="range" id="skSize" min="1" max="40" value="5"></label>
      <span style="flex:1"></span><button class="btn sm" id="skUndo" title="Ctrl+Z">Deshacer</button><button class="btn sm" id="skClear">Limpiar</button></div>
    <div class="sk-wrap"><canvas id="skCanvas"></canvas></div>
    <footer><span class="muted" style="font-size:12.5px;flex:1">Dibuja algo simple: formas, flechas, colores. La IA lo mira junto a tu texto.</span><button class="btn" data-x>Cancelar</button><button class="btn primary" id="skDone">Adjuntar boceto</button></footer></div>`;
  document.body.appendChild(o);
  const cv = $('#skCanvas', o), g = cv.getContext('2d');
  const W = 1200, H = 800; cv.width = W; cv.height = H;
  let color = background ? '#e5484d' : '#111111', size = 5, tool = 'pen', drawing = false, last = null, start = null, snap = null;
  const hist = [];
  const bg = new Image();
  const paintBg = () => { g.fillStyle = '#ffffff'; g.fillRect(0, 0, W, H); if (background && bg.complete && bg.naturalWidth) { const s = Math.min(W / bg.naturalWidth, H / bg.naturalHeight); const w = bg.naturalWidth * s, h = bg.naturalHeight * s; g.fillStyle = '#2b2b2b'; g.fillRect(0, 0, W, H); g.drawImage(bg, (W - w) / 2, (H - h) / 2, w, h); } };
  if (background) { bg.onload = paintBg; bg.src = background; }
  paintBg();
  const save = () => { hist.push(g.getImageData(0, 0, W, H)); if (hist.length > 40) hist.shift(); };
  const pt = e => { const r = cv.getBoundingClientRect(); return [(e.clientX - r.left) * W / r.width, (e.clientY - r.top) * H / r.height]; };
  const stroke = () => { g.strokeStyle = tool === 'eraser' ? (background ? '#2b2b2b' : '#ffffff') : color; g.lineWidth = tool === 'eraser' ? size * 3 : size; g.lineCap = g.lineJoin = 'round'; };
  const arrow = (a, b) => { g.beginPath(); g.moveTo(...a); g.lineTo(...b); const ang = Math.atan2(b[1] - a[1], b[0] - a[0]), L = 14 + size * 2; g.moveTo(...b); g.lineTo(b[0] - L * Math.cos(ang - 0.45), b[1] - L * Math.sin(ang - 0.45)); g.moveTo(...b); g.lineTo(b[0] - L * Math.cos(ang + 0.45), b[1] - L * Math.sin(ang + 0.45)); g.stroke(); };
  cv.onpointerdown = e => { cv.setPointerCapture(e.pointerId); save(); drawing = true; last = start = pt(e); snap = g.getImageData(0, 0, W, H); if (tool === 'pen' || tool === 'eraser') { stroke(); g.beginPath(); g.arc(last[0], last[1], g.lineWidth / 2, 0, Math.PI * 2); g.fillStyle = g.strokeStyle; g.fill(); } };
  cv.onpointermove = e => {
    if (!drawing) return; const p = pt(e); stroke();
    if (tool === 'pen' || tool === 'eraser') { g.beginPath(); g.moveTo(...last); g.lineTo(...p); g.stroke(); last = p; }
    else { g.putImageData(snap, 0, 0); if (tool === 'rect') { g.beginPath(); g.strokeRect(start[0], start[1], p[0] - start[0], p[1] - start[1]); } else arrow(start, p); }
  };
  cv.onpointerup = () => { drawing = false; };
  $$('.sk-col', o).forEach(b => b.onclick = () => { color = b.dataset.c; if (tool === 'eraser') tool = 'pen'; $$('.sk-col', o).forEach(x => x.classList.toggle('on', x === b)); markTool(); });
  $('#skPick', o).oninput = e => { color = e.target.value; $$('.sk-col', o).forEach(x => x.classList.remove('on')); };
  const markTool = () => $$('[data-t]', o).forEach(b => b.classList.toggle('primary', b.dataset.t === tool));
  $$('[data-t]', o).forEach(b => b.onclick = () => { tool = b.dataset.t; markTool(); }); markTool();
  $('#skSize', o).oninput = e => { size = +e.target.value; };
  const undo = () => { const s = hist.pop(); if (s) g.putImageData(s, 0, 0); };
  $('#skUndo', o).onclick = undo;
  $('#skClear', o).onclick = () => { save(); paintBg(); };
  const key = e => { if (e.ctrlKey && e.key.toLowerCase() === 'z') { e.preventDefault(); undo(); } if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', key, true);
  const close = () => { document.removeEventListener('keydown', key, true); o.remove(); };
  $$('[data-x]', o).forEach(b => b.onclick = close);
  $('#skDone', o).onclick = () => cv.toBlob(async blob => { close(); const file = new File([blob], `boceto-${Date.now()}.png`, { type: 'image/png' }); if (onDone) onDone(file); else await uploadAndAttach(file); }, 'image/png');
}

// ---------- Menús de «/» y «@» en el cuadro de escritura ----------
function setModeQuick(m) { S.mode = m; store.set('mode', m); $('#modePick')?.dispatchEvent(new Event('redraw')); toast('Modo: ' + (MODES.find(x => x.id === m)?.label || m)); }
const SLASH = [
  { c: 'compactar', d: 'Resume la conversación para ahorrar contexto', i: 'layers', run: async () => { if (!S.chat?.id) return toast('Aún no hay conversación'); toast('Compactando…'); await api('POST', `/api/chats/${S.chat.id}/compact`); updateContext(); toast('Conversación compactada'); } },
  { c: 'nuevo', d: 'Empieza un chat nuevo', i: 'plus', run: () => $('#newChat').click() },
  { c: 'plan', d: 'Modo plan: propone sin cambiar nada', i: 'book', run: () => setModeQuick('plan') },
  { c: 'auto', d: 'Modo automático', i: 'zap', run: () => setModeQuick('auto') },
  { c: 'aceptar-ediciones', d: 'Acepta las ediciones sin preguntar', i: 'pencil', run: () => setModeQuick('acceptEdits') },
  { c: 'manual', d: 'Pregunta antes de cada cambio', i: 'shield', run: () => setModeQuick('manual') },
  { c: 'esfuerzo', d: 'Cambia el nivel de esfuerzo', i: 'chart', run: () => $('#effPick')?.click() },
  { c: 'agente', d: 'Elige quién responde', i: 'bot', run: () => $('#agentPick')?.click() },
  { c: 'contexto', d: 'Cuánto contexto lleva esta conversación', i: 'layers', run: () => $('#ctxChip')?.click() },
  { c: 'terminal', d: 'Terminal en la carpeta del proyecto', i: 'terminal', run: () => openPanelTab('terminal') },
  { c: 'cambios', d: 'Archivos modificados y sus diferencias', i: 'diff', run: () => openPanelTab('changes') },
  { c: 'archivos', d: 'Explorador de archivos del proyecto', i: 'folder', run: () => openPanelTab('files') },
  { c: 'navegador', d: 'Vista previa web', i: 'globe', run: () => openPanelTab('browser') },
  { c: 'estudio', d: 'Visor 3D de modelos para revisarlos y pedir cambios', i: 'cube', run: () => openStudio(S.studioPath) },
  { c: 'boceto', d: 'Dibuja tu idea y se adjunta al mensaje', i: 'pencil', run: () => openSketch() },
  { c: 'lateral', d: 'Chat lateral (Ctrl+;)', i: 'chat', run: () => openPanelTab('side') },
  { c: 'tareas', d: 'Trabajos en segundo plano', i: 'list', run: () => openPanelTab('tasks') },
  { c: 'uso', d: 'Uso y límites de tus cuentas', i: 'chart', run: () => { S.view = 'settings'; S.settingsTab = 'usage'; renderSidebar(); render(); } },
  { c: 'ajustes', d: 'Abre los ajustes', i: 'settings', run: () => { S.view = 'settings'; renderSidebar(); render(); } },
];
function slashItems(q) {
  const rank = arr => arr.filter(x => x.key.includes(q)).sort((a, b) => (a.key.startsWith(q) ? 0 : 1) - (b.key.startsWith(q) ? 0 : 1));
  const cmds = rank(SLASH.map(c => ({ key: c.c, icon: ico(c.i, 15), title: '/' + c.c, sub: c.d, insert: '', run: c.run })));
  const skills = rank((S.skillsList || []).map(s => ({ key: s.name.toLowerCase(), icon: ico('book', 15), title: '/' + s.name, sub: s.description || 'Skill', insert: `Usa la skill «${s.name}»: ` }))).slice(0, 12);
  cmds.forEach((x, i) => { if (!i) x.head = 'Comandos'; });
  skills.forEach((x, i) => { if (!i) x.head = 'Skills'; });
  return [...cmds, ...skills];
}
async function mentionItems(q) {
  const out = []; const ql = q.toLowerCase();
  agents().filter(a => a.id !== 'orquestador' && (a.name.toLowerCase().includes(ql) || a.id.includes(ql))).slice(0, 6)
    .forEach((a, i) => out.push({ head: i ? '' : 'Agentes', icon: agentIcon(a, 15), title: a.name, sub: 'que responda ' + a.name + ' · ' + a.model.split(':').pop(), insert: '', run: () => { S.agent = a.id; $('#agentPick')?.dispatchEvent(new Event('redraw')); toast(`Responderá ${a.name}`); } }));
  const p = project();
  if (p?.path) {
    const files = await projectFiles(p);
    files.filter(f => f.toLowerCase().includes(ql))
      .sort((a, b) => (fileName(a).toLowerCase().startsWith(ql) ? 0 : 1) - (fileName(b).toLowerCase().startsWith(ql) ? 0 : 1) || a.length - b.length).slice(0, 8)
      .forEach((f, i) => out.push({ head: i ? '' : 'Archivos del proyecto', icon: ico('file', 14), title: fileName(f), sub: f, insert: '@' + f + ' ', run: () => { if (!S.attachments.includes(f)) { S.attachments = [...S.attachments, f]; renderAttachments(); } } }));
  }
  return out;
}
function setupPop(ta, wrap) {
  if (!S.skillsList) { S.skillsList = []; api('GET', '/api/extensions').then(r => { S.skillsList = r.skills || []; }).catch(() => {}); }
  const pop = document.createElement('div'); pop.className = 'pop hidden'; wrap.appendChild(pop);
  let items = [], idx = 0, tok = null, seq = 0;
  const close = () => { pop.classList.add('hidden'); items = []; tok = null; };
  const draw = () => {
    pop.innerHTML = items.map((it, i) => `${it.head ? `<div class="pop-head">${it.head}</div>` : ''}<div class="pop-it ${i === idx ? 'on' : ''}" data-pi="${i}">${it.icon || ''}<span class="pt">${esc(it.title)}</span><span class="ps">${esc(it.sub || '')}</span></div>`).join('');
    pop.classList.remove('hidden');
    $$('.pop-it', pop).forEach(el => { el.onmousedown = e => { e.preventDefault(); pick(+el.dataset.pi); }; });
    pop.querySelector('.pop-it.on')?.scrollIntoView({ block: 'nearest' });
  };
  const pick = i => {
    const it = items[i]; if (!it || !tok) return;
    const v = ta.value, rep = it.insert ?? '';
    ta.value = v.slice(0, tok.start) + rep + v.slice(tok.end);
    ta.selectionStart = ta.selectionEnd = tok.start + rep.length;
    close(); ta.focus(); autosize(ta); updateSendBtn(); saveDraft();
    it.run?.();
  };
  const update = async () => {
    const my = ++seq;
    const pos = ta.selectionStart, before = ta.value.slice(0, pos);
    let m = before.match(/^\/([\w-]*)$/), kind = '/';
    if (!m) { m = before.match(/(?:^|\s)@([^\s@]*)$/); kind = '@'; }
    if (!m) return close();
    const q = m[1].toLowerCase();
    const list = kind === '/' ? slashItems(q) : await mentionItems(q);
    if (my !== seq) return;
    tok = { start: pos - m[1].length - 1, end: pos };
    items = list; if (!items.length) return close();
    idx = Math.min(idx, items.length - 1); draw();
  };
  ta.addEventListener('input', () => { idx = 0; update(); });
  ta.addEventListener('keydown', e => {
    if (pop.classList.contains('hidden') || !items.length) return;
    if (e.key === 'ArrowDown') { idx = (idx + 1) % items.length; draw(); }
    else if (e.key === 'ArrowUp') { idx = (idx - 1 + items.length) % items.length; draw(); }
    else if (e.key === 'Enter' || e.key === 'Tab') pick(idx);
    else if (e.key === 'Escape') close();
    else return;
    e.preventDefault(); e.stopImmediatePropagation();
  });
  ta.addEventListener('blur', () => setTimeout(close, 150));
}

// ---------- Límites: solo si siguen vigentes ----------
function normLimits(info) {
  if (!info) return info;
  const now = Date.now() / 1000, exp = t => t && t < now;
  const w = {}; for (const [k, v] of Object.entries(info.unifiedWindows || {})) w[k] = exp(v.resetsAt) ? { ...v, utilization: 0, resetsAt: null } : v;
  const out = { ...info, unifiedWindows: w };
  if (exp(info.resetsAt)) { out.status = 'allowed'; out.utilization = 0; out.resetsAt = null; }
  return out;
}

// Acciones delegadas: código, artefactos, pasos plegables
document.addEventListener('click', async e => {
  const asum = e.target.closest('.act-sum');
  if (asum) { asum.parentElement.classList.toggle('open'); return; }
  const fref = e.target.closest('[data-file]');
  if (fref) { openFileRef(fref.dataset.file, fref.dataset.fk); return; }
  const ccall = e.target.closest('.cc-all');
  if (ccall) { const card = ccall.closest('.changes-card'); if ($('.cc-more', card) && !card.classList.contains('all')) { card.classList.add('all'); $('span', ccall).textContent = 'Ver diferencias'; } else openFileRef($('.cc-row', card)?.dataset.file || '', 'edit'); return; }
  const fp = e.target.closest('code.fpath');
  if (fp) { openFileRef(fp.dataset.fpath, 'read'); return; }
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
  const ma = e.target.closest('[data-mact]');
  if (ma) { msgAction(ma.dataset.mact, ma.dataset.mid, ma); return; }
  const gch = e.target.closest('[data-goch]');
  if (gch) { document.getElementById('ch-' + gch.dataset.goch)?.scrollIntoView({ behavior: 'smooth', block: 'start' }); return; }
  const zm = e.target.closest('[data-zoom]');
  if (zm) { const o = document.createElement('div'); o.className = 'overlay lightbox'; o.innerHTML = `<img src="/api/file?path=${encodeURIComponent(zm.dataset.zoom)}" alt="">`; o.onclick = () => o.remove(); document.body.appendChild(o); return; }
  const ap = e.target.closest('[data-allow]');
  if (ap) { const card = ap.closest('[data-ap]'); $$('button', card).forEach(x => x.disabled = true); api('POST', `/api/approvals/${encodeURIComponent(card.dataset.ap)}`, { allow: ap.dataset.allow === '1' }).catch(err => toast(err.message)); return; }
  const art = e.target.closest('[data-art]');
  if (art) openArtifact(art.dataset.art);
});

// ---------- Acciones de mensajes (como en Claude) ----------
function msgText(m) { return m.role === 'user' ? m.content : (m.steps?.length ? m.steps.map(s => s.text).join('\n\n') : m.content); }
async function msgAction(act, mid, btn) {
  const m = S.chat?.messages.find(x => x.id === mid); if (!m) return;
  if (act === 'copy') { await navigator.clipboard.writeText(msgText(m)); toast('Copiado'); }
  if (act === 'fork') { const n = await api('POST', `/api/chats/${S.chat.id}/fork`, { messageId: mid }); await loadState(); openChat(n.id); toast('Conversación bifurcada'); }
  if (act === 'rewind') {
    if (!(await ask('¿Rebobinar hasta aquí? Se borran este mensaje y todo lo posterior; su texto vuelve al cuadro de escritura.', { ok: 'Rebobinar', danger: true }))) return;
    const r = await api('POST', `/api/chats/${S.chat.id}/rewind`, { messageId: mid });
    S.chat = await api('GET', '/api/chats/' + S.chat.id); S.attachments = r.attachments || [];
    store.set(draftKey(), JSON.stringify({ text: r.text, attachments: S.attachments })); render();
  }
  if (act === 'edit') {
    const el = btn.closest('.msg-user'); const bubble = $('.bubble', el);
    bubble.outerHTML = `<div class="edit-box"><textarea class="in" rows="3">${esc(m.content)}</textarea><div class="row" style="justify-content:flex-end;margin-top:6px"><button class="btn sm" data-ecancel>Cancelar</button><button class="btn sm primary" data-esave>Enviar</button></div></div>`;
    const box = $('.edit-box', el); const ta = $('textarea', box); ta.focus(); ta.selectionStart = ta.value.length;
    $('[data-ecancel]', box).onclick = () => render();
    $('[data-esave]', box).onclick = async () => {
      const t = ta.value.trim(); if (!t) return;
      await api('POST', `/api/chats/${S.chat.id}/rewind`, { messageId: mid });
      S.chat = await api('GET', '/api/chats/' + S.chat.id);
      send(t, m.attachments || []);
    };
  }
  if (act === 'chapter') {
    const t = await askText('Título del capítulo:', (msgText(m).replace(/[#*_>`]/g, '').trim().split('\n')[0] || 'Capítulo').slice(0, 50));
    if (!t) return;
    const chapters = [...(S.chat.chapters || []).filter(c => c.messageId !== mid), { messageId: mid, title: t.trim() }];
    await api('PATCH', '/api/chats/' + S.chat.id, { chapters }); S.chat.chapters = chapters; render(); toast('Capítulo fijado');
  }
  if (act === 'speak') {
    if (speechSynthesis.speaking) { speechSynthesis.cancel(); return; }
    const u = new SpeechSynthesisUtterance(msgText(m).replace(/```[\s\S]*?```/g, ' (código omitido) ').replace(/[#*_>`|]/g, ''));
    const v = speechSynthesis.getVoices().find(v => v.lang.startsWith('es')); if (v) { u.voice = v; u.lang = v.lang; }
    speechSynthesis.speak(u); toast('Leyendo en voz alta (pulsa otra vez para parar)');
  }
}

// ---------- Panel derecho ----------
$('#panelBtn').onclick = () => { document.body.classList.toggle('panel-open'); if (document.body.classList.contains('panel-open')) renderPanel(); };
$('#closePanel').onclick = () => { document.body.classList.remove('panel-open'); markPanelBtns(); };
$$('#panelTabs button').forEach(b => b.onclick = () => { S.panelTab = b.dataset.tab; renderPanel(); });

function openArtifact(id) { S.artifactId = id; S.preview = null; S.panelTab = 'artifact'; document.body.classList.add('panel-open'); renderPanel(); }
function openPreview(text, lang) { S.preview = { text, lang }; S.artifactId = null; S.panelTab = 'artifact'; document.body.classList.add('panel-open'); renderPanel(); }

async function renderPanel() {
  $$('#panelTabs button').forEach(b => b.classList.toggle('on', b.dataset.tab === S.panelTab));
  const body = $('#panelBody');
  if (S.panelTab === 'plan') return renderPlanTab(body);
  if (S.panelTab === 'tasks') return renderTasksTab(body);
  markPanelBtns();
  if (S.panelTab === 'side') return renderSideTab(body);
  if (S.panelTab === 'terminal') return renderTermTab(body);
  if (S.panelTab === 'changes') return renderChangesTab(body);
  if (S.panelTab === 'browser') return renderBrowserTab(body);
  if (S.panelTab === 'files') return renderFilesTab(body);
  if (S.panelTab === 'studio') return renderStudioTab(body);
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

function openPanelTab(t) { S.panelTab = t; document.body.classList.add('panel-open'); renderPanel(); }

function renderPlanTab(body) {
  const p = S.lastPlan;
  if (!p || !p.steps?.length) { body.innerHTML = '<h3>Plan</h3><div class="muted" style="font-size:13px">Cuando el orquestador reparta una tarea, aquí verás cada paso y su estado.</div>'; return; }
  body.innerHTML = '<h3>Plan del último envío</h3>' + p.steps.map(s => { const st = S.planStatus[s.id]; const c = p.ctx[s.id]; return `<div class="ev plan-step"><span class="dot ${st === 'run' ? 'run' : st === 'done' ? 'on' : ''}"></span><b>${agentIcon(agentById(s.agent), 14)} ${esc(s.agentName || s.agent)}</b>${c?.effort ? ` <span class="chip effchip">${esc(EFFORT_NAMES[c.effort] || c.effort)}</span>` : ''}<div class="muted" style="font-size:12.5px;margin-top:4px">${esc((s.task || '').slice(0, 220))}</div>${s.dependsOn?.length ? `<div class="muted" style="font-size:11.5px">Espera a: ${s.dependsOn.map(esc).join(', ')}</div>` : ''}</div>`; }).join('');
}

async function renderTasksTab(body) {
  const r = await api('GET', '/api/runs').catch(() => ({ running: [], paused: [], routines: [] }));
  body.innerHTML = `<h3>En curso</h3>${r.running.length ? r.running.map(x => `<div class="ev"><span class="dot run"></span> <b>${esc(x.title)}</b> <span class="when">${ago(x.startedAt)}</span><div class="row" style="margin-top:6px"><button class="btn sm" data-open="${x.chatId}">Abrir</button><button class="btn sm danger" data-stop="${x.chatId}">Detener</button></div></div>`).join('') : '<div class="muted" style="font-size:13px">Nada trabajando ahora.</div>'}
    <h3>En pausa por límite</h3>${r.paused.length ? r.paused.map(x => `<div class="ev">${ico('clock', 13)} <b>${esc(x.title)}</b><div class="muted" style="font-size:12.5px">Continúa a las ${new Date(x.resumeAt * 1000).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}</div><div class="row" style="margin-top:6px"><button class="btn sm" data-open="${x.chatId}">Abrir</button><button class="btn sm" data-unpause="${x.chatId}">Cancelar</button></div></div>`).join('') : '<div class="muted" style="font-size:13px">Ninguna.</div>'}
    <h3>Rutinas activas</h3>${r.routines.length ? r.routines.map(x => `<div class="ev">${ico('clock', 13)} <b>${esc(x.name)}</b> <span class="muted" style="font-size:12px">${esc(x.schedule)}</span></div>`).join('') : '<div class="muted" style="font-size:13px">Ninguna.</div>'}`;
  $$('[data-open]', body).forEach(b => b.onclick = () => openChat(b.dataset.open));
  $$('[data-stop]', body).forEach(b => b.onclick = async () => { await api('POST', `/api/chats/${b.dataset.stop}/stop`); setTimeout(() => renderTasksTab(body), 800); });
  $$('[data-unpause]', body).forEach(b => b.onclick = async () => { await api('POST', `/api/chats/${b.dataset.unpause}/resume`); renderTasksTab(body); });
  clearTimeout(S.tasksTimer); S.tasksTimer = setTimeout(() => { if (S.panelTab === 'tasks' && document.body.classList.contains('panel-open')) renderTasksTab(body); }, 5000);
}

async function renderSideTab(body) {
  if (!S.side || S.side.projectId !== S.projectId) S.side = await api('POST', '/api/side-chat', { projectId: S.projectId });
  else S.side = await api('GET', '/api/chats/' + S.side.id);
  const msgs = S.side.messages || [];
  body.innerHTML = `<div class="side-chat"><div class="muted" style="font-size:12.5px;margin-bottom:8px">Preguntas rápidas que no se mezclan con el chat principal. <button class="btn sm" id="sideClear" style="float:right">Vaciar</button></div>
    <div class="side-thread" id="sideThread">${msgs.map(m => m.role === 'user' ? `<div class="side-u">${esc(m.content)}</div>` : `<div class="side-a md">${md(msgText(m))}</div>`).join('') || '<div class="muted" style="font-size:13px">Sin mensajes.</div>'}</div>
    <div class="side-in"><textarea class="in" id="sideIn" rows="2" placeholder="Pregunta rápida… (Enter para enviar)"></textarea></div></div>`;
  const th = $('#sideThread'); th.scrollTop = th.scrollHeight;
  $('#sideClear').onclick = async () => { await api('DELETE', '/api/chats/' + S.side.id); S.side = null; renderSideTab(body); };
  const inp = $('#sideIn'); inp.focus();
  inp.addEventListener('keydown', async e => {
    if (e.key !== 'Enter' || e.shiftKey) return; e.preventDefault();
    const text = inp.value.trim(); if (!text) return; inp.value = ''; inp.disabled = true;
    th.insertAdjacentHTML('beforeend', `<div class="side-u">${esc(text)}</div><div class="side-a md" id="sideLive">…</div>`); th.scrollTop = th.scrollHeight;
    const res = await fetch(`/api/chats/${S.side.id}/send`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text, agentId: 'auto', mode: 'plan', effort: 'auto' }) });
    const reader = res.body.getReader(); const dec = new TextDecoder(); let buf = '', acc = '';
    for (;;) { const { value, done } = await reader.read(); if (done) break; buf += dec.decode(value, { stream: true }); let i; while ((i = buf.indexOf('\n\n')) >= 0) { const raw = buf.slice(0, i); buf = buf.slice(i + 2); const ev = (raw.match(/^event: (.+)$/m) || [])[1]; const d = (raw.match(/^data: (.+)$/m) || [])[1]; if (!d) continue; const j = JSON.parse(d); if (ev === 'delta') acc += j.text; if (ev === 'plan' && j.reply) acc = j.reply; const live = $('#sideLive'); if (live) live.innerHTML = md(acc || '…'); th.scrollTop = th.scrollHeight; } }
    inp.disabled = false; renderSideTab(body);
  });
}

async function moreMenu(anchor) {
  const ka = await api('GET', '/api/keep-awake').catch(() => ({ on: false }));
  menu(anchor, [
    { label: ico('chat', 15) + '<div><div>Chat lateral</div><div class="sub">Ctrl+;</div></div>', run: () => openPanelTab('side') },
    { label: ico('clock', 15) + ' Tareas en segundo plano', run: () => openPanelTab('tasks') },
    { label: ico('book', 15) + ' Plan', run: () => openPanelTab('plan') },
    '-',
    { label: ico('zap', 15) + `<div><div>Mantener la computadora activa ${ka.on ? ico('tick', 13) : ''}</div><div class="sub">Solo mientras faisp esté abierto</div></div>`, run: async () => { const r = await api('POST', '/api/keep-awake', { on: !ka.on }); toast(r.on ? 'El PC no se suspenderá mientras faisp esté abierto' : 'El PC puede suspenderse con normalidad'); } },
  ]);
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
  { id: 'sideChat', label: 'Chat lateral', def: 'Ctrl+;', run: () => openPanelTab('side') },
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
  const info = normLimits(l.info), wins = info.unifiedWindows || {};
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
  $('#panelTabs').innerHTML = [['board', 'Pizarra'], ['plan', 'Plan'], ['tasks', 'Tareas'], ['terminal', 'Terminal'], ['changes', 'Cambios'], ['browser', 'Navegador'], ['files', 'Archivos'], ['studio', 'Estudio'], ['side', 'Lateral'], ['artifact', 'Artefacto']].map(([t, l]) => `<button data-tab="${t}" class="${t === S.panelTab ? 'on' : ''}">${l}</button>`).join('');
  $$('#panelTabs button').forEach(b => b.onclick = () => { S.panelTab = b.dataset.tab; renderPanel(); });
  $$('[data-i]').forEach(e => e.insertAdjacentHTML('afterbegin', ico(e.dataset.i, +e.dataset.s || 17)));
  $('#moreBtn').onclick = e => moreMenu(e.currentTarget);
  $$('[data-ptab]').forEach(b => b.onclick = () => togglePanelTab(b.dataset.ptab));
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
