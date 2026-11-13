//! Configuración inicial: proveedores, agentes, precios. Todo editable desde la app.
//! IDs de modelo verificados en la documentación de cada proveedor (nov. 2026). Si alguno cambia,
//! en Ajustes → Proveedores → "Ver modelos" se lista lo que ofrece cada API.
use crate::store::{Agent, Budget, Config, License, Provider, Routing};
use std::collections::BTreeMap;

const FILE_FORMAT: &str = "Cuando entregues archivos completos, usa un bloque de código por archivo con la ruta relativa al proyecto:\n```json path=src/main/resources/assets/ejemplo/models/item/ejemplo.json\n...contenido completo...\n```\nSi tienes la herramienta write_file, úsala en vez de pegar el archivo. No repitas archivos enteros para cambios pequeños.";

const TOOLS_HINT: &str = "Tienes herramientas para explorar la carpeta del proyecto (list_dir, read_file, search). Úsalas para leer SOLO lo necesario antes de responder; no adivines contenido de archivos.";

fn provider(label: &str, kind: &str, base: &str, no_key: bool, free: bool, note: &str) -> Provider {
    Provider {
        label: label.into(),
        kind: kind.into(),
        base_url: base.into(),
        no_key_needed: no_key,
        api_key: if no_key { "local".into() } else { String::new() },
        free,
        note: note.into(),
        ..Default::default()
    }
}

pub fn default_providers() -> BTreeMap<String, Provider> {
    let mut p = BTreeMap::new();
    let mut cc = provider("Claude (tu suscripción)", "claude-code", "", true, true, "Usa tu cuenta de Claude (Pro/Max) a través de Claude Code instalado en este PC: consume de tu plan, no de la API. Inicia sesión en Ajustes → Cuenta. Uso personal: para distribuirlo comercialmente con login de claude.ai hace falta aprobación de Anthropic.");
    cc.api_key = String::new();
    p.insert("claude".into(), cc);
    let mut cx = provider("ChatGPT (tu suscripción)", "codex-cli", "", true, true, "Usa tu cuenta de ChatGPT a través de Codex CLI de OpenAI (codex login). Experimental. Instálalo con: npm install -g @openai/codex");
    cx.api_key = String::new();
    p.insert("chatgpt".into(), cx);
    p.insert("elevenlabs".into(), provider("ElevenLabs", "elevenlabs", "https://api.elevenlabs.io", false, false, "Voces, texto a voz, efectos y música. API key en elevenlabs.io → Developers → API Keys."));
    p.insert("anthropic".into(), provider("Anthropic (Claude)", "anthropic", "https://api.anthropic.com", false, false, "Clave en console.anthropic.com. Mejor para código y razonamiento."));
    p.insert("gemini".into(), provider("Google Gemini", "openai", "https://generativelanguage.googleapis.com/v1beta/openai", false, true, "Tier gratuito (gemini-4-hydrogen, gemini-3.8-flash). En el tier gratis Google puede usar los datos para mejorar sus productos. Clave en aistudio.google.com."));
    p.insert("groq".into(), provider("Groq", "openai", "https://api.groq.com/openai/v1", false, true, "Plan gratuito con límites de velocidad. Muy rápido (gpt-oss, Llama). Clave en console.groq.com."));
    let mut xai = provider("xAI (Grok)", "openai", "https://api.x.ai/v1", false, false, "Grok 4.7. Con búsqueda web activada usa la Responses API de xAI. Clave en console.x.ai.");
    xai.responses_api = true;
    p.insert("xai".into(), xai);
    p.insert("openrouter".into(), provider("OpenRouter", "openai", "https://openrouter.ai/api/v1", false, false, "Cientos de modelos con una sola clave. Los que acaban en :free cuentan como gratis."));
    p.insert("cerebras".into(), provider("Cerebras", "openai", "https://api.cerebras.ai/v1", false, false, "No es gratis: 5 $ de prueba (caducan a los 30 días, pide tarjeta). Muy rápido."));
    p.insert("mistral".into(), provider("Mistral", "openai", "https://api.mistral.ai/v1", false, false, "Comprueba la URL base y los IDs con \"Ver modelos\"."));
    let mut cf = provider("Cloudflare Workers AI", "openai", "https://api.cloudflare.com/client/v4/accounts/{account_id}/ai/v1", false, true, "Gratis: 10.000 neuronas al día (se reinicia a las 00:00 UTC). Necesita tu ID de cuenta y un token de API con permiso de Workers AI.");
    cf.account_id = String::new();
    p.insert("cloudflare".into(), cf);
    p.insert("ollama".into(), provider("Ollama (local)", "openai", "http://localhost:11434/v1", true, true, "Gratis y privado, en tu PC. Instala Ollama y descarga un modelo (ollama pull qwen2.5-coder)."));
    p.insert("litellm".into(), provider("LiteLLM proxy", "openai", "http://localhost:4000/v1", true, false, "Tu propio proxy LiteLLM."));
    p.insert("openai".into(), provider("OpenAI", "openai", "https://api.openai.com/v1", false, false, ""));
    p
}

#[allow(clippy::too_many_arguments)]
fn agent(id: &str, name: &str, icon: &str, color: &str, model: &str, effort: &str, desc: &str, kw: &[&str], system: String, tools: bool, fallbacks: &[&str]) -> Agent {
    Agent {
        id: id.into(),
        name: name.into(),
        icon: icon.into(),
        color: color.into(),
        model: model.into(),
        effort: effort.into(),
        description: desc.into(),
        keywords: kw.iter().map(|s| s.to_string()).collect(),
        system,
        builtin: true,
        tools,
        fallbacks: fallbacks.iter().map(|s| s.to_string()).collect(),
        ..Default::default()
    }
}

pub const OPUS: &str = "anthropic:claude-opus-5-5";

pub fn default_agents() -> Vec<Agent> {
    let mut v = vec![
        agent("orquestador", "Orquestador", "compass", "#d97757", OPUS, "medium",
            "Lee la petición, decide qué agentes intervienen y en qué orden. Barato y rápido.", &[],
            "Eres el orquestador de un equipo de IAs especializadas. Tu trabajo es planificar, no ejecutar.".into(), false,
            &["gemini:gemini-3.8-flash", "groq:openai/gpt-oss-20b", "cloudflare:@cf/meta/llama-3.3-70b-instruct-fp8-fast", "ollama:qwen2.5:7b"]),
        agent("codigo", "Programador", "code", "#6a9bcc", OPUS, "medium",
            "Código, mixins, Gradle, shaders, JSON de datos, depuración.",
            &["código", "codigo", "java", "kotlin", "rust", "mixin", "fabric", "gradle", "bug", "error", "crash", "shader", "clase", "registrar", "registro", "compila", "función", "funcion", "script", "api", "refactor", "implementa", "datapack", "receta", "loot"],
            format!("Eres el programador senior del equipo. Escribes código correcto, mínimo y coherente con el estilo del proyecto. Explicas solo lo necesario.\n{TOOLS_HINT}\n{FILE_FORMAT}"), true,
            &["anthropic:claude-sonnet-5-5", "groq:openai/gpt-oss-120b", "ollama:qwen2.5-coder"]),
        agent("modelos", "Modelador 3D", "cube", "#9b87f5", OPUS, "medium",
            "Modelos Blockbench/JSON, geometría, UV, animaciones de entidades e ítems.",
            &["modelo", "modelos", "blockbench", "bbmodel", "geo", "geometría", "geometria", "3d", "cubo", "cubos", "uv", "animación", "animacion", "pose", "hitbox", "elements"],
            format!("Eres un modelador 3D experto en Blockbench, en el formato JSON de modelos de bloque/ítem de Minecraft Java (elements, from/to, rotation, faces, uv) y en modelos de entidad. Piensa primero en volumen y silueta, después escribe coordenadas. Respeta los límites (-16..32), rotaciones permitidas (múltiplos de 22.5) y nombra los grupos.\n{TOOLS_HINT}\n{FILE_FORMAT}"), true,
            &["gemini:gemini-3.8-flash", "anthropic:claude-opus-5-5"]),
        agent("narrativa", "Narrativa", "feather", "#c2a14d", OPUS, "medium",
            "Lore, diálogos, nombres, descripciones, textos de lang, misiones.",
            &["lore", "historia", "narrativa", "diálogo", "dialogo", "texto", "textos", "lang", "nombre", "nombres", "descripción", "descripcion", "misión", "mision", "quest", "anuncio", "guion", "personaje", "tooltip"],
            format!("Eres el guionista del proyecto. Escribes con voz consistente, evocadora y concisa, respetando el lore ya establecido. Si generas archivos lang, devuelve JSON válido.\n{FILE_FORMAT}"), true,
            &["anthropic:claude-haiku-5-5", "gemini:gemini-3.8-flash", "groq:llama-3.3-70b-versatile"]),
        agent("contenido", "Diseño de contenido", "map", "#5fa37a", OPUS, "medium",
            "Biomas, dimensiones, ítems, bloques, balance, progresión, worldgen.",
            &["bioma", "biomas", "dimensión", "dimension", "worldgen", "estructura", "item", "ítem", "items", "ítems", "bloque", "bloques", "balance", "dificultad", "progresión", "progresion", "mob", "jefe", "boss", "drop", "diseño", "diseno"],
            format!("Eres diseñador de juego. Propones contenido concreto (stats, comportamiento, dónde aparece, por qué es divertido) coherente con el resto del proyecto.\n{FILE_FORMAT}"), true,
            &["gemini:gemini-4-hydrogen", "groq:openai/gpt-oss-120b"]),
        agent("investigador", "Investigador", "globe", "#3d8fb0", OPUS, "medium",
            "Busca información actual en internet: documentación, versiones, referencias, noticias, comparativas.",
            &["busca", "buscar", "investiga", "investigar", "información", "informacion", "internet", "web", "noticias", "actual", "última versión", "ultima version", "documentación", "documentacion", "referencia", "compara", "precio", "fuentes"],
            "Eres el investigador del equipo. Buscas en la web, contrastas fuentes y devuelves hechos concretos con sus enlaces. Si algo no lo puedes verificar, dilo. Resume en pocas líneas lo útil para el equipo.".into(), false,
            &["xai:grok-4.7", "gemini:gemini-3.8-flash"]),
        agent("audio", "Audio y voz", "music", "#e0678a", OPUS, "medium",
            "Voces y narración con tus voces de ElevenLabs, efectos de sonido y música; los prepara para el juego.",
            &["voz", "voces", "narración", "narracion", "narrador", "doblaje", "audio", "sonido", "sonidos", "efecto de sonido", "música", "musica", "banda sonora", "elevenlabs", "tts"],
            "Eres el diseñador de sonido del equipo. Usa las herramientas de ElevenLabs: primero lista las voces para elegir la adecuada, luego genera. Nombra los archivos de forma ordenada. Si es para Minecraft, recuerda que solo carga .ogg (mono si suena desde un punto del mundo) y registra los sonidos en sounds.json.".into(), true,
            &["anthropic:claude-sonnet-5-5"]),
        agent("revisor", "Revisor", "check", "#8a8a8a", OPUS, "medium",
            "Revisa lo que hicieron otros agentes, detecta incoherencias y resume.",
            &["revisa", "revisar", "review", "comprueba", "resume", "resumen", "audita"],
            format!("Eres el revisor. Compruebas coherencia entre lo que han hecho los demás agentes y el proyecto. Señalas problemas concretos en una lista corta.\n{TOOLS_HINT}"), true,
            &["gemini:gemini-3.8-flash", "groq:openai/gpt-oss-20b", "ollama:qwen2.5:7b"]),
    ];
    for a in v.iter_mut() {
        if a.id == "investigador" {
            a.web_search = true;
        }
        if a.id == "audio" {
            a.mcp = vec!["elevenlabs".into()];
        }
    }
    v
}

pub fn default_config() -> Config {
    let mut pricing = BTreeMap::new();
    pricing.insert("claude-opus-5-5".into(), vec![4.0, 20.0, 0.2]);
    pricing.insert("claude-sonnet-5-5".into(), vec![2.0, 10.0, 0.1]);
    pricing.insert("claude-haiku-5-5".into(), vec![0.1, 0.5, 0.01]);

    Config {
        version: 3,
        providers: default_providers(),
        agents: default_agents(),
        routing: Routing::default(),
        budget: Budget::default(),
        pricing,
        license: License::default(),
        ..Default::default()
    }
}

/// Migra configuraciones antiguas: añade proveedores y agentes nuevos sin pisar lo del usuario.
pub fn migrate(cfg: &mut Config) {
    for (id, p) in default_providers() {
        cfg.providers.entry(id).or_insert(p);
    }
    let defaults = default_agents();
    for d in &defaults {
        if !cfg.agents.iter().any(|a| a.id == d.id) {
            cfg.agents.push(d.clone());
        }
    }
    if cfg.version < 3 {
        // v3: todo Opus 5.5 con esfuerzo medio por defecto (configurable).
        for a in cfg.agents.iter_mut().filter(|a| a.builtin) {
            a.model = OPUS.into();
            a.effort = "medium".into();
            a.prefer_free = false;
        }
    }
    if cfg.version < 2 {
        // v1 usaba emojis e IDs de modelo que se retiran: actualiza solo los agentes integrados.
        for a in cfg.agents.iter_mut().filter(|a| a.builtin) {
            if let Some(d) = defaults.iter().find(|d| d.id == a.id) {
                a.icon = d.icon.clone();
                if a.fallbacks.is_empty() {
                    a.fallbacks = d.fallbacks.clone();
                }
                if a.model.contains("gemini-2.5") {
                    a.model = d.model.clone();
                }
                a.prefer_free = d.prefer_free;
                a.web_search = d.web_search;
            }
        }
        cfg.version = 2;
    }
    cfg.version = 3;
    // Cloudflare como respaldo gratuito del orquestador y el revisor
    for a in cfg.agents.iter_mut().filter(|a| a.builtin && (a.id == "orquestador" || a.id == "revisor")) {
        let cf = "cloudflare:@cf/meta/llama-3.3-70b-instruct-fp8-fast".to_string();
        if !a.fallbacks.contains(&cf) {
            let pos = a.fallbacks.iter().position(|m| m.starts_with("ollama:")).unwrap_or(a.fallbacks.len());
            a.fallbacks.insert(pos, cf);
        }
    }
    // Cerebras no tiene nivel gratuito permanente (solo créditos de prueba)
    if let Some(c) = cfg.providers.get_mut("cerebras") {
        if c.note.starts_with("Prueba gratuita") {
            c.free = false;
            c.note = "No es gratis: 5 $ de prueba (caducan a los 30 días, pide tarjeta). Muy rápido.".into();
        }
    }
}

