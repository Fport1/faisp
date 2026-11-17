/* faisp — API simulada para la demo web. Intercepta fetch('/api/...') y responde desde el navegador.
   La app de escritorio usa el servidor Rust real; aquí no hay claves, ni archivos, ni llamadas a modelos. */
(() => {
  'use strict';
  const KEY = 'faisp-demo-v3';
  const now = () => new Date().toISOString();
  const uid = p => p + Math.random().toString(36).slice(2, 10);
  const sleep = ms => new Promise(r => setTimeout(r, ms));

  const PROVIDERS = {
    anthropic: { label: 'Anthropic (Claude)', type: 'anthropic', baseUrl: 'https://api.anthropic.com', apiKey: '', free: false, note: 'Mejor para código y razonamiento.' },
    gemini: { label: 'Google Gemini', type: 'openai', baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai', apiKey: '', free: true, note: 'Tier gratuito.' },
    groq: { label: 'Groq', type: 'openai', baseUrl: 'https://api.groq.com/openai/v1', apiKey: '', free: true, note: 'Plan gratuito con límites. Muy rápido.' },
    xai: { label: 'xAI (Grok)', type: 'openai', baseUrl: 'https://api.x.ai/v1', apiKey: '', free: false, responsesApi: true, note: 'Grok con búsqueda web.' },
    openrouter: { label: 'OpenRouter', type: 'openai', baseUrl: 'https://openrouter.ai/api/v1', apiKey: '', free: false, note: 'Cientos de modelos; los :free son gratis.' },
    cerebras: { label: 'Cerebras', type: 'openai', baseUrl: 'https://api.cerebras.ai/v1', apiKey: '', free: true, note: 'Prueba gratuita.' },
    ollama: { label: 'Ollama (local)', type: 'openai', baseUrl: 'http://localhost:11434/v1', apiKey: 'local', noKeyNeeded: true, free: true, note: 'Gratis y privado en tu PC (solo app de escritorio).' },
  };
  const A = (id, name, icon, color, model, description, keywords, extra = {}) => ({ id, name, icon, color, model, effort: '', description, keywords, system: '', builtin: true, tools: true, fallbacks: [], ...extra });
  const AGENTS = [
    A('orquestador', 'Orquestador', 'compass', '#d97757', 'anthropic:claude-opus-5-5', 'Planifica y reparte el trabajo.', [], { preferFree: true, fallbacks: ['gemini:gemini-3.8-flash'] }),
    A('codigo', 'Programador', 'code', '#6a9bcc', 'anthropic:claude-opus-5-5', 'Código, depuración, datos.', ['código', 'codigo', 'java', 'rust', 'bug', 'error', 'función', 'funcion', 'registra', 'registrar', 'implementa', 'api', 'script'], { fallbacks: ['anthropic:claude-sonnet-5-5', 'groq:openai/gpt-oss-120b'] }),
    A('modelos', 'Modelador 3D', 'cube', '#9b87f5', 'anthropic:claude-opus-5-5', 'Modelos Blockbench/JSON, geometría, animaciones.', ['modelo', '3d', 'blockbench', 'cubo', 'animación', 'animacion', 'uv'], { fallbacks: ['gemini:gemini-3.8-flash', 'anthropic:claude-opus-5-5'] }),
    A('narrativa', 'Narrativa', 'feather', '#c2a14d', 'anthropic:claude-opus-5-5', 'Lore, diálogos, textos, descripciones.', ['lore', 'historia', 'texto', 'descripción', 'descripcion', 'diálogo', 'dialogo', 'nombre', 'lang', 'misión', 'mision'], { fallbacks: ['gemini:gemini-3.8-flash'] }),
    A('contenido', 'Diseño de contenido', 'map', '#5fa37a', 'anthropic:claude-opus-5-5', 'Biomas, ítems, balance, progresión.', ['bioma', 'item', 'ítem', 'bloque', 'balance', 'jefe', 'boss', 'dimensión', 'dimension', 'diseña', 'disena'], { fallbacks: ['gemini:gemini-4-hydrogen'] }),
    A('investigador', 'Investigador', 'globe', '#3d8fb0', 'anthropic:claude-opus-5-5', 'Busca información actual en internet.', ['busca', 'buscar', 'investiga', 'internet', 'web', 'noticias', 'versión', 'version', 'compara', 'precio'], { webSearch: true, tools: false, fallbacks: ['anthropic:claude-sonnet-5-5'] }),
    A('revisor', 'Revisor', 'check', '#8a8a8a', 'anthropic:claude-opus-5-5', 'Revisa coherencia y resume.', ['revisa', 'revisar', 'resume', 'resumen'], { preferFree: true }),
  ];

  const CANNED = {
    modelos: 'Antes de las coordenadas, la silueta:\n\n- **Mango**: cilindro fino de 2×2 px y 12 de alto.\n- **Gancho**: tres cubos girados 22.5° que forman la curva.\n- **Rayas**: caras con UV alterno rojo/blanco.\n\n```json path=assets/demo/models/item/baston_caramelo.json\n{\n  "parent": "minecraft:item/handheld",\n  "textures": { "0": "demo:item/baston_caramelo" },\n  "elements": [\n    { "name": "mango", "from": [7, 0, 7], "to": [9, 12, 9], "faces": { "north": { "uv": [0, 0, 2, 12], "texture": "#0" } } },\n    { "name": "gancho_1", "from": [7, 12, 7], "to": [9, 14, 9], "rotation": { "angle": 22.5, "axis": "z", "origin": [8, 12, 8] }, "faces": { "north": { "uv": [2, 0, 4, 2], "texture": "#0" } } }\n  ]\n}\n```\n\nEn la app real este paso lo hace un modelo distinto de Claude (Gemini por defecto), que suele ir mejor con la geometría.',
    narrativa: '**Bastón de Caramelo de Krampus**\n\n> Forjado con el azúcar que los niños olvidaron dejar. Endulza a los aliados y quema a quien rompió la Navidad.\n\n```json path=assets/demo/lang/es_es.json\n{\n  "item.demo.baston_caramelo": "Bastón de Caramelo",\n  "item.demo.baston_caramelo.desc": "Endulza a los aliados, quema a los traidores."\n}\n```',
    codigo: 'Registro del ítem, usando lo que ya dejaron en la pizarra el Modelador y Narrativa:\n\n```java path=src/main/java/demo/item/ModItems.java\npublic final class ModItems {\n    public static final Item BASTON_CARAMELO = register("baston_caramelo",\n        new SwordItem(ToolMaterials.IRON, new Item.Settings().attributeModifiers(\n            SwordItem.createAttributeModifiers(ToolMaterials.IRON, 3, -2.4f))));\n\n    private static Item register(String id, Item item) {\n        return Registry.register(Registries.ITEM, Identifier.of("demo", id), item);\n    }\n}\n```\n\nEn la app de escritorio el Programador lee tu carpeta real con herramientas (list_dir, read_file, search) antes de escribir.',
    contenido: '**Bosque de Abetos Escarchados**\n\n| Rasgo | Valor |\n|---|---|\n| Temperatura | -0.7 (nieva siempre) |\n| Mobs | Duendes corruptos (de noche), renos |\n| Recurso único | Savia helada → pociones de resistencia al frío |\n\nEs divertido porque obliga a planificar el calor: las hogueras se vuelven puntos de control.',
    investigador: 'En la app real, **Grok** busca en la web y devuelve los hechos con sus enlaces. Si no hay clave de xAI, el siguiente modelo de la cadena (Claude, con búsqueda web) toma el relevo.\n\nAquí, en la demo, no se hacen llamadas reales.',
    revisor: '- Coherente: el nombre del lang coincide con el id del registro.\n- Falta la textura `demo:item/baston_caramelo`.\n- Recomiendo añadir la receta de crafteo.',
  };

  const load = () => { try { return JSON.parse(localStorage.getItem(KEY)); } catch { return null; } };
  const db = load() || {
    config: { version: 2, providers: PROVIDERS, agents: AGENTS, routing: { planner: 'llm', summarizer: 'heuristic', defaultAgent: 'codigo', economy: false, useSubscription: false }, defaults: { model: 'anthropic:claude-opus-5-5', effort: 'medium', mode: 'auto' }, profile: { name: '', language: 'es', instructions: '' }, mcpServers: {}, skillDirs: [], budget: { historyTurns: 6, blackboardItems: 12, maxFileChars: 24000, maxFilesPerStep: 5, compressAt: 9000, monthlyUsdLimit: 0, maxToolRounds: 12 }, pricing: { 'claude-opus-5-5': [4, 20, 0.2], 'claude-sonnet-5-5': [2, 10, 0.1], 'claude-haiku-5-5': [0.1, 0.5, 0.01] }, license: { plan: 'free', key: '', email: '' } },
    projects: [
      { id: 'p_demo', name: 'Mod navideño', path: '', brief: 'Mod de Minecraft navideño: ítems, bloques, modelos 3D, biomas y lore propios. (Proyecto de ejemplo de la demo.)', conventions: '', summary: '', allowWrites: false, color: '#6a9bcc', createdAt: now() },
      { id: 'p_gen', name: 'General', path: '', brief: 'Preguntas sueltas.', conventions: '', summary: '', allowWrites: false, color: '#8a8a8a', createdAt: now() },
    ],
    chats: [], events: [], artifacts: [], routines: [],
  };
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(db)); } catch {} };

  const json = (v, status = 200) => new Response(JSON.stringify(v), { status, headers: { 'Content-Type': 'application/json' } });
  const fail = msg => new Response(msg, { status: 400 });
  const desktopOnly = 'Disponible en la app de escritorio (Windows). La demo web no accede a tu ordenador ni usa claves.';

  function plan(text, forced) {
    if (forced && forced !== 'auto') return [{ id: 's1', agent: forced, task: text, dependsOn: [] }];
    const t = text.toLowerCase();
    let ids = AGENTS.filter(a => a.id !== 'orquestador' && a.id !== 'revisor').map(a => [a.id, a.keywords.filter(k => t.includes(k)).length]).filter(x => x[1] > 0).sort((a, b) => b[1] - a[1]).slice(0, 3).map(x => x[0]);
    if (!ids.length) ids = ['codigo'];
    const order = ['investigador', 'contenido', 'narrativa', 'modelos', 'codigo'];
    ids.sort((a, b) => order.indexOf(a) - order.indexOf(b));
    return ids.map((agent, i) => ({ id: 's' + (i + 1), agent, task: text, dependsOn: agent === 'codigo' && ids.length > 1 ? ids.filter(x => x !== 'codigo').map(x => 's' + (ids.indexOf(x) + 1)) : [] }));
  }

  function sendStream(chat, body) {
    const enc = new TextEncoder();
    return new ReadableStream({
      async start(ctrl) {
        const emit = (ev, data) => ctrl.enqueue(enc.encode(`event: ${ev}\ndata: ${JSON.stringify(data)}\n\n`));
        chat.messages.push({ id: uid('m_'), role: 'user', content: body.text, ts: now(), attachments: [] });
        if (!chat.title || chat.title === 'Nuevo chat') chat.title = body.text.slice(0, 60);
        emit('status', { text: 'Planificando…' });
        await sleep(500);
        const steps = plan(body.text, body.agentId);
        const ag = id => db.config.agents.find(a => a.id === id) || AGENTS.find(a => a.id === id);
        emit('plan', { steps: steps.map(s => ({ ...s, agentName: ag(s.agent).name, icon: ag(s.agent).icon })) });
        const out = { id: uid('m_'), role: 'assistant', content: '', steps: [], ts: now() };
        for (const s of steps) {
          const a = ag(s.agent);
          emit('step_start', { stepId: s.id, agent: a.id, agentName: a.name, icon: a.icon, color: a.color, model: a.model, task: s.task, chain: [a.model, ...(a.fallbacks || [])], context: { files: [], skills: [], tools: a.tools, estTokens: 600 + Math.round(Math.random() * 900) } });
          if (a.tools && a.id !== 'narrativa') { emit('tool', { stepId: s.id, name: 'list_dir', input: { path: 'src/main/resources/assets' } }); await sleep(250); }
          if (a.webSearch) { emit('tool', { stepId: s.id, name: 'web_search', input: { query: body.text.slice(0, 60) } }); await sleep(400); }
          const text = '*Demo web: respuesta de ejemplo, sin llamar a ningún modelo.*\n\n' + (CANNED[a.id] || CANNED.codigo);
          for (const piece of text.match(/[\s\S]{1,18}/g)) { emit('delta', { stepId: s.id, text: piece }); await sleep(14); }
          const arts = [];
          for (const m of text.matchAll(/```(\w+) path=(\S+)\n([\s\S]*?)```/g)) {
            const art = { id: uid('art_'), projectId: chat.projectId, chatId: chat.id, title: m[2].split('/').pop(), lang: m[1], path: m[2], createdAt: now(), updatedAt: now(), appliedVersion: 0, versions: [{ ts: now(), content: m[3], agentId: a.id }] };
            db.artifacts.push(art); arts.push(art.id);
            emit('artifact', { stepId: s.id, id: art.id, title: art.title, path: art.path, lang: art.lang, version: 1, applied: false });
          }
          const usage = { demo: true, input: 0, output: 0, cacheRead: 0, cost: 0, model: a.model.split(':')[1] };
          const summary = text.replace(/```[\s\S]*?```/g, ' ').replace(/[#*>`_]/g, '').replace(/\s+/g, ' ').slice(0, 300);
          db.events.push({ id: uid('ev_'), ts: now(), projectId: chat.projectId, chatId: chat.id, agentId: a.id, agentName: a.name, task: s.task, summary, compressed: false });
          emit('step_done', { stepId: s.id, usage, summary, model: a.model.split(':')[1], fallbacks: [] });
          out.steps.push({ id: s.id, agentId: a.id, agentName: a.name, icon: a.icon, color: a.color, model: a.model.split(':')[1], task: s.task, text, files: [], skills: [], tools: [], usage, artifacts: arts, error: false });
        }
        out.content = out.steps.length === 1 ? out.steps[0].text : out.steps.map(s => `**${s.agentName}:** …`).join('\n\n');
        chat.messages.push(out); chat.updatedAt = now(); save();
        emit('done', { message: out });
        ctrl.close();
      },
    });
  }

  async function route(method, path, q, body) {
    let m;
    if (path === '/api/ping') return json({ ok: true, app: 'faisp-demo' });
    if (path === '/api/state') {
      const ready = Object.fromEntries(Object.keys(db.config.providers).map(k => [k, false]));
      return json({
        config: db.config, providerReady: ready, agents: db.config.agents.filter(a => !a.disabled), projects: db.projects,
        chats: [...db.chats].filter(c => !c.side).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).map(c => ({ id: c.id, title: c.title, projectId: c.projectId, updatedAt: c.updatedAt, count: c.messages.length })),
        routines: db.routines, extensions: { plugins: [{ id: 'minecraft-modding', name: 'Minecraft modding' }], skills: 2, connectors: 0 }, monthSpend: 0, dataDir: '(este navegador)', version: '0.2.0-web',
      });
    }
    if (path === '/api/config' && method === 'PUT') { db.config = { ...body, providers: Object.fromEntries(Object.entries(body.providers).map(([k, p]) => [k, { ...p, apiKey: '' }])) }; save(); return json({ ok: true }); }
    if (path === '/api/agents' && method === 'PUT') { db.config.agents = body; save(); return json({ ok: true }); }
    if (path === '/api/pick-folder') { alert(desktopOnly); return json({ path: '' }); }
    if (path === '/api/projects' && method === 'POST') { const p = { ...body, id: uid('p_'), createdAt: now(), color: body.color || '#d97757', name: body.name || 'Proyecto' }; db.projects.push(p); save(); return json(p); }
    if ((m = path.match(/^\/api\/projects\/([^/]+)$/))) {
      if (method === 'DELETE') { db.projects = db.projects.filter(p => p.id !== m[1]); db.chats = db.chats.filter(c => c.projectId !== m[1]); save(); return json({ ok: true }); }
      const p = db.projects.find(p => p.id === m[1]); Object.assign(p, body, { path: '' }); save(); return json(p);
    }
    if ((m = path.match(/^\/api\/projects\/([^/]+)\/tree$/))) return json({ files: [], exists: false });
    if ((m = path.match(/^\/api\/projects\/([^/]+)\/open$/))) { alert(desktopOnly); return json({ ok: true }); }
    if ((m = path.match(/^\/api\/projects\/([^/]+)\/blackboard$/))) {
      if (method === 'DELETE') { db.events = db.events.filter(e => e.projectId !== m[1]); save(); return json({ ok: true }); }
      const evs = db.events.filter(e => e.projectId === m[1]);
      return json({ events: evs.slice(-80), summary: '', liveTokens: Math.round(evs.reduce((s, e) => s + e.summary.length + e.task.length, 0) / 3.6) });
    }
    if (path === '/api/terminal') return json({ out: 'La terminal funciona en la app de escritorio.', code: 1 });
    if (path.endsWith('/git')) return json({ repo: false, files: [] });
    if (path === '/api/runs') return json({ running: [], paused: [], routines: [] });
    if (path === '/api/keep-awake') return json({ on: false });
    if (path === '/api/side-chat') { let c = db.chats.find(x => x.side && x.projectId === body?.projectId); if (!c) { c = { id: uid('c_'), projectId: body?.projectId, side: true, title: 'Chat lateral', createdAt: now(), updatedAt: now(), messages: [] }; db.chats.push(c); save(); } return json(c); }
    if (path === '/api/upload' || path === '/api/file') return fail(desktopOnly);
    if ((m = path.match(/^\/api\/chats\/([^/]+)\/context$/))) { const c = db.chats.find(x => x.id === m[1]); const t = Math.round(JSON.stringify(c?.messages || []).length / 4); return json({ tokens: t, fullTokens: t, window: 1000000, messages: c?.messages.length || 0, summarized: 0, hasSummary: false, pending: null }); }
    if ((m = path.match(/^\/api\/chats\/([^/]+)\/(stop|compact|resume)$/))) return json({ ok: true });
    if ((m = path.match(/^\/api\/chats\/([^/]+)\/(fork|rewind)$/))) {
      const c = db.chats.find(x => x.id === m[1]); const i = c.messages.findIndex(x => x.id === body.messageId);
      if (m[2] === 'fork') { const n = { ...c, id: uid('c_'), title: c.title + ' (bifurcado)', messages: c.messages.slice(0, i + 1), chapters: [] }; db.chats.push(n); save(); return json(n); }
      const r = c.messages[i]; c.messages = c.messages.slice(0, i); save(); return json({ text: r?.content || '', attachments: r?.attachments || [] });
    }
    if (path === '/api/chats' && method === 'POST') { const c = { id: uid('c_'), projectId: body.projectId, title: 'Nuevo chat', createdAt: now(), updatedAt: now(), messages: [] }; db.chats.push(c); save(); return json(c); }
    if ((m = path.match(/^\/api\/chats\/([^/]+)\/send$/))) {
      const c = db.chats.find(c => c.id === m[1]);
      return new Response(sendStream(c, body), { headers: { 'Content-Type': 'text/event-stream' } });
    }
    if ((m = path.match(/^\/api\/chats\/([^/]+)$/))) {
      const c = db.chats.find(c => c.id === m[1]);
      if (method === 'DELETE') { db.chats = db.chats.filter(x => x.id !== m[1]); save(); return json({ ok: true }); }
      if (method === 'PATCH') { if (body.title) c.title = body.title; save(); return json({ ok: true }); }
      return c ? json(c) : fail('Chat no encontrado');
    }
    if (path === '/api/artifacts') return json(db.artifacts.filter(a => !q.get('projectId') || a.projectId === q.get('projectId')).map(a => ({ ...a, versions: a.versions.length, agentId: a.versions.at(-1).agentId })).reverse());
    if ((m = path.match(/^\/api\/artifacts\/([^/]+)\/apply$/))) return fail(desktopOnly);
    if ((m = path.match(/^\/api\/artifacts\/([^/]+)$/))) {
      if (method === 'DELETE') { db.artifacts = db.artifacts.filter(a => a.id !== m[1]); save(); return json({ ok: true }); }
      return json(db.artifacts.find(a => a.id === m[1]));
    }
    if (path === '/api/usage') return json({ totals: { input: 0, output: 0, cacheRead: 0, cost: 0, cacheSaved: 0, monthSpend: 0, limit: 0 }, byAgent: [], byModel: [], byProject: {}, byDay: [], recent: [] });
    if ((m = path.match(/^\/api\/providers\/([^/]+)\/models$/))) return fail(desktopOnly);
    if (path === '/api/extensions' || path === '/api/extensions/reload') return json({ dir: '(app de escritorio)', plugins: [{ id: 'minecraft-modding', name: 'Minecraft modding', version: '0.1.0', description: 'Skills para modelos Blockbench y datos de Fabric.', agents: 0, skills: 1, connectors: 0, routines: 0 }], skills: [{ id: 'lang-json', name: 'lang-json', description: 'Formato de archivos de idioma de Minecraft', agents: ['narrativa', 'codigo'], keywords: ['lang', 'traducción'], source: 'usuario' }, { id: 'minecraft-modding/blockbench-item', name: 'blockbench-item', description: 'Modelos JSON de ítem/bloque', agents: ['modelos'], keywords: ['modelo', 'blockbench'], source: 'minecraft-modding' }], connectors: [], agents: [], routines: [] });
    if (path === '/api/extensions/open') { alert(desktopOnly); return json({ ok: true }); }
    if (path === '/api/skills') return fail(desktopOnly);
    if (path === '/api/routines' && method === 'POST') { const r = { ...body, id: body.id || uid('r_') }; db.routines = db.routines.filter(x => x.id !== r.id).concat(r); save(); return json(r); }
    if ((m = path.match(/^\/api\/routines\/([^/]+)\/run$/))) return fail('Las rutinas se ejecutan en la app de escritorio.');
    if ((m = path.match(/^\/api\/routines\/([^/]+)$/))) { db.routines = db.routines.filter(r => r.id !== decodeURIComponent(m[1])); save(); return json({ ok: true }); }
    if (path === '/api/account') return json({ found: false });
    if (path === '/api/account/login' || path === '/api/account/logout') return fail(desktopOnly);
    if (path === '/api/usage/windows') { const z = { subscription: { tokens: 0, output: 0, calls: 0 }, api: { tokens: 0, cost: 0, calls: 0 } }; return json({ session: z, week: z, sessionResetsAt: null }); }
    if (path === '/api/mcp') return json({ servers: [], modpackDetected: false });
    if (path.startsWith('/api/mcp/') || path === '/api/integrations/detect') return fail(desktopOnly);
    if (path.startsWith('/api/approvals/')) return json({ ok: true });
    if (path.startsWith('/api/providers/') || path.startsWith('/api/cli/') || path === '/api/claude/limits/refresh') return fail(desktopOnly);
    if (path === '/api/claude/limits') return json(null);
    if (path === '/api/limits') return json({ claude: null, providers: {} });
    if (path === '/api/grammar') return json({ matches: [] });
    if (path === '/api/obsidian/vaults') return json({ vaults: [] });
    if (path === '/api/pick-file') { alert(desktopOnly); return json({ path: '' }); }
    return fail('Ruta no disponible en la demo: ' + path);
  }

  const realFetch = window.fetch.bind(window);
  window.fetch = async (input, init = {}) => {
    const url = new URL(typeof input === 'string' ? input : input.url, location.href);
    if (url.origin !== location.origin || !url.pathname.startsWith('/api/')) return realFetch(input, init);
    const body = init.body ? JSON.parse(init.body) : null;
    return route((init.method || 'GET').toUpperCase(), url.pathname, url.searchParams, body);
  };
})();
