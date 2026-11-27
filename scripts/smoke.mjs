// Pruebas rápidas de faisp sobre una instancia aislada (puerto propio, datos temporales, sin claves: modo demo).
// Uso:  node scripts/smoke.mjs [escenario]     escenarios: agentes (por defecto), chat, todo
// Cada resultado sale con el prefijo [smoke]; el proceso termina con código 1 si algo falla.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const exe = path.join(root, 'target', 'debug', process.platform === 'win32' ? 'faisp.exe' : 'faisp');
const scenario = process.argv[2] || 'agentes';
let fails = 0;
const ok = (m) => console.log('[smoke] ok    ' + m);
const bad = (m) => { fails++; console.log('[smoke] FALLO ' + m); };
const check = (cond, m) => (cond ? ok(m) : bad(m));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function instance(port, dataDir) {
  const p = spawn(exe, ['--headless', '--port', String(port), '--data', dataDir], { stdio: 'ignore', env: { ...process.env, FAISP_UI_DIR: path.join(root, 'ui') } });
  const base = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 60; i++) { try { if ((await fetch(base + '/api/runs')).ok) break; } catch {} await sleep(250); }
  const api = async (method, url, body) => { const r = await fetch(base + url, { method, headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined }); const t = await r.text(); try { return t ? JSON.parse(t) : null; } catch { throw new Error(method + ' ' + url + ' -> ' + r.status + ' ' + t.slice(0, 80)); } };
  const sse = async (url, body) => { const r = await fetch(base + url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); const t = await r.text(); return t.split('\n\n').map((b) => ({ ev: (/^event: (.+)$/m.exec(b) || [])[1], data: (() => { try { return JSON.parse((/^data: (.+)$/m.exec(b) || [])[1]); } catch { return null; } })() })).filter((e) => e.ev); };
  return { api, sse, stop: () => p.kill() };
}
// Configuración sin claves y sin suscripciones: todo en modo demo (no gasta)
function demoConfig(cfgPath) {
  const c = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
  for (const p of Object.values(c.providers || {})) { p.apiKey = ''; if (['claude-code', 'codex-cli'].includes(p.type) || p.noKeyNeeded) p.type = 'mock'; }
  c.routing.useSubscription = false; c.routing.planner = 'heuristic';
  fs.writeFileSync(cfgPath, JSON.stringify(c, null, 1));
}

async function agentes() {
  // 1) Valores de fábrica en una instalación nueva
  const d1 = fs.mkdtempSync(path.join(os.tmpdir(), 'faisp-smoke-'));
  let f = await instance(4399, d1);
  const st = await f.api('GET', '/api/state');
  const code = st.agents.find((a) => a.id === 'codigo');
  check(code && ['probar', 'en el juego', 'runclient', 'capturas'].every((k) => code.keywords.includes(k)), 'Código trae las palabras de pruebas de fábrica');
  check(code?.mcp?.includes('gemini-media'), 'Código trae gemini-media de fábrica');
  check(/PROBAR UN MOD/.test(code?.system || ''), 'Código trae la instrucción de pruebas');
  const launcher = st.agents.find((a) => a.id === 'launcher');
  if (launcher) {
    check(!['lanzar', 'partida', 'en el juego'].some((k) => launcher.keywords.includes(k)), 'Launcher sin «lanzar / partida / en el juego»');
    check(/EXCEPCIÓN/.test(launcher.system) && /NO prueba/.test(launcher.description), 'Launcher dice que no prueba mods en desarrollo');
  } else ok('Launcher no instalado en este PC (no se comprueba)');
  const skill = path.join(d1, 'skills', 'probar-mods-minecraft.md');
  check(fs.existsSync(skill) && fs.readFileSync(skill, 'utf8').includes('incluida con faisp: v'), 'skill probar-mods-minecraft instalada');
  const ext = await f.api('GET', '/api/extensions');
  check(ext.skills.some((s) => s.id === 'probar-mods-minecraft' || s.name === 'probar-mods-minecraft'), 'la skill aparece cargada');
  { const t = fs.readFileSync(skill, 'utf8'); check(t.includes('<modid>') && !new RegExp('java.com.[a-z]+.client').test(t), 'la skill de fábrica es genérica (sin proyectos de nadie)'); }
  f.stop(); await sleep(500);
  // Una copia propia sin la marca (personalizada por el usuario) no se pisa al arrancar
  const mine = '---\nname: probar-mods-minecraft\ndescription: mi versión\n---\nMis mods.\n';
  fs.writeFileSync(skill, mine);

  // 2) Migración de una configuración antigua (v4, sin los cambios)
  const cfgPath = path.join(d1, 'config.json');
  const old = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
  old.version = 4;
  const oc = old.agents.find((a) => a.id === 'codigo');
  oc.keywords = oc.keywords.filter((k) => !['probar', 'prueba', 'en el juego', 'runclient'].includes(k)); oc.mcp = []; oc.system = 'Eres el programador senior.'; oc.description = 'Código, mixins, Gradle, shaders, JSON de datos, depuración.';
  const ol = old.agents.find((a) => a.id === 'launcher');
  if (ol) { ol.keywords.push('lanzar', 'partida', 'en el juego'); ol.system = 'Eres la IA del Modpack Launcher.'; ol.description = 'Trabaja con las instancias del Modpack Launcher: crashes, mods, packs, configs, mundos, registro del juego y pruebas en vivo.'; }
  fs.writeFileSync(cfgPath, JSON.stringify(old, null, 1));
  demoConfig(cfgPath);
  f = await instance(4399, d1);
  const st2 = await f.api('GET', '/api/state');
  const c2 = st2.agents.find((a) => a.id === 'codigo');
  check(c2.keywords.includes('en el juego') && c2.mcp.includes('gemini-media') && /PROBAR UN MOD/.test(c2.system) && /PRUEBA/.test(c2.description), 'migración v5: Código actualizado');
  const l2 = st2.agents.find((a) => a.id === 'launcher');
  if (l2) check(!l2.keywords.includes('lanzar') && /EXCEPCIÓN/.test(l2.system) && /NO prueba/.test(l2.description), 'migración v5: Launcher actualizado');
  check(fs.readFileSync(skill, 'utf8') === mine, 'una skill personalizada (sin la marca) no se pisa');

  // 3) Reparto: «pruébalo en el juego» va a Código, no al Launcher
  const p = await f.api('POST', '/api/projects', { name: 'mod', path: '' });
  const chat = await f.api('POST', '/api/chats', { projectId: p.id });
  const evs = await f.sse(`/api/chats/${chat.id}/send`, { text: 'Prueba en el juego que los contadores se ven bien y saca capturas', agentId: 'auto', attachments: [], mode: '', effort: '' });
  const plan = evs.find((e) => e.ev === 'plan')?.data;
  const agentsInPlan = (plan?.steps || []).map((s) => s.agent);
  check(agentsInPlan.includes('codigo') && !agentsInPlan.includes('launcher'), `«prueba en el juego» va a: ${agentsInPlan.join(', ') || '(nadie)'}`);
  f.stop(); await sleep(300);
  fs.rmSync(d1, { recursive: true, force: true });
}

async function chat() {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'faisp-smoke-'));
  let f = await instance(4399, d); f.stop(); await sleep(400);
  demoConfig(path.join(d, 'config.json'));
  f = await instance(4399, d);
  const p = await f.api('POST', '/api/projects', { name: 'demo', path: '' });
  const c = await f.api('POST', '/api/chats', { projectId: p.id });
  const evs = await f.sse(`/api/chats/${c.id}/send`, { text: 'Hola', agentId: 'auto', attachments: [], mode: '', effort: '' });
  check(evs.some((e) => e.ev === 'done'), 'un envío termina con «done»');
  const saved = await f.api('GET', `/api/chats/${c.id}`);
  check(saved.messages.length === 2, 'se guardan el mensaje y la respuesta');
  f.stop(); await sleep(300);
  fs.rmSync(d, { recursive: true, force: true });
}

// Varios agentes: cada uno recibe SU parte y sabe qué hacen los demás (no la petición entera a todos)
async function reparto() {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'faisp-smoke-'));
  let f = await instance(4399, d); f.stop(); await sleep(400);
  demoConfig(path.join(d, 'config.json'));
  f = await instance(4399, d);
  const p = await f.api('POST', '/api/projects', { name: 'mod', path: '' });
  const c = await f.api('POST', '/api/chats', { projectId: p.id });
  const evs = await f.sse(`/api/chats/${c.id}/send`, { text: 'Haz el modelo 3D de un trineo en blockbench y escribe el lore de su historia', agentId: 'auto', attachments: [], mode: '', effort: '' });
  const plan = evs.find((e) => e.ev === 'plan')?.data?.steps || [];
  check(plan.length >= 2, `el plan reparte entre ${plan.map((s) => s.agent).join(', ')}`);
  const done = evs.find((e) => e.ev === 'done')?.data?.message;
  const texts = (done?.steps || []).map((s) => s.text);
  check(texts.length >= 2 && texts.every((t) => t.includes('Tu parte')), 'cada agente recibe «Tu parte»');
  check(texts.length >= 2 && texts.every((t) => t.includes('Encárgate SOLO')), 'con la petición repetida, a cada uno se le pide solo lo de su especialidad');
  check(new Set(texts.map((t) => (/especialidad \(([^)]*)\)/.exec(t) || [])[1])).size === texts.length, 'cada agente ve una especialidad distinta');
  f.stop(); await sleep(300);
  fs.rmSync(d, { recursive: true, force: true });
}

// El orquestador sabe qué hizo cada agente y CÓMO: cada evento de la pizarra guarda comandos, archivos y herramientas,
// y el historial antiguo (sin ese dato) se reconstruye al arrancar a partir de los pasos guardados en los chats.
async function registro() {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'faisp-smoke-'));
  let f = await instance(4399, d); f.stop(); await sleep(400);
  demoConfig(path.join(d, 'config.json'));
  f = await instance(4399, d);
  const p = await f.api('POST', '/api/projects', { name: 'mod', path: '' });
  const c = await f.api('POST', '/api/chats', { projectId: p.id });
  await f.sse(`/api/chats/${c.id}/send`, { text: 'Escribe el lore de una pistola de hielo', agentId: 'auto', attachments: [], mode: '', effort: '' });
  let bb = await f.api('GET', `/api/projects/${p.id}/blackboard`);
  check(bb.events.length > 0 && bb.events.every((e) => typeof e.how === 'string' && e.how.length > 0), `los eventos nuevos guardan el «cómo»: ${bb.events[0]?.how}`);
  f.stop(); await sleep(500);

  // Historial antiguo: un paso del modelador con herramientas, y su evento sin «cómo»
  const dbPath = path.join(d, 'db.json');
  const db = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
  const task = 'Modela la pistola de hielo para el mod';
  db.chats.push({ id: 'c_old', projectId: p.id, title: 'pistola', createdAt: '2026-11-01T10:00:00Z', updatedAt: '2026-11-01T10:00:00Z', messages: [
    { id: 'm1', role: 'user', content: 'haz la pistola', ts: '2026-11-01T10:00:00Z' },
    { id: 'm2', role: 'assistant', content: 'Hecha.', ts: '2026-11-01T10:05:00Z', steps: [{ id: 's1', agentId: 'modelos', agentName: 'Modelador 3D', task, model: 'claude-code:opus', text: 'Hecha.', tools: [
      { name: 'Write', input: JSON.stringify({ file_path: 'C:\\mods\\WT\\tools\\PistolaGen.java', content: 'class PistolaGen {}' }), result: '' },
      { name: 'Bash', input: JSON.stringify({ command: 'java tools/PistolaGen.java' }), result: '' },
      { name: 'Read', input: '{"file_path":"C:\\\\mods\\\\WT\\\\src\\\\main\\\\resources\\\\assets\\\\wt\\\\models\\\\item\\\\pistola_hielo.json","limit":4000, "x": "recortado sin cerrar', result: '' },
    ], changes: [{ path: 'src/main/resources/assets/wt/models/item/pistola_hielo.bbmodel', added: 300, removed: 0, applied: true }] }] },
  ] });
  db.events.unshift({ id: 'ev_old', ts: '2026-11-01T10:05:00Z', projectId: p.id, chatId: 'c_old', agentId: 'modelos', agentName: 'Modelador 3D', task, summary: 'Hecha.', how: '', compressed: true });
  fs.writeFileSync(dbPath, JSON.stringify(db));
  f = await instance(4399, d);
  bb = await f.api('GET', `/api/projects/${p.id}/blackboard`);
  const old = bb.events.find((e) => e.id === 'ev_old');
  console.log('[smoke] cómo reconstruido: ' + old?.how);
  check(/escribió .*PistolaGen\.java/.test(old?.how || '') && /pistola_hielo\.bbmodel/.test(old?.how || ''), 'el historial antiguo recupera los archivos escritos');
  check(/ejecutó `java tools\/PistolaGen\.java`/.test(old?.how || ''), 'y los comandos que ejecutó');
  check(/leyó .*pistola_hielo\.json/.test(old?.how || ''), 'y lo que leyó (aunque la entrada esté recortada)');
  f.stop(); await sleep(300);
  fs.rmSync(d, { recursive: true, force: true });
}

// Los proveedores principales no se pueden quitar (ni por la API ni con una configuración vieja) y hay cierre de sesión
async function proveedores() {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'faisp-smoke-'));
  let f = await instance(4399, d); f.stop(); await sleep(400);
  demoConfig(path.join(d, 'config.json'));
  f = await instance(4399, d);
  const st = await f.api('GET', '/api/state');
  const builtin = st.builtinProviders || [];
  check(['claude', 'chatgpt', 'anthropic', 'gemini'].every((id) => builtin.includes(id)), `el estado dice cuáles son principales: ${builtin.join(', ')}`);
  const cfg = st.config;
  delete cfg.providers.claude; delete cfg.providers.gemini;
  cfg.providers.mio = { label: 'mio', type: 'openai', baseUrl: 'https://ejemplo.invalid/v1', apiKey: '', noKeyNeeded: false, headers: {}, free: false, responsesApi: false, note: '' };
  await f.api('PUT', '/api/config', cfg);
  let st2 = await f.api('GET', '/api/state');
  check(st2.config.providers.claude && st2.config.providers.gemini, 'si se quitan por la API, los principales vuelven');
  check(!!st2.config.providers.mio, 'los proveedores propios se conservan');
  delete st2.config.providers.mio;
  await f.api('PUT', '/api/config', st2.config);
  st2 = await f.api('GET', '/api/state');
  check(!st2.config.providers.mio, 'un proveedor propio sí se puede quitar');
  f.stop(); await sleep(500);
  // Configuración vieja a la que le falta uno: vuelve al arrancar
  const cp = path.join(d, 'config.json'); const c = JSON.parse(fs.readFileSync(cp, 'utf8'));
  delete c.providers.groq; fs.writeFileSync(cp, JSON.stringify(c));
  f = await instance(4399, d);
  check(!!(await f.api('GET', '/api/state')).config.providers.groq, 'al arrancar, un principal que faltaba vuelve');
  // Solo GET: un POST cerraría de verdad la sesión de Claude Code / Codex de este PC. 405 = la ruta existe.
  for (const r of ['/api/account/logout', '/api/cli/codex/logout']) {
    const res = await fetch('http://127.0.0.1:4399' + r);
    check(res.status === 405, `existe ${r} (GET responde ${res.status})`);
  }
  f.stop(); await sleep(300);
  fs.rmSync(d, { recursive: true, force: true });
}

if (!fs.existsSync(exe)) { bad('no existe ' + exe + ' (compila con cargo build)'); process.exit(1); }
try {
  if (scenario === 'agentes' || scenario === 'todo') await agentes();
  if (scenario === 'chat' || scenario === 'todo') await chat();
  if (scenario === 'reparto' || scenario === 'todo') await reparto();
  if (scenario === 'registro' || scenario === 'todo') await registro();
  if (scenario === 'proveedores' || scenario === 'todo') await proveedores();
} catch (e) { bad('excepción: ' + e.message); }
console.log(`[smoke] ${fails ? fails + ' fallo(s)' : 'todo bien'}`);
process.exit(fails ? 1 : 0);
