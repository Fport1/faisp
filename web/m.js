// faisp en el teléfono. Habla con faisp en tu PC (red local, emparejado con QR); el trabajo lo hace el PC.
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const md = t => DOMPurify.sanitize(marked.parse(t || ''));
const store = { get: (k, d) => { try { return localStorage.getItem('m:' + k) ?? d; } catch { return d; } }, set: (k, v) => { try { localStorage.setItem('m:' + k, v); } catch {} } };
const fileName = p => String(p).split(/[\\/]/).pop();
const fmtTok = n => n >= 1e6 ? (n / 1e6).toFixed(1) + 'M' : n >= 1e3 ? (n / 1e3).toFixed(1) + 'k' : String(n || 0);
async function api(method, url, body) {
  const r = await fetch(url, { method, headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined });
  if (!r.ok) throw new Error((await r.text()) || r.statusText);
  const t = await r.text(); return t ? JSON.parse(t) : null;
}
function toast(t) { const d = document.createElement('div'); d.className = 'toast'; d.textContent = t; document.body.appendChild(d); setTimeout(() => d.remove(), 2400); }
const I = {
  menu: '<path d="M4 7h16M4 12h16M4 17h10"/>', plus: '<path d="M12 5v14M5 12h14"/>', up: '<path d="M12 19V5M5.5 11.5 12 5l6.5 6.5"/>',
  stop: '<rect x="7" y="7" width="10" height="10" rx="2" fill="currentColor"/>', chev: '<path d="m6 9 6 6 6-6"/>', down: '<path d="m6 9 6 6 6-6"/>',
  file: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/>', bot: '<rect x="4" y="8" width="16" height="11" rx="3"/><path d="M12 4v4M9 13h.01M15 13h.01"/>',
  photo: '<rect x="3" y="5" width="18" height="14" rx="3"/><circle cx="9" cy="10" r="1.6"/><path d="m21 16-5-5-9 8"/>', check: '<path d="m5 12 5 5 9-10"/>',
};
const ico = (n, s = 20, w = 1.9) => `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round">${I[n] || ''}</svg>`;

const M = { st: null, pid: store.get('pid', ''), chat: null, chatId: null, streaming: false, seq: 0, abort: null, queue: [], agent: 'auto', att: [], live: null, stick: true, limits: null };
const agents = () => (M.st?.agents || []).filter(a => a.id !== 'orquestador');
const agentById = id => (M.st?.agents || []).find(a => a.id === id);
const project = () => M.st?.projects.find(p => p.id === M.pid);

// ---------- Actividad (como en el PC, compacta) ----------
function parseMaybe(x) { if (x && typeof x === 'object') return x; try { return JSON.parse(x); } catch { return {}; } }
function toolInfo(name, inp) {
  const n = String(name || '').toLowerCase(); inp = parseMaybe(inp) || {};
  const path = inp.file_path || inp.path || inp.ruta || '';
  if (/^(read|read_file|leer_google_doc|obsidian_leer)$/.test(n)) return { k: 'read', l: 'Leer', a: path };
  if (/^(grep|glob|ls|search_files|obsidian_buscar|obsidian_listar)$/.test(n)) return { k: 'search', l: 'Buscar', a: inp.pattern || inp.query || path };
  if (/^(bash|shell|run_command|powershell|command_execution)$/.test(n)) return { k: 'cmd', l: 'Ejecutar', a: inp.command || '' };
  if (/^(write|write_file|obsidian_escribir)$/.test(n)) return { k: 'write', l: 'Crear', a: path };
  if (/^(edit|multiedit|file_change|str_replace|notebookedit)$/.test(n)) return { k: 'edit', l: 'Editar', a: path };
  if (/(web_search|websearch|webfetch)/.test(n)) return { k: 'web', l: 'Web', a: inp.query || inp.url || '' };
  if (/todo/.test(n)) return { k: 'todo', l: 'Tareas', a: '' };
  return { k: 'other', l: String(name).replace(/^mcp__/, '').replace(/__/g, ' › '), a: '' };
}
const VERB = { read: 'Leyendo', search: 'Buscando en el código', cmd: 'Ejecutando', edit: 'Editando', write: 'Creando', web: 'Buscando en la web', todo: 'Organizando tareas', other: 'Usando' };
function actSummary(items, changes = []) {
  const g = {}; items.forEach(i => (g[i.k] = g[i.k] || []).push(i));
  const n = k => g[k]?.length || 0, pl = (c, s, p) => c + ' ' + (c === 1 ? s : p), parts = [];
  const files = (k, v) => { if (!g[k]) return; const fs = [...new Set(g[k].map(i => i.a).filter(Boolean))]; const ch = changes.filter(c => fs.some(f => String(c.path).endsWith(fileName(f)))); const a = ch.reduce((x, c) => x + (c.added || 0), 0), r = ch.reduce((x, c) => x + (c.removed || 0), 0); parts.push(`${v} ${fs.length === 1 ? `<span class="fname">${esc(fileName(fs[0]))}</span>` : pl(fs.length || n(k), 'archivo', 'archivos')}${a ? ` <span class="add">+${a}</span>` : ''}${r ? ` <span class="rem">−${r}</span>` : ''}`); };
  if (n('read')) parts.push('leyó ' + pl(n('read'), 'archivo', 'archivos'));
  if (n('search')) parts.push('buscó ' + pl(n('search'), 'vez', 'veces'));
  if (n('cmd')) parts.push('ejecutó ' + pl(n('cmd'), 'comando', 'comandos'));
  files('write', 'creó'); files('edit', 'editó');
  if (n('web')) parts.push('consultó la web');
  if (n('other')) parts.push('usó ' + [...new Set(g.other.map(i => i.l))].slice(0, 2).map(esc).join(', '));
  const s = parts.join(', '); return s.charAt(0).toUpperCase() + s.slice(1);
}
const actHtml = (items, ch) => `<div class="act"><button>${actSummary(items, ch)} <span class="chev">${ico('chev', 14)}</span></button><div class="list">${items.map(i => `<div class="it"><b>${esc(i.l)}</b>${esc(i.a)}</div>`).join('')}</div></div>`;
const todoHtml = t => Array.isArray(t) && t.length ? `<div class="todo">${t.map(x => `<div class="t ${esc(x.status)}"><span class="c"></span><span>${esc(x.status === 'in_progress' ? x.activeForm || x.content : x.content)}</span></div>`).join('')}</div>` : '';
function flow(s) {
  const tl = s.timeline?.length && !s.error ? s.timeline : [...(s.tools || []).map(t => ({ t: 'tool', name: t.name, input: t.input })), { t: 'text', text: s.text }];
  const lastTodo = tl.map((e, i) => e.t === 'tool' && /todo/i.test(e.name) ? i : -1).filter(i => i >= 0).pop();
  let out = '', grp = null;
  const close = () => { if (grp) { out += actHtml(grp, s.changes || []); grp = null; } };
  tl.forEach((e, i) => {
    if (e.t === 'tool' && /todo/i.test(e.name)) { close(); if (i === lastTodo) out += todoHtml(parseMaybe(e.input).todos); return; }
    if (e.t === 'tool') { (grp = grp || []).push(toolInfo(e.name, e.input)); return; }
    close(); if ((e.text || '').trim()) out += `<div class="md ${s.error ? 'err' : ''}">${md(e.text)}</div>`;
  });
  close(); return out;
}
function changesCard(steps) {
  const m = new Map();
  for (const s of steps || []) for (const c of s.changes || []) { const o = m.get(c.path) || { path: c.path, added: 0, removed: 0 }; o.added += c.added || 0; o.removed += c.removed || 0; m.set(c.path, o); }
  const l = [...m.values()]; if (!l.length) return '';
  return `<div class="cc"><div class="h">${l.length === 1 ? 'Se modificó 1 archivo' : `Se modificaron ${l.length} archivos`}</div>${l.map(c => `<button class="r" data-diff="${esc(c.path)}">${ico('file', 15)}<span class="n">${esc(fileName(c.path))}</span>${c.added ? `<span class="add">+${c.added}</span>` : ''}${c.removed ? `<span class="rem">−${c.removed}</span>` : ''}</button>`).join('')}</div>`;
}

// ---------- Pintar ----------
function renderMsg(m) {
  if (m.role === 'user') return `<div class="u" data-mid="${esc(m.id || '')}"><div><div class="bub">${esc(m.content)}</div>${(m.attachments || []).length ? `<div class="att">${m.attachments.map(a => `<span class="a">${esc(fileName(a))}</span>`).join('')}</div>` : ''}</div></div>`;
  const steps = m.steps || [];
  if (!steps.length) return `<div class="ai" data-mid="${esc(m.id || '')}"><div class="md">${md(m.content)}</div></div>`;
  return `<div class="ai" data-mid="${esc(m.id || '')}">${steps.map(s => `${steps.length > 1 ? `<div class="who">${esc(s.agentName || agentById(s.agentId)?.name || s.agentId)}</div>` : ''}${flow(s)}`).join('')}${changesCard(steps)}</div>`;
}
function render() {
  const p = project();
  $('#mTitle').textContent = M.chat?.title || 'faisp';
  $('#mSub').textContent = p ? p.name : '';
  const th = $('#mThread');
  if (!M.chat || !M.chat.messages.length) {
    const h = new Date().getHours();
    th.innerHTML = `<div class="home"><img src="/icon.svg" alt=""><h1>${h < 13 ? 'Buenos días' : h < 21 ? 'Buenas tardes' : 'Buenas noches'}${p ? `,<br>¿qué hacemos en <i>${esc(p.name)}</i>?` : ''}</h1><p>Tu PC hace el trabajo; desde aquí lo diriges.</p><div class="sugg">${['Resume en qué va el proyecto', '¿Qué cambió hoy?', 'Busca bugs probables en el código'].map(s => `<button data-sug="${esc(s)}">${esc(s)}</button>`).join('')}</div></div>`;
  } else th.innerHTML = M.chat.messages.map(renderMsg).join('');
  if (M.live && M.streaming) th.appendChild(M.live);
  th.scrollTop = th.scrollHeight;
  drawQueue(); updSend();
}
function renderDrawer() {
  $('#mProjects').innerHTML = `<div class="prj">${(M.st.projects || []).map(p => `<button class="${p.id === M.pid ? 'on' : ''}" data-pid="${esc(p.id)}">${esc(p.name)}</button>`).join('')}</div>`;
  const running = new Set((M.runs?.running || []).map(r => r.chatId));
  const chats = (M.st.chats || []).filter(c => !M.pid || c.projectId === M.pid).slice(0, 60);
  $('#mChats').innerHTML = chats.map(c => `<button class="ch ${c.id === M.chatId ? 'on' : ''}" data-cid="${esc(c.id)}"><span>${esc(c.title || 'Nuevo chat')}</span>${running.has(c.id) ? '<i class="run"></i>' : ''}</button>`).join('') || '<div class="dfoot">Aún no hay chats.</div>';
  $('#mFoot').innerHTML = `faisp ${esc(M.st.version || '')} · conectado a tu PC`;
}
const drawer = open => $('#mDrawer').classList.toggle('open', open);
function sheet(html) { $('#mSheetBody').innerHTML = html; $('#mSheet').classList.add('open'); }
const closeSheet = () => $('#mSheet').classList.remove('open');

// ---------- Cargar ----------
async function load() {
  M.st = await api('GET', '/api/state');
  M.runs = await api('GET', '/api/runs').catch(() => null);
  if (!M.st.projects.some(p => p.id === M.pid)) M.pid = M.st.projects.find(p => p.path)?.id || M.st.projects[0]?.id || '';
  renderDrawer(); drawAgent();
  api('GET', '/api/claude/limits').then(l => { M.limits = l; drawRing(); }).catch(() => {});
}
async function openChat(id) {
  if (M.streaming && M.liveFor !== id) detach();
  M.chatId = id; store.set('chat', id || '');
  M.chat = id ? await api('GET', '/api/chats/' + id).catch(() => null) : null;
  if (!M.chat) M.chatId = null;
  if (M.chat?.projectId && M.chat.projectId !== M.pid) { M.pid = M.chat.projectId; store.set('pid', M.pid); }
  loadDraft(); render(); renderDrawer(); drawer(false);
  if (!id || M.liveFor === id) return;
  const r = (await api('GET', '/api/runs').catch(() => null))?.running?.find(x => x.chatId === id);
  if (r && M.chatId === id) stream(id, s => fetch(`/api/chats/${id}/live`, { signal: s }), r.startedAt);
  else runQueue();
}

// ---------- Enviar y ver en vivo ----------
function detach() { M.seq++; M.abort?.abort(); M.streaming = false; M.liveFor = null; M.live = null; }
async function send(textOverride, attOverride) {
  const ta = $('#mIn'); const text = (textOverride ?? ta.value).trim(); if (!text) return;
  if (M.streaming) { M.queue.push({ text, att: [...M.att], chat: M.chatId }); ta.value = ''; M.att = []; drawAtt(); clearDraft(); drawQueue(); autosize(); toast('En cola: se enviará al terminar'); return; }
  if (!M.chat) { M.chat = await api('POST', '/api/chats', { projectId: M.pid || null }); M.chatId = M.chat.id; store.set('chat', M.chatId); }
  const att = attOverride ?? [...M.att];
  M.chat.messages.push({ role: 'user', content: text, attachments: att });
  ta.value = ''; M.att = []; drawAtt(); clearDraft(); autosize();
  const id = M.chat.id, body = JSON.stringify({ text, agentId: M.agent, attachments: att, mode: '', effort: 'auto' });
  stream(id, s => fetch(`/api/chats/${id}/send`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, signal: s }));
}
const SPIN = ['·', '✢', '✳', '✶', '✻', '✽', '✻', '✶', '✳', '✢'];
async function stream(chatId, open, startedAt) {
  detach(); const my = M.seq;
  M.streaming = true; M.liveFor = chatId; M.stick = true;
  const live = document.createElement('div'); live.className = 'ai live';
  live.innerHTML = `<div class="status"><span class="sp">✻</span><span class="v">Pensando…</span><span class="m"></span></div>`;
  M.live = live; render();
  const steps = {}; let single = true, verb = 'Pensando', last = Date.now(), kind = '', out = 0, fr = 0;
  const t0 = startedAt ? new Date(startedAt).getTime() : Date.now();
  const setV = (v, k) => { verb = v; kind = k || ''; last = Date.now(); };
  const seg = (s, k) => { let g = s.segs[s.segs.length - 1]; if (!g || g.k !== k) { const el = document.createElement('div'); if (k === 'text') el.className = 'md'; s.box.appendChild(el); g = { k, el, text: '', items: [] }; s.segs.push(g); } return g; };
  const tick = () => {
    for (const s of Object.values(steps)) for (const g of s.segs) if (g.k === 'text' && g.dirty) { g.el.innerHTML = md(g.text); g.dirty = false; }
    const st = $('.status', live);
    if (st) { const q = Date.now() - last; $('.sp', st).textContent = SPIN[fr++ % SPIN.length]; $('.v', st).textContent = (q > 6000 && (kind === 'text' || kind === 'tool') ? 'Pensando' : verb) + '…'; const x = Math.floor((Date.now() - t0) / 1000); $('.m', st).textContent = `(${x < 60 ? x + ' s' : Math.floor(x / 60) + ' min ' + String(x % 60).padStart(2, '0') + ' s'}${out ? ' · ↓ ' + fmtTok(Math.round(out / 4)) : ''})`; }
    if (M.stick && live.isConnected) { const th = $('#mThread'); th.scrollTop = th.scrollHeight; }
  };
  const timer = setInterval(tick, 120);
  const ac = new AbortController(); M.abort = ac; updSend();
  try {
    const res = await open(ac.signal); if (!res.ok) throw new Error(await res.text());
    const rd = res.body.getReader(), dec = new TextDecoder(); let buf = '';
    for (;;) {
      if (my !== M.seq) { ac.abort(); break; }
      const { value, done } = await rd.read(); if (done) break;
      buf += dec.decode(value, { stream: true }); let i;
      while ((i = buf.indexOf('\n\n')) >= 0) {
        const raw = buf.slice(0, i); buf = buf.slice(i + 2); let ev = '', data = '';
        for (const l of raw.split('\n')) { if (l.startsWith('event:')) ev = l.slice(6).trim(); else if (l.startsWith('data:')) data += l.slice(5).trim(); }
        if (data && my === M.seq) try { handle(ev, JSON.parse(data)); } catch {}
      }
    }
  } catch (e) { if (e.name !== 'AbortError' && my === M.seq) live.insertAdjacentHTML('beforeend', `<div class="err">${esc(e.message)}</div>`); }
  clearInterval(timer);
  if (my !== M.seq) return;
  tick(); M.streaming = false; M.liveFor = null; M.live = null;
  if (M.chatId === chatId) { M.chat = await api('GET', '/api/chats/' + chatId).catch(() => M.chat); render(); }
  M.st = await api('GET', '/api/state').catch(() => M.st); renderDrawer();
  api('GET', '/api/claude/limits').then(l => { M.limits = l; drawRing(); }).catch(() => {});
  runQueue();

  function handle(ev, d) {
    if (ev === 'status') setV(String(d.text || '').replace(/…$/, ''), 'status');
    else if (ev === 'plan') { single = (d.steps || []).length <= 1; if (d.reply) { $('.status', live)?.remove(); live.insertAdjacentHTML('beforeend', `<div class="md">${md(d.reply)}</div>`); } else setV(single ? 'Empezando' : `Repartiendo ${d.steps.length} tareas`, 'status'); }
    else if (ev === 'step_start') {
      const name = agentById(d.agent)?.name || d.agent;
      const box = document.createElement('div');
      box.innerHTML = `${single ? '' : `<div class="who"><span class="dot"></span>${esc(name)}</div>`}`;
      $('.status', live).before(box);
      steps[d.stepId] = { box, segs: [], changes: [], name };
      setV((single ? '' : name + ': ') + 'Pensando', 'status');
    } else if (ev === 'delta') { const s = steps[d.stepId]; if (!s) return; const g = seg(s, 'text'); g.text += d.text; g.dirty = true; out += d.text.length; setV((single ? '' : s.name + ': ') + 'Escribiendo', 'text'); }
    else if (ev === 'tool') {
      const s = steps[d.stepId]; if (!s) return; const it = toolInfo(d.name, d.input);
      if (it.k === 'todo') { const t = parseMaybe(d.input).todos; if (Array.isArray(t)) { if (!s.todo) { s.todo = document.createElement('div'); s.box.appendChild(s.todo); s.segs.push({ k: 'todo', el: s.todo }); } s.todo.innerHTML = todoHtml(t); const c = t.find(x => x.status === 'in_progress'); setV((single ? '' : s.name + ': ') + (c ? c.activeForm || c.content : 'Organizando tareas'), 'tool'); return; } }
      const g = seg(s, 'tools'); g.items.push(it); g.el.innerHTML = actHtml(g.items, s.changes).replace(/^<div class="act">|<\/div>$/g, ''); g.el.className = 'act';
      setV((single ? '' : s.name + ': ') + VERB[it.k] + (it.a && it.k !== 'other' ? ' ' + (it.k === 'cmd' ? it.a.slice(0, 40) : fileName(it.a)) : it.k === 'other' ? ' ' + it.l : ''), 'tool');
    } else if (ev === 'file_change') { const s = steps[d.stepId]; if (s) { const c = s.changes.find(x => x.path === d.path); if (c) { c.added += d.added; c.removed += d.removed; } else s.changes.push({ path: d.path, added: d.added, removed: d.removed }); } }
    else if (ev === 'step_done') { const s = steps[d.stepId]; s?.box.querySelector('.dot')?.remove(); }
    else if (ev === 'approval') setV('Esperando tu permiso en el PC', 'approval');
    else if (ev === 'paused') live.insertAdjacentHTML('beforeend', `<div class="pause">Límite de Claude agotado · seguirá solo a las ${new Date(d.resumeAt * 1000).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}</div>`);
    else if (ev === 'error') { $('.status', live)?.remove(); live.insertAdjacentHTML('beforeend', `<div class="err">${esc(d.error)}</div>`); }
    else if (ev === 'done') $('.status', live)?.remove();
  }
}
function runQueue() {
  const i = M.queue.findIndex(q => q.chat === M.chatId); if (i < 0 || M.streaming) return;
  const q = M.queue.splice(i, 1)[0]; drawQueue(); setTimeout(() => send(q.text, q.att), 150);
}
function drawQueue() {
  const q = M.queue.filter(x => x.chat === M.chatId);
  $('#mQueue').innerHTML = q.map((x, i) => `<div class="q"><span>${esc(x.text)}</span><button data-qnow="${i}">Enviar ahora</button><button data-qdel="${i}">✕</button></div>`).join('');
}
function updSend() {
  const b = $('#mSend'), has = !!$('#mIn').value.trim() || M.att.length > 0; const stop = M.streaming && !has;
  b.classList.toggle('stop', stop); b.innerHTML = ico(stop ? 'stop' : 'up', 18, 2.3); b.disabled = !M.streaming && !has;
}
function autosize() { const t = $('#mIn'); t.style.height = 'auto'; t.style.height = Math.min(t.scrollHeight, innerHeight * 0.3) + 'px'; updSend(); }
const draftKey = () => 'draft:' + (M.chatId || 'new:' + M.pid);
function loadDraft() { $('#mIn').value = store.get(draftKey(), ''); autosize(); }
let dT; function saveDraft() { clearTimeout(dT); dT = setTimeout(() => store.set(draftKey(), $('#mIn').value), 300); }
function clearDraft() { try { localStorage.removeItem('m:' + draftKey()); } catch {} }

// ---------- Adjuntos (cámara, fotos, archivos) ----------
function drawAtt() {
  $('#mAtt').innerHTML = M.att.map((a, i) => /\.(png|jpe?g|webp|gif|heic)$/i.test(a) ? `<span class="a img"><img src="/api/file?path=${encodeURIComponent(a)}" alt=""><button class="x" data-rm="${i}">✕</button></span>` : `<span class="a">${ico('file', 14)} ${esc(fileName(a))}<button class="x" data-rm="${i}">✕</button></span>`).join('');
  updSend();
}
async function upload(f) {
  const name = f.name || 'foto-' + Date.now() + '.jpg';
  const r = await fetch('/api/upload', { method: 'POST', headers: { 'X-File-Name': encodeURIComponent(name) }, body: f });
  if (!r.ok) throw new Error(await r.text()); M.att.push((await r.json()).path); drawAtt();
}

// ---------- Agente, uso del plan, acciones ----------
function drawAgent() { const a = M.agent === 'auto' ? null : agentById(M.agent); $('#mAgent').innerHTML = `${ico('bot', 15)} ${esc(a ? a.name : 'Equipo')} ${ico('chev', 13)}`; }
function agentSheet() {
  sheet(`<div class="sh-t">¿Quién responde?</div><button class="opt" data-ag="auto"><div>Equipo<small>El orquestador reparte entre agentes</small></div>${M.agent === 'auto' ? `<span class="tick">${ico('check', 18)}</span>` : ''}</button>${agents().map(a => `<button class="opt" data-ag="${esc(a.id)}"><div>${esc(a.name)}<small>${esc(String(a.model).split(':').pop())}</small></div>${M.agent === a.id ? `<span class="tick">${ico('check', 18)}</span>` : ''}</button>`).join('')}`);
}
function planWins() {
  const i = M.limits?.info; if (!i) return null; const now = Date.now() / 1000; const w = {};
  for (const [k, v] of Object.entries(i.unifiedWindows || {})) w[k] = v.resetsAt && v.resetsAt < now ? { utilization: 0 } : v;
  return Object.keys(w).length ? w : null;
}
function drawRing() {
  const b = $('#mUsage'), w = planWins(); if (!w) { b.classList.add('hidden'); return; }
  const p = Math.min(1, Math.max(...Object.values(w).map(x => x.utilization || 0))), r = 8, c = 2 * Math.PI * r, col = p >= .9 ? '#e5484d' : p >= .7 ? '#f5a524' : '#3e8ef7';
  b.classList.remove('hidden');
  b.innerHTML = `<svg width="22" height="22" viewBox="0 0 22 22"><circle cx="11" cy="11" r="${r}" fill="none" stroke="var(--line2)" stroke-width="2.6"/><circle cx="11" cy="11" r="${r}" fill="none" stroke="${col}" stroke-width="2.6" stroke-linecap="round" stroke-dasharray="${(c * p).toFixed(2)} ${c.toFixed(2)}" transform="rotate(-90 11 11)"/></svg>`;
}
function usageSheet(state) {
  const N = { five_hour: 'Límite de 5 horas', seven_day: 'Semanal · todos los modelos', seven_day_opus: 'Semanal · Opus', seven_day_sonnet: 'Semanal · Sonnet' };
  const w = planWins() || {};
  sheet(`<div class="sh-t">Límites de uso del plan</div>${Object.entries(w).map(([k, v]) => { const p = Math.round((v.utilization || 0) * 100); const d = v.resetsAt ? new Date(v.resetsAt * 1000) : null; return `<div class="ubar"><div class="l"><span>${esc(N[k] || k)}</span><span>${d ? 'Se restablece ' + d.toLocaleString('es-ES', { weekday: 'short', hour: '2-digit', minute: '2-digit' }) + ' · ' : ''}${p} %</span></div><div class="track"><div style="width:${p}%"></div></div></div>`; }).join('') || '<p>Sin datos todavía.</p>'}<div style="font-size:12px;color:var(--faint);text-align:right">${state || ''}</div>`);
}
async function diffSheet(path) {
  const p = project(); if (!p) return;
  sheet(`<div class="sh-t">${esc(fileName(path))}</div><div style="font-size:13px;color:var(--muted)">Cargando…</div>`);
  const rel = String(path).replace(/\\/g, '/').replace(p.path.replace(/\\/g, '/').replace(/\/$/, '') + '/', '');
  const r = await api('GET', `/api/projects/${p.id}/git/diff?path=${encodeURIComponent(rel)}`).catch(() => ({ diff: '' }));
  const cls = l => l.startsWith('+++') || l.startsWith('---') ? '' : l.startsWith('+') ? 'a' : l.startsWith('-') ? 'r' : l.startsWith('@@') ? 'h' : '';
  $('#mSheetBody').innerHTML = `<div class="sh-t">${esc(rel)}</div>${r.diff ? `<div class="diff">${r.diff.split('\n').slice(0, 1500).map(l => `<span class="${cls(l)}">${esc(l) || ' '}</span>`).join('')}</div>` : '<p style="color:var(--muted);font-size:14px">Sin diferencias que mostrar.</p>'}`;
}
function msgSheet(mid) {
  const m = M.chat?.messages.find(x => x.id === mid); if (!m) return;
  const text = m.role === 'user' ? m.content : (m.steps || []).map(s => s.text).join('\n\n') || m.content;
  sheet(`<button class="opt" data-ma="copy">Copiar</button><button class="opt" data-ma="fork">Bifurcar desde aquí</button><button class="opt" data-ma="speak">Leer en voz alta</button>`);
  $('#mSheetBody').onclick = async e => {
    const a = e.target.closest('[data-ma]')?.dataset.ma; if (!a) return; closeSheet();
    if (a === 'copy') { await navigator.clipboard.writeText(text).catch(() => {}); toast('Copiado'); }
    if (a === 'fork') { const n = await api('POST', `/api/chats/${M.chat.id}/fork`, { messageId: mid }); M.st = await api('GET', '/api/state'); openChat(n.id); }
    if (a === 'speak') { speechSynthesis.cancel(); const u = new SpeechSynthesisUtterance(text.replace(/```[\s\S]*?```/g, ' ').replace(/[#*_>`|]/g, '')); u.lang = 'es-ES'; speechSynthesis.speak(u); }
  };
}

// ---------- Eventos ----------
$('#mMenu').innerHTML = ico('menu', 22); $('#mNew').innerHTML = ico('plus', 22); $('#mAdd').innerHTML = ico('plus', 20); $('#mJump').innerHTML = ico('down', 18);
$('#mMenu').onclick = () => drawer(true);
$('#mDrawer .scrim').onclick = () => drawer(false);
$('#mSheet .scrim').onclick = closeSheet;
$('#mNew').onclick = () => openChat(null);
$('#mUsage').onclick = () => { const fresh = M.limits?.checkedAt && Date.now() / 1000 - M.limits.checkedAt < 30; usageSheet(fresh ? '' : 'Actualizando…'); if (!fresh) api('POST', '/api/claude/limits/refresh').then(l => { M.limits = l; drawRing(); if ($('#mSheet').classList.contains('open')) usageSheet('Actualizado ahora'); }).catch(() => {}); };
$('#mAgent').onclick = agentSheet;
$('#mAdd').onclick = () => $('#mFile').click();
$('#mFile').onchange = async e => { for (const f of e.target.files) { if (f.size > 30 * 1048576) { toast('Máximo 30 MB por archivo'); continue; } toast('Subiendo ' + (f.name || 'foto') + '…'); try { await upload(f); } catch (err) { toast('No se pudo subir'); } } e.target.value = ''; };
$('#mIn').addEventListener('input', () => { autosize(); saveDraft(); });
$('#mIn').addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing && matchMedia('(hover: hover)').matches) { e.preventDefault(); send(); } });
$('#mSend').onclick = () => (M.streaming && !$('#mIn').value.trim() ? api('POST', `/api/chats/${M.chatId}/stop`).catch(() => {}) : send());
document.addEventListener('click', e => {
  const t = e.target;
  const pid = t.closest('[data-pid]'); if (pid) { M.pid = pid.dataset.pid; store.set('pid', M.pid); openChat(null); return; }
  const cid = t.closest('[data-cid]'); if (cid) { openChat(cid.dataset.cid); return; }
  const sug = t.closest('[data-sug]'); if (sug) { $('#mIn').value = sug.dataset.sug; autosize(); $('#mIn').focus(); return; }
  const ag = t.closest('[data-ag]'); if (ag) { M.agent = ag.dataset.ag; drawAgent(); closeSheet(); return; }
  const act = t.closest('.act > button'); if (act) { act.parentElement.classList.toggle('open'); return; }
  const df = t.closest('[data-diff]'); if (df) { diffSheet(df.dataset.diff); return; }
  const rm = t.closest('[data-rm]'); if (rm) { M.att.splice(+rm.dataset.rm, 1); drawAtt(); return; }
  const qd = t.closest('[data-qdel]'); if (qd) { const q = M.queue.filter(x => x.chat === M.chatId)[+qd.dataset.qdel]; M.queue.splice(M.queue.indexOf(q), 1); drawQueue(); return; }
  const qn = t.closest('[data-qnow]'); if (qn) { const q = M.queue.filter(x => x.chat === M.chatId)[+qn.dataset.qnow]; M.queue.splice(M.queue.indexOf(q), 1); M.queue.unshift(q); drawQueue(); api('POST', `/api/chats/${M.chatId}/stop`).catch(() => {}); toast('Deteniendo para enviar tu mensaje…'); }
});
// Mantener pulsado un mensaje: acciones
let press;
$('#mThread').addEventListener('touchstart', e => { const m = e.target.closest('[data-mid]'); if (!m?.dataset.mid) return; press = setTimeout(() => { navigator.vibrate?.(10); msgSheet(m.dataset.mid); }, 520); }, { passive: true });
['touchend', 'touchmove', 'touchcancel'].forEach(ev => $('#mThread').addEventListener(ev, () => clearTimeout(press), { passive: true }));
$('#mThread').addEventListener('contextmenu', e => { const m = e.target.closest('[data-mid]'); if (m?.dataset.mid) { e.preventDefault(); msgSheet(m.dataset.mid); } });
// Desplazamiento: si subes, deja de seguir el final
let lastTop = 0;
$('#mThread').addEventListener('scroll', () => { const th = $('#mThread'), t = th.scrollTop; const atEnd = th.scrollHeight - t - th.clientHeight < 40; if (t < lastTop - 2) M.stick = false; else if (atEnd) M.stick = true; lastTop = t; $('#mJump').classList.toggle('show', !atEnd); }, { passive: true });
$('#mJump').onclick = () => { M.stick = true; const th = $('#mThread'); th.scrollTop = th.scrollHeight; };
// Al volver a la app (iOS la congela en segundo plano): reengancharse si sigue trabajando
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && M.chatId) openChat(M.chatId); });

load().then(() => openChat(store.get('chat', '') || null)).catch(e => { $('#mThread').innerHTML = `<div class="home"><h1>No hay conexión con tu PC</h1><p>${esc(e.message)}</p><p>Comprueba que faisp está abierto en el PC y que el teléfono está en la misma red WiFi.</p><button class="chip" onclick="location.reload()">Reintentar</button></div>`; });
