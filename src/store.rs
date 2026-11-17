//! Modelo de datos y persistencia local en JSON (escritura atómica, guardado diferido).
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};

pub fn now() -> String {
    chrono::Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Millis, true)
}

static COUNTER: AtomicU64 = AtomicU64::new(0);
pub fn uid(prefix: &str) -> String {
    let t = chrono::Utc::now().timestamp_micros() as u64;
    let c = COUNTER.fetch_add(1, Ordering::Relaxed);
    format!("{prefix}{:x}{:04x}", t, c & 0xffff)
}

// ---------------- Configuración ----------------

#[derive(Serialize, Deserialize, Clone, Default, Debug)]
#[serde(default, rename_all = "camelCase")]
pub struct Provider {
    pub label: String,
    #[serde(rename = "type")]
    pub kind: String, // "anthropic" | "openai" | "mock"
    pub api_key: String,
    pub base_url: String,
    /// ID de cuenta para URLs con {account_id} (p. ej. Cloudflare Workers AI)
    pub account_id: String,
    pub no_key_needed: bool,
    pub headers: BTreeMap<String, String>,
    /// Tiene uso gratuito (local o tier gratis). Usado por el modo ahorro.
    pub free: bool,
    /// Usa la Responses API (/responses) cuando el agente pide búsqueda web (p. ej. xAI Grok).
    pub responses_api: bool,
    /// Nota visible en Ajustes (límites del tier gratis, dónde sacar la clave…).
    pub note: String,
}

#[derive(Serialize, Deserialize, Clone, Default, Debug)]
#[serde(default, rename_all = "camelCase")]
pub struct Agent {
    pub id: String,
    pub name: String,
    pub icon: String,
    pub color: String,
    pub model: String,
    pub effort: String,
    pub description: String,
    pub keywords: Vec<String>,
    pub system: String,
    pub builtin: bool,
    pub disabled: bool,
    /// Puede usar herramientas sobre la carpeta del proyecto (listar, leer, buscar, escribir).
    pub tools: bool,
    pub plugin: Option<String>,
    /// Modelos alternativos, en orden, si el principal no está configurado o falla.
    pub fallbacks: Vec<String>,
    /// Búsqueda web (Claude: herramienta web_search del servidor; xAI: Responses API).
    pub web_search: bool,
    /// Probar primero los modelos gratuitos/locales de su cadena.
    pub prefer_free: bool,
    /// Servidores MCP cuyas herramientas puede usar (p. ej. "modpack-launcher").
    pub mcp: Vec<String>,
    /// Si no está vacío, solo estas herramientas MCP (nombre corto).
    pub mcp_tools: Vec<String>,
    /// Archivo cuyo contenido se añade a sus instrucciones en cada uso (p. ej. AGENTS.md del launcher).
    pub system_file: String,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(default, rename_all = "camelCase")]
pub struct Routing {
    pub planner: String,    // "llm" | "heuristic"
    pub summarizer: String, // "heuristic" | "llm"
    pub default_agent: String,
    /// Modo ahorro global: todos los agentes prueban primero lo gratuito/local.
    pub economy: bool,
    /// Usar primero tu suscripción de Claude (vía Claude Code) para los modelos claude-*.
    pub use_subscription: bool,
    /// Si se agota el límite de Claude, continuar solo cuando se reinicie
    pub auto_continue: bool,
}
impl Default for Routing {
    fn default() -> Self {
        Self { planner: "llm".into(), summarizer: "heuristic".into(), default_agent: "codigo".into(), economy: false, use_subscription: false, auto_continue: true }
    }
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(default, rename_all = "camelCase")]
pub struct Budget {
    pub history_turns: usize,
    pub blackboard_items: usize,
    pub max_file_chars: usize,
    pub max_files_per_step: usize,
    pub compress_at: usize,
    pub monthly_usd_limit: f64,
    pub max_tool_rounds: usize,
}
impl Default for Budget {
    fn default() -> Self {
        Self {
            history_turns: 6,
            blackboard_items: 12,
            max_file_chars: 24000,
            max_files_per_step: 5,
            compress_at: 9000,
            monthly_usd_limit: 0.0,
            max_tool_rounds: 12,
        }
    }
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(default, rename_all = "camelCase")]
pub struct License {
    pub plan: String, // "free" | "pro" | "team" | "self-hosted"
    pub key: String,
    pub email: String,
}
impl Default for License {
    fn default() -> Self {
        Self { plan: "self-hosted".into(), key: String::new(), email: String::new() }
    }
}

#[derive(Serialize, Deserialize, Clone, Default, Debug)]
#[serde(default, rename_all = "camelCase")]
pub struct McpServerCfg {
    pub label: String,
    pub description: String,
    pub command: String,
    pub args: Vec<String>,
    pub env: BTreeMap<String, String>,
    pub cwd: String,
    pub enabled: bool,
    /// Herramientas que se consideran de solo lectura (se usan sin pedir permiso).
    pub auto_allow: Vec<String>,
    /// De dónde se importó (p. ej. "modpack-launcher").
    pub source: String,
    /// "stdio" (por defecto) o "http" (servidor remoto, Streamable HTTP)
    pub transport: String,
    pub url: String,
    pub headers: BTreeMap<String, String>,
    /// Orden que imprime un token Bearer (p. ej. "gh auth token")
    pub token_command: String,
    /// Token fijo (API key / PAT) si el servicio lo admite
    pub token: String,
    /// client_id propio si el servicio exige un cliente OAuth registrado (p. ej. Google)
    pub oauth_client_id: String,
    pub oauth_client_secret: String,
    pub oauth_scope: String,
    pub oauth: Option<OAuthTokens>,
}

#[derive(Serialize, Deserialize, Clone, Default, Debug)]
#[serde(default, rename_all = "camelCase")]
pub struct OAuthTokens {
    pub client_id: String,
    pub token_endpoint: String,
    pub access_token: String,
    pub refresh_token: String,
    /// segundos UNIX
    pub expires_at: i64,
    pub resource: String,
}

#[derive(Serialize, Deserialize, Clone, Default, Debug)]
#[serde(default, rename_all = "camelCase")]
pub struct SkillDirCfg {
    pub path: String,
    pub label: String,
    /// Agentes que pueden usar estas skills (vacío = todos)
    pub agents: Vec<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(default, rename_all = "camelCase")]
pub struct Profile {
    pub name: String,
    pub language: String,
    /// Preferencias que se añaden a todos los agentes (como las "instrucciones personales" de Claude).
    pub instructions: String,
    /// Corrector de ortografía y gramática en el chat (LanguageTool)
    pub spellcheck: bool,
    /// auto | es | en-US | en-GB
    pub spell_lang: String,
}
impl Default for Profile {
    fn default() -> Self {
        Self { name: String::new(), language: "es".into(), instructions: String::new(), spellcheck: true, spell_lang: "auto".into() }
    }
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(default, rename_all = "camelCase")]
pub struct Defaults {
    pub model: String,
    pub effort: String,
    /// Modo de permisos por defecto: auto | manual | acceptEdits | plan | bypass
    pub mode: String,
}
impl Default for Defaults {
    fn default() -> Self {
        Self { model: "anthropic:claude-opus-5-5".into(), effort: "medium".into(), mode: "auto".into() }
    }
}

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
#[serde(default, rename_all = "camelCase")]
pub struct Config {
    pub version: u32,
    pub providers: BTreeMap<String, Provider>,
    pub agents: Vec<Agent>,
    pub routing: Routing,
    pub budget: Budget,
    /// USD por millón de tokens: [entrada, salida, lectura de caché]
    pub pricing: BTreeMap<String, Vec<f64>>,
    pub license: License,
    pub mcp_servers: BTreeMap<String, McpServerCfg>,
    /// Carpetas extra de skills (formato Claude: <carpeta>/<skill>/SKILL.md)
    pub skill_dirs: Vec<SkillDirCfg>,
    pub profile: Profile,
    pub defaults: Defaults,
    /// Carpeta de la bóveda de Obsidian conectada (vacío = sin conectar)
    pub obsidian_vault: String,
}

// ---------------- Datos ----------------

#[derive(Serialize, Deserialize, Clone, Default, Debug)]
#[serde(default, rename_all = "camelCase")]
pub struct Project {
    pub id: String,
    pub name: String,
    pub path: String,
    pub brief: String,
    pub conventions: String,
    pub summary: String,
    /// Si es false, las escrituras de los agentes quedan como propuestas (artefactos) hasta que las apliques.
    pub allow_writes: bool,
    pub color: String,
    pub created_at: String,
}

#[derive(Serialize, Deserialize, Clone, Default, Debug)]
#[serde(default, rename_all = "camelCase")]
pub struct TokenUsage {
    pub input: u64,
    pub output: u64,
    pub cache_read: u64,
    pub cache_write: u64,
}
impl TokenUsage {
    #[allow(dead_code)]
    pub fn add(&mut self, o: &TokenUsage) {
        self.input += o.input;
        self.output += o.output;
        self.cache_read += o.cache_read;
        self.cache_write += o.cache_write;
    }
}

#[derive(Serialize, Deserialize, Clone, Default, Debug)]
#[serde(default, rename_all = "camelCase")]
pub struct UsageRow {
    pub ts: String,
    pub project_id: Option<String>,
    pub chat_id: Option<String>,
    pub agent_id: String,
    pub kind: String,
    pub provider: String,
    pub model: String,
    pub demo: bool,
    #[serde(flatten)]
    pub tokens: TokenUsage,
    pub cost: f64,
}

#[derive(Serialize, Deserialize, Clone, Default, Debug)]
#[serde(default, rename_all = "camelCase")]
pub struct ToolCallLog {
    pub name: String,
    pub input: String,
    pub result: String,
}

#[derive(Serialize, Deserialize, Clone, Default, Debug)]
#[serde(default, rename_all = "camelCase")]
pub struct StepResult {
    pub id: String,
    pub agent_id: String,
    pub agent_name: String,
    pub icon: String,
    pub color: String,
    pub model: String,
    pub task: String,
    pub text: String,
    pub files: Vec<String>,
    pub skills: Vec<String>,
    pub tools: Vec<ToolCallLog>,
    pub usage: Option<UsageRow>,
    pub artifacts: Vec<String>,
    pub error: bool,
    pub effort: String,
    pub changes: Vec<FileChange>,
}

#[derive(Serialize, Deserialize, Clone, Default, Debug)]
#[serde(default, rename_all = "camelCase")]
pub struct Message {
    pub id: String,
    pub role: String,
    pub content: String,
    pub ts: String,
    pub agent_id: Option<String>,
    pub attachments: Vec<String>,
    pub steps: Vec<StepResult>,
    pub plan_usage: Option<UsageRow>,
    pub mode: String,
    pub effort: String,
}

#[derive(Serialize, Deserialize, Clone, Default, Debug)]
#[serde(default, rename_all = "camelCase")]
pub struct Chat {
    pub id: String,
    pub project_id: Option<String>,
    pub title: String,
    pub created_at: String,
    pub updated_at: String,
    pub routine_id: Option<String>,
    /// Chat lateral (no aparece en recientes)
    pub side: bool,
    /// Resumen compactado de la parte antigua de la conversación
    pub summary: String,
    /// Mensajes ya incluidos en el resumen
    pub summarized_upto: usize,
    pub chapters: Vec<Chapter>,
    /// Envío pendiente para cuando se reinicie el límite de Claude
    pub pending: Option<PendingResume>,
    pub messages: Vec<Message>,
}

#[derive(Serialize, Deserialize, Clone, Default, Debug)]
#[serde(default, rename_all = "camelCase")]
pub struct Chapter {
    pub message_id: String,
    pub title: String,
}

#[derive(Serialize, Deserialize, Clone, Default, Debug)]
#[serde(default, rename_all = "camelCase")]
pub struct PendingResume {
    pub text: String,
    pub agent_id: Option<String>,
    pub mode: String,
    pub effort: String,
    /// segundos UNIX
    pub resume_at: i64,
}

#[derive(Serialize, Deserialize, Clone, Default, Debug)]
#[serde(default, rename_all = "camelCase")]
pub struct FileChange {
    pub path: String,
    pub added: usize,
    pub removed: usize,
    pub applied: bool,
}

#[derive(Serialize, Deserialize, Clone, Default, Debug)]
#[serde(default, rename_all = "camelCase")]
pub struct Event {
    pub id: String,
    pub ts: String,
    pub project_id: Option<String>,
    pub chat_id: Option<String>,
    pub agent_id: String,
    pub agent_name: String,
    pub task: String,
    pub summary: String,
    pub compressed: bool,
}

#[derive(Serialize, Deserialize, Clone, Default, Debug)]
#[serde(default, rename_all = "camelCase")]
pub struct ArtifactVersion {
    pub ts: String,
    pub content: String,
    pub agent_id: String,
}

#[derive(Serialize, Deserialize, Clone, Default, Debug)]
#[serde(default, rename_all = "camelCase")]
pub struct Artifact {
    pub id: String,
    pub project_id: Option<String>,
    pub chat_id: Option<String>,
    pub title: String,
    pub lang: String,
    pub path: Option<String>,
    pub created_at: String,
    pub updated_at: String,
    /// Versión aplicada al disco (1-based), 0 = sin aplicar
    pub applied_version: usize,
    pub versions: Vec<ArtifactVersion>,
}

#[derive(Serialize, Deserialize, Clone, Default, Debug)]
#[serde(default, rename_all = "camelCase")]
pub struct Routine {
    pub id: String,
    pub name: String,
    pub project_id: Option<String>,
    pub agent_id: Option<String>,
    pub prompt: String,
    /// "every:<minutos>" | "daily:HH:MM" | "manual"
    pub schedule: String,
    pub enabled: bool,
    pub last_run: Option<String>,
    pub chat_id: Option<String>,
    pub plugin: Option<String>,
}

#[derive(Serialize, Deserialize, Clone, Default, Debug)]
#[serde(default, rename_all = "camelCase")]
pub struct Db {
    pub projects: Vec<Project>,
    pub chats: Vec<Chat>,
    pub events: Vec<Event>,
    pub usage: Vec<UsageRow>,
    pub artifacts: Vec<Artifact>,
    pub routines: Vec<Routine>,
}

// ---------------- Archivos ----------------

pub fn data_dir() -> PathBuf {
    if let Ok(d) = std::env::var("FAISP_DATA") {
        return PathBuf::from(d);
    }
    dirs::data_dir().unwrap_or_else(|| PathBuf::from(".")).join("faisp")
}

pub fn load_json<T: for<'de> Deserialize<'de> + Default>(path: &Path) -> Option<T> {
    let txt = std::fs::read_to_string(path).ok()?;
    serde_json::from_str(&txt).ok()
}

pub fn save_json<T: Serialize>(path: &Path, value: &T) -> anyhow::Result<()> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    let tmp = path.with_extension("json.tmp");
    std::fs::write(&tmp, serde_json::to_vec_pretty(value)?)?;
    std::fs::rename(&tmp, path)?;
    Ok(())
}
