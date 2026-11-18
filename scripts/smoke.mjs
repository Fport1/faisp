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
  f.stop(); await sleep(500);

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

if (!fs.existsSync(exe)) { bad('no existe ' + exe + ' (compila con cargo build)'); process.exit(1); }
try {
  if (scenario === 'agentes' || scenario === 'todo') await agentes();
  if (scenario === 'chat' || scenario === 'todo') await chat();
} catch (e) { bad('excepción: ' + e.message); }
console.log(`[smoke] ${fails ? fails + ' fallo(s)' : 'todo bien'}`);
process.exit(fails ? 1 : 0);
