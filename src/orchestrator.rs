//! Estado global + orquestador: planifica, reparte pasos entre agentes (en paralelo cuando no
//! dependen entre sí), mantiene la pizarra compartida y contabiliza tokens y coste.
use crate::context::*;
use crate::defaults;
use crate::extensions::{self, Extensions};
use crate::providers::{self, LlmRequest, LlmResult, Sink, ToolExec};
use crate::store::*;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, AtomicI64, Ordering};
use std::sync::{Arc, Mutex, RwLock};
use tokio::sync::mpsc::UnboundedSender;

pub type Tx = UnboundedSender<(String, Value)>;

pub struct AppState {
    pub cfg: RwLock<Config>,
    pub db: Mutex<Db>,
    pub ext: RwLock<Extensions>,
    pub http: reqwest::Client,
    pub data: PathBuf,
    pub dirty: AtomicBool,
    pub cfg_dirty: AtomicBool,
    pub last_ping: AtomicI64,
    pub mcp: crate::mcp::McpManager,
    /// Aprobaciones pendientes (modo manual, comandos…): id → respuesta
    pub approvals: Mutex<HashMap<String, tokio::sync::oneshot::Sender<bool>>>,
}

impl AppState {
    pub fn load(data: PathBuf) -> Arc<Self> {
        let _ = std::fs::create_dir_all(&data);
        let mut cfg: Config = load_json(&data.join("config.json")).unwrap_or_else(defaults::default_config);
        if cfg.providers.is_empty() {
            cfg.providers = defaults::default_config().providers;
        }
        if cfg.agents.is_empty() {
            cfg.agents = defaults::default_agents();
        }
        defaults::migrate(&mut cfg);
        crate::integrations::detect_modpack(&mut cfg);
        let mut db: Db = load_json(&data.join("db.json")).unwrap_or_default();
        seed(&mut db, &data);
        let ext = extensions::load(&data, &cfg.skill_dirs);
        let st = Arc::new(Self {
            cfg: RwLock::new(cfg),
            db: Mutex::new(db),
            ext: RwLock::new(ext),
            http: reqwest::Client::builder().connect_timeout(std::time::Duration::from_secs(20)).build().expect("http"),
            data,
            dirty: AtomicBool::new(true),
            cfg_dirty: AtomicBool::new(true),
            last_ping: AtomicI64::new(chrono::Utc::now().timestamp()),
            mcp: Default::default(),
            approvals: Default::default(),
        });
        st.flush();
        st
    }
    pub fn mark(&self) {
        self.dirty.store(true, Ordering::Relaxed);
    }
    pub fn mark_cfg(&self) {
        self.cfg_dirty.store(true, Ordering::Relaxed);
    }
    pub fn flush(&self) {
        if self.dirty.swap(false, Ordering::Relaxed) {
            let db = self.db.lock().unwrap().clone();
            if let Err(e) = save_json(&self.data.join("db.json"), &db) {
                eprintln!("error guardando db: {e}");
            }
        }
        if self.cfg_dirty.swap(false, Ordering::Relaxed) {
            let cfg = self.cfg.read().unwrap().clone();
            let _ = save_json(&self.data.join("config.json"), &cfg);
        }
    }
    pub fn all_agents(&self) -> Vec<Agent> {
        let cfg = self.cfg.read().unwrap();
        let ext = self.ext.read().unwrap();
        let mut v: Vec<Agent> = cfg.agents.clone();
        for a in &ext.agents {
            if !v.iter().any(|b| b.id == a.id) {
                v.push(a.clone());
            }
        }
        v.into_iter().filter(|a| !a.disabled).collect()
    }
    fn agent(&self, id: &str) -> Option<Agent> {
        self.all_agents().into_iter().find(|a| a.id == id)
    }
}

fn seed(db: &mut Db, data: &std::path::Path) {
    if db.projects.is_empty() {
        db.projects.push(Project { id: uid("p_"), name: "General".into(), brief: "Espacio sin carpeta para preguntas y tareas sueltas.".into(), color: "#8a8a8a".into(), created_at: now(), ..Default::default() });
    }
    // Skill de ejemplo para enseñar el formato para enseñar el formato
    let sk = data.join("skills");
    let _ = std::fs::create_dir_all(&sk);
    let ex = sk.join("ejemplo.md");
    if !ex.exists() && std::fs::read_dir(&sk).map(|mut d| d.next().is_none()).unwrap_or(true) {
        let _ = std::fs::write(&ex, "---
name: ejemplo
description: Plantilla de skill. Cópiala para crear las tuyas.
agents: 
keywords: plantilla de skill
---
Una skill son instrucciones especializadas. Solo se añaden al contexto de un agente cuando la tarea contiene alguna de sus palabras clave (o cuando el orquestador la elige), así no gastan tokens el resto del tiempo.
");
    }
}

pub fn cost_of(cfg: &Config, model: &str, u: &TokenUsage) -> f64 {
    let short = model.rsplit('/').next().unwrap_or(model);
    let Some(p) = cfg.pricing.get(model).or_else(|| cfg.pricing.get(short)) else { return 0.0 };
    let inp = p.first().copied().unwrap_or(0.0);
    let out = p.get(1).copied().unwrap_or(0.0);
    let cache = p.get(2).copied().unwrap_or(inp * 0.1);
    (u.input as f64 * inp + u.output as f64 * out + u.cache_read as f64 * cache + u.cache_write as f64 * inp * 1.25) / 1e6
}

pub fn month_spend(db: &Db) -> f64 {
    let m = chrono::Utc::now().format("%Y-%m").to_string();
    db.usage.iter().filter(|u| u.ts.starts_with(&m)).map(|u| u.cost).sum()
}

fn record_usage(st: &AppState, project_id: Option<String>, chat_id: Option<String>, agent_id: &str, kind: &str, r: &LlmResult) -> UsageRow {
    // Con la suscripción de Claude (Claude Code) no hay coste por token.
    let cost = if r.provider == "claude" { 0.0 } else { cost_of(&st.cfg.read().unwrap(), &r.model, &r.usage) };
    let row = UsageRow {
        ts: now(), project_id, chat_id, agent_id: agent_id.into(), kind: kind.into(),
        provider: r.provider.clone(), model: r.model.clone(), demo: r.demo, tokens: r.usage.clone(), cost,
    };
    let mut db = st.db.lock().unwrap();
    db.usage.push(row.clone());
    let n = db.usage.len();
    if n > 50_000 {
        db.usage.drain(..n - 50_000);
    }
    st.mark();
    row
}

fn project_header(p: &Option<Project>) -> String {
    match p {
        None => String::new(),
        Some(p) => {
            let mut s = format!("# Proyecto: {}\n{}", p.name, p.brief);
            if !p.conventions.is_empty() {
                s.push_str(&format!("\n\n## Convenciones\n{}", p.conventions));
            }
            if !p.path.is_empty() {
                s.push_str("\n\n(Tienes acceso a la carpeta del proyecto mediante herramientas si están disponibles.)");
            }
            s
        }
    }
}

fn team_text(agents: &[Agent]) -> String {
    agents.iter().filter(|a| a.id != "orquestador").map(|a| format!("- {}: {} — {}", a.id, a.name, a.description)).collect::<Vec<_>>().join("\n")
}

// ---------------- Plan ----------------

#[derive(Serialize, Deserialize, Clone, Default, Debug)]
#[serde(default, rename_all = "camelCase")]
pub struct Step {
    pub id: String,
    pub agent: String,
    pub task: String,
    pub depends_on: Vec<String>,
    pub files: Vec<String>,
    pub skills: Vec<String>,
    pub connectors: Vec<String>,
    #[serde(skip_deserializing)]
    pub attachments: Vec<String>,
}

fn heuristic_plan(st: &AppState, text: &str, forced: Option<&str>) -> Vec<Step> {
    if let Some(a) = forced {
        return vec![Step { id: "s1".into(), agent: a.into(), task: text.into(), ..Default::default() }];
    }
    let t = text.to_lowercase();
    let mut scored: Vec<(String, usize)> = st
        .all_agents()
        .into_iter()
        .filter(|a| a.id != "orquestador" && a.id != "revisor")
        .map(|a| (a.id.clone(), a.keywords.iter().filter(|k| t.contains(k.as_str())).count()))
        .filter(|(_, s)| *s > 0)
        .collect();
    scored.sort_by(|a, b| b.1.cmp(&a.1));
    let mut ids: Vec<String> = scored.into_iter().take(3).map(|x| x.0).collect();
    if ids.is_empty() {
        ids.push(st.cfg.read().unwrap().routing.default_agent.clone());
    }
    let order = ["contenido", "narrativa", "modelos", "codigo"];
    ids.sort_by_key(|id| order.iter().position(|o| o == id).unwrap_or(2));
    let n = ids.len();
    ids.iter()
        .enumerate()
        .map(|(i, a)| Step {
            id: format!("s{}", i + 1),
            agent: a.clone(),
            task: text.into(),
            depends_on: if a == "codigo" && n > 1 { (1..=n).filter(|j| *j != i + 1).map(|j| format!("s{j}")).collect() } else { vec![] },
            ..Default::default()
        })
        .collect()
}

struct NullSink;
impl Sink for NullSink {
    fn text(&self, _: &str) {}
    fn tool(&self, _: &str, _: &Value) {}
}

async fn llm_plan(st: &Arc<AppState>, project: &Option<Project>, chat: &Chat, text: &str) -> (Option<String>, Vec<Step>, Option<UsageRow>) {
    let Some(orch) = st.agent("orquestador") else { return (None, heuristic_plan(st, text, None), None) };
    let agents = st.all_agents();
    let (skills_list, conn_list) = {
        let ext = st.ext.read().unwrap();
        let s = ext.skills.iter().map(|s| format!("- {}: {}", s.id, s.description)).collect::<Vec<_>>().join("\n");
        let c = ext.connectors.iter().map(|c| format!("- {}: {}", c.id, c.description)).collect::<Vec<_>>().join("\n");
        (if s.is_empty() { "(ninguna)".into() } else { s }, if c.is_empty() { "(ninguno)".into() } else { c })
    };
    let stable = format!(
        "{}\n\n## Equipo disponible\n{}\n\n## Skills (instrucciones extra que puedes adjuntar a un paso)\n{}\n\n## Conectores (fuentes de contexto externas)\n{}\n\n## Cómo respondes\nDevuelve SOLO un objeto JSON, sin texto alrededor:\n{{\"reply\": null, \"steps\": [{{\"id\":\"s1\",\"agent\":\"<id>\",\"task\":\"<instrucción concreta y autocontenida>\",\"dependsOn\":[],\"files\":[],\"skills\":[],\"connectors\":[]}}]}}\nReglas:\n- Usa el MÍNIMO de pasos (casi siempre 1; máximo 4). Cada agente solo hace lo suyo.\n- Modelos 3D → \"modelos\"; textos/lore → \"narrativa\"; diseño de contenido → \"contenido\"; código → \"codigo\"; revisión → \"revisor\".\n- Si un paso necesita el resultado de otro, ponlo en dependsOn. Los pasos sin dependencias corren en paralelo.\n- \"files\": hasta 5 archivos del proyecto imprescindibles, elegidos del árbol (los agentes además pueden explorar con herramientas).\n- Si es un saludo o una pregunta trivial que puedes contestar en 1-3 frases, ponla en \"reply\" y \"steps\": [].",
        orch.system, team_text(&agents), skills_list, conn_list
    );
    let tree = project.as_ref().filter(|p| !p.path.is_empty()).map(|p| compact_tree(&project_tree(std::path::Path::new(&p.path), 600), 60)).unwrap_or_default();
    let bb = {
        let db = st.db.lock().unwrap();
        let evs: Vec<&Event> = db.events.iter().filter(|e| e.project_id == project.as_ref().map(|p| p.id.clone())).collect();
        blackboard_text(&evs, 8)
    };
    let mut vol = vec![project_header(project)];
    if let Some(p) = project.as_ref().filter(|p| !p.summary.is_empty()) {
        vol.push(format!("## Memoria del proyecto\n{}", p.summary));
    }
    if !tree.is_empty() {
        vol.push(format!("## Árbol del proyecto (resumido)\n{tree}"));
    }
    if !bb.is_empty() {
        vol.push(format!("## Actividad reciente\n{bb}"));
    }
    let start = chat.messages.len().saturating_sub(5);
    let recent: Vec<String> = chat.messages[start..chat.messages.len().saturating_sub(1)]
        .iter()
        .map(|m| format!("{}: {}", if m.role == "user" { "Usuario" } else { "Equipo" }, m.content.chars().take(400).collect::<String>()))
        .collect();
    let user = if recent.is_empty() { format!("Nueva petición:\n{text}") } else { format!("Conversación reciente:\n{}\n\nNueva petición:\n{text}", recent.join("\n")) };

    let cfg = st.cfg.read().unwrap().clone();
    let req = LlmRequest { model_ref: orch.model.clone(), stable, volatile: vol.join("\n\n"), messages: vec![("user".into(), user)], max_tokens: 3000, effort: orch.effort.clone(), tools: vec![], max_rounds: 0, web_search: false, ..Default::default() };
    let chain = providers::model_chain(&cfg, &orch.model, &orch.fallbacks, orch.prefer_free || cfg.routing.economy);
    let r = match providers::stream_chain(&st.http, &cfg, &chain, req, &NullSink, None).await {
        Ok((r, _)) => r,
        Err(_) => return (None, heuristic_plan(st, text, None), None),
    };
    let usage = record_usage(st, project.as_ref().map(|p| p.id.clone()), Some(chat.id.clone()), "orquestador", "plan", &r);
    if r.demo {
        return (None, heuristic_plan(st, text, None), Some(usage));
    }
    let json_txt = match (r.text.find('{'), r.text.rfind('}')) {
        (Some(a), Some(b)) if b > a => &r.text[a..=b],
        _ => "",
    };
    let parsed: Value = serde_json::from_str(json_txt).unwrap_or(Value::Null);
    let steps: Vec<Step> = serde_json::from_value::<Vec<Step>>(parsed["steps"].clone())
        .unwrap_or_default()
        .into_iter()
        .filter(|s| agents.iter().any(|a| a.id == s.agent))
        .take(4)
        .enumerate()
        .map(|(i, mut s)| {
            if s.id.is_empty() {
                s.id = format!("s{}", i + 1);
            }
            s
        })
        .collect();
    if steps.is_empty() {
        if let Some(reply) = parsed["reply"].as_str() {
            return (Some(reply.to_string()), vec![], Some(usage));
        }
        return (None, heuristic_plan(st, text, None), Some(usage));
    }
    (None, steps, Some(usage))
}

// ---------------- Paso ----------------

struct StepSink {
    tx: Tx,
    step: String,
}
impl Sink for StepSink {
    fn text(&self, t: &str) {
        let _ = self.tx.send(("delta".into(), json!({"stepId": self.step, "text": t})));
    }
    fn tool(&self, name: &str, input: &Value) {
        let mut short = input.clone();
        if let Some(c) = short.get_mut("content") {
            *c = json!(format!("({} caracteres)", c.as_str().map(|s| s.len()).unwrap_or(0)));
        }
        let _ = self.tx.send(("tool".into(), json!({"stepId": self.step, "name": name, "input": short})));
    }
}

/// Crea o versiona un artefacto. Devuelve (id, versión).
pub fn upsert_artifact(db: &mut Db, project_id: Option<String>, chat_id: Option<String>, path: Option<String>, lang: &str, title: &str, content: &str, agent_id: &str) -> (String, usize) {
    let ver = ArtifactVersion { ts: now(), content: content.into(), agent_id: agent_id.into() };
    if let Some(p) = &path {
        if let Some(a) = db.artifacts.iter_mut().find(|a| a.project_id == project_id && a.path.as_ref() == Some(p)) {
            if a.versions.last().map(|v| v.content == content).unwrap_or(false) {
                return (a.id.clone(), a.versions.len());
            }
            a.versions.push(ver);
            a.updated_at = now();
            return (a.id.clone(), a.versions.len());
        }
    }
    let id = uid("art_");
    db.artifacts.push(Artifact {
        id: id.clone(), project_id, chat_id, title: title.into(), lang: lang.into(), path,
        created_at: now(), updated_at: now(), applied_version: 0, versions: vec![ver],
    });
    (id, 1)
}

// ---------------- Permisos ----------------

/// Opciones del envío: modo de permisos y esfuerzo elegidos en el compositor.
#[derive(Clone, Default)]
pub struct RunCtx {
    pub mode: String,
    pub effort: String,
}

pub fn sanitize_mode(m: &str) -> String {
    match m {
        "manual" | "acceptEdits" | "plan" | "bypass" => m.into(),
        _ => "auto".into(),
    }
}

#[derive(PartialEq, Clone, Copy)]
enum Kind {
    Read,
    Edit,
    Exec,
}
enum Decision {
    Allow,
    Deny(&'static str),
    Ask,
    Propose,
}

/// Matriz de permisos, como los modos de Claude:
/// - auto: lee libremente; las ediciones quedan como propuestas (artefactos); comandos piden permiso.
/// - manual: todo lo que cambia algo pide permiso.
/// - acceptEdits: aplica ediciones (con copia); comandos piden permiso.
/// - plan: solo lectura; el agente devuelve un plan.
/// - bypass: todo sin preguntar.
fn decide(mode: &str, kind: Kind, allow_writes: bool) -> Decision {
    match (mode, kind) {
        (_, Kind::Read) => Decision::Allow,
        ("plan", _) => Decision::Deny("Modo plan: no se permiten cambios. Describe el plan en tu respuesta."),
        ("bypass", _) => Decision::Allow,
        ("manual", _) => Decision::Ask,
        ("acceptEdits", Kind::Edit) => Decision::Allow,
        ("auto", Kind::Edit) if allow_writes => Decision::Allow,
        ("auto", Kind::Edit) => Decision::Propose,
        _ => Decision::Ask,
    }
}

async fn ask_approval(st: &AppState, tx: &Tx, step_id: &str, tool: &str, detail: String, kind: &str) -> bool {
    if tx.is_closed() {
        return false; // sin interfaz (rutinas): se deniega
    }
    let id = uid("ap_");
    let (s, r) = tokio::sync::oneshot::channel();
    st.approvals.lock().unwrap().insert(id.clone(), s);
    let _ = tx.send(("approval".into(), json!({"id": id, "stepId": step_id, "tool": tool, "detail": detail, "kind": kind})));
    let ok = matches!(tokio::time::timeout(std::time::Duration::from_secs(900), r).await, Ok(Ok(true)));
    st.approvals.lock().unwrap().remove(&id);
    let _ = tx.send(("approval_done".into(), json!({"id": id, "allowed": ok})));
    ok
}

fn run_command_spec() -> Value {
    json!({"name":"run_command","description":"Ejecuta un comando de consola en la carpeta del proyecto (Windows: cmd /C). Útil para compilar o probar (p. ej. gradlew build). Devuelve la salida y el código de salida.","input_schema":{"type":"object","properties":{"command":{"type":"string"},"timeout_s":{"type":"integer"}},"required":["command"],"additionalProperties":false}})
}

async fn run_command(project: &Project, command: &str, timeout_s: u64) -> String {
    let mut cmd = if cfg!(windows) {
        let mut c = tokio::process::Command::new("cmd");
        c.args(["/C", command]);
        c
    } else {
        let mut c = tokio::process::Command::new("sh");
        c.args(["-c", command]);
        c
    };
    cmd.current_dir(&project.path).stdin(std::process::Stdio::null()).kill_on_drop(true);
    #[cfg(windows)]
    cmd.creation_flags(0x0800_0000);
    match tokio::time::timeout(std::time::Duration::from_secs(timeout_s), cmd.output()).await {
        Ok(Ok(o)) => {
            let mut out = String::from_utf8_lossy(&o.stdout).to_string();
            out.push_str(&String::from_utf8_lossy(&o.stderr));
            let n = out.chars().count();
            let tail: String = if n > 12000 { format!("…(recortado)\n{}", out.chars().skip(n - 12000).collect::<String>()) } else { out };
            format!("Código de salida: {}\n{}", o.status.code().unwrap_or(-1), tail)
        }
        Ok(Err(e)) => format!("No se pudo ejecutar: {e}"),
        Err(_) => format!("Tiempo agotado ({timeout_s} s)"),
    }
}

/// (servidor, herramienta, solo_lectura) por nombre expuesto al modelo
type McpMap = HashMap<String, (String, String, bool)>;

#[allow(clippy::too_many_arguments)]
fn make_tools(st: Arc<AppState>, project: Option<Project>, chat_id: String, agent_id: String, tx: Tx, step_id: String, mode: String, mcp_map: McpMap) -> ToolExec {
    let mcp_map = Arc::new(mcp_map);
    Arc::new(move |name: String, input: Value| {
        let st = st.clone();
        let project = project.clone();
        let chat_id = chat_id.clone();
        let agent_id = agent_id.clone();
        let tx = tx.clone();
        let step_id = step_id.clone();
        let mode = mode.clone();
        let mcp_map = mcp_map.clone();
        Box::pin(async move {
            let s = |k: &str| input[k].as_str().unwrap_or("").to_string();

            // --- Herramientas MCP ---
            if let Some((server, tool, read_only)) = mcp_map.get(&name).cloned() {
                let allowed = match decide(&mode, if read_only { Kind::Read } else { Kind::Exec }, false) {
                    Decision::Allow => true,
                    Decision::Deny(m) => return m.to_string(),
                    _ => ask_approval(&st, &tx, &step_id, &format!("{server} · {tool}"), serde_json::to_string(&input).unwrap_or_default().chars().take(500).collect(), "mcp").await,
                };
                if !allowed {
                    return "El usuario denegó esta acción. No intentes hacerla por otra vía.".into();
                }
                let cfg = st.cfg.read().unwrap().mcp_servers.get(&server).cloned();
                let Some(cfg) = cfg else { return format!("Servidor MCP {server} no configurado") };
                return match st.mcp.get(&server, &cfg).await {
                    Ok(c) => {
                        let (out, err) = c.call(&tool, input.clone()).await;
                        let out = truncate(&out, 30000);
                        if err { format!("Error: {out}") } else { out }
                    }
                    Err(e) => format!("El servidor MCP {server} no está disponible: {e}"),
                };
            }

            let Some(project) = project else { return "Este agente no tiene carpeta de proyecto".into() };
            let max_chars = st.cfg.read().unwrap().budget.max_file_chars;

            // --- Lectura ---
            let p2 = project.clone();
            let (name2, input2) = (name.clone(), input.clone());
            let read = tokio::task::spawn_blocking(move || match name2.as_str() {
                "list_dir" => Some(tool_list_dir(&p2, input2["path"].as_str().unwrap_or(""))),
                "read_file" => Some(tool_read_file(&p2, input2["path"].as_str().unwrap_or(""), input2["start_line"].as_u64().unwrap_or(1) as usize, input2["max_lines"].as_u64().unwrap_or(400).min(2000) as usize, max_chars)),
                "search" => Some(tool_search(&p2, input2["pattern"].as_str().unwrap_or(""), input2["under"].as_str().unwrap_or(""), input2["ext"].as_str().unwrap_or(""))),
                _ => None,
            })
            .await
            .ok()
            .flatten();
            if let Some(o) = read {
                return o;
            }

            // --- Comandos ---
            if name == "run_command" {
                let command = s("command");
                let allowed = match decide(&mode, Kind::Exec, project.allow_writes) {
                    Decision::Allow => true,
                    Decision::Deny(m) => return m.to_string(),
                    _ => ask_approval(&st, &tx, &step_id, "run_command", command.clone(), "exec").await,
                };
                if !allowed {
                    return "El usuario denegó el comando.".into();
                }
                let t = input["timeout_s"].as_u64().unwrap_or(180).clamp(5, 900);
                return run_command(&project, &command, t).await;
            }

            // --- Escritura ---
            if name == "write_file" {
                let path = s("path");
                let content = s("content");
                if path.is_empty() || safe_path(&project, &path).is_err() {
                    return "Ruta no permitida".into();
                }
                let decision = decide(&mode, Kind::Edit, project.allow_writes);
                if let Decision::Deny(m) = decision {
                    return m.to_string();
                }
                let lang = path.rsplit('.').next().unwrap_or("").to_string();
                let title = path.rsplit('/').next().unwrap_or(&path).to_string();
                let (id, ver) = {
                    let mut db = st.db.lock().unwrap();
                    upsert_artifact(&mut db, Some(project.id.clone()), Some(chat_id.clone()), Some(path.clone()), &lang, &title, &content, &agent_id)
                };
                st.mark();
                let apply = match decision {
                    Decision::Allow => true,
                    Decision::Ask => ask_approval(&st, &tx, &step_id, "write_file", format!("{path} ({} bytes)", content.len()), "edit").await,
                    _ => false,
                };
                let mut applied = false;
                let msg = if apply {
                    match write_with_backup(&project, &path, &content, &st.data.join("backups")) {
                        Ok(_) => {
                            applied = true;
                            if let Some(a) = st.db.lock().unwrap().artifacts.iter_mut().find(|a| a.id == id) {
                                a.applied_version = ver;
                            }
                            format!("Escrito {path} ({} bytes). Copia de seguridad guardada.", content.len())
                        }
                        Err(e) => format!("Error escribiendo {path}: {e}"),
                    }
                } else if matches!(decision, Decision::Ask) {
                    "El usuario denegó la escritura; quedó como propuesta en Artefactos.".into()
                } else {
                    format!("Propuesta guardada como artefacto ({path}, versión {ver}). El usuario la revisará y aplicará.")
                };
                st.mark();
                let _ = tx.send(("artifact".into(), json!({"stepId": step_id, "id": id, "title": title, "path": path, "lang": lang, "version": ver, "applied": applied})));
                return msg;
            }
            format!("Herramienta desconocida: {name}")
        })
    })
}

#[allow(clippy::too_many_arguments)]
async fn run_step(st: Arc<AppState>, step: Step, project: Option<Project>, chat: Chat, original: String, deps: Vec<(String, String, String)>, tx: Tx, ctx: RunCtx) -> StepResult {
    let Some(agent) = st.agent(&step.agent) else {
        return StepResult { id: step.id, agent_id: step.agent, text: "Agente no encontrado".into(), error: true, ..Default::default() };
    };
    let cfg = st.cfg.read().unwrap().clone();
    let b = cfg.budget.clone();
    let agents = st.all_agents();
    let mode = sanitize_mode(&ctx.mode);
    let effort = if ctx.effort.is_empty() || ctx.effort == "agent" { agent.effort.clone() } else { ctx.effort.clone() };

    // Parte estable (se cachea): instrucciones + archivo de sistema + preferencias + proyecto + equipo
    let mut stable = agent.system.clone();
    if !agent.system_file.is_empty() {
        if let Ok(t) = std::fs::read_to_string(&agent.system_file) {
            stable.push_str("\n\n");
            stable.push_str(&truncate(&t, 16000));
        }
    }
    if !cfg.profile.instructions.trim().is_empty() {
        stable.push_str(&format!("\n\n## Preferencias del usuario\n{}", cfg.profile.instructions.trim()));
    }
    stable.push_str(&format!("\n\n{}\n\n## Tu equipo (comparten una pizarra de contexto)\n{}", project_header(&project), team_text(&agents)));

    let mut parts: Vec<String> = Vec::new();
    parts.push(match mode.as_str() {
        "plan" => "## Modo plan\nNo hagas cambios. Investiga lo necesario y devuelve un plan detallado paso a paso para que el usuario lo apruebe.".into(),
        "manual" => "## Modo de permisos: manual\nCada cambio pedirá permiso al usuario.".into(),
        "acceptEdits" => "## Modo de permisos: aceptar ediciones\nTus escrituras se aplican directamente (con copia de seguridad); los comandos piden permiso.".into(),
        "bypass" => "## Modo de permisos: sin confirmaciones\nPuedes escribir y ejecutar sin pedir permiso. Sé prudente.".into(),
        _ => "## Modo de permisos: auto\nLeer es libre; tus escrituras quedan como propuestas para el usuario; los comandos piden permiso.".into(),
    });
    if let Some(p) = project.as_ref().filter(|p| !p.summary.is_empty()) {
        parts.push(format!("## Memoria del proyecto\n{}", p.summary));
    }
    let bb = {
        let db = st.db.lock().unwrap();
        let evs: Vec<&Event> = db.events.iter().filter(|e| e.project_id == project.as_ref().map(|p| p.id.clone())).collect();
        blackboard_text(&evs, b.blackboard_items)
    };
    if !bb.is_empty() {
        parts.push(format!("## Pizarra compartida (lo último que hizo el equipo)\n{bb}"));
    }
    for (id, name, text) in &deps {
        parts.push(format!("## Resultado del paso {id} ({name})\n{}", truncate(text, 14000)));
    }
    let (skills, connectors) = {
        let ext = st.ext.read().unwrap();
        (ext.pick_skills(&agent.id, &step.task, &step.skills), ext.pick_connectors(&step.task, &step.connectors))
    };
    for s in &skills {
        parts.push(format!("## Skill: {}\n{}", s.name, s.body));
    }
    let mut files: Vec<String> = step.files.iter().chain(step.attachments.iter()).cloned().collect();
    files.dedup();
    files.truncate(b.max_files_per_step);
    if let Some(p) = &project {
        for f in &files {
            if let Some(body) = read_project_file(p, f, b.max_file_chars) {
                parts.push(format!("## Archivo: {f}\n```\n{body}\n```"));
            }
        }
    }
    for c in &connectors {
        parts.push(format!("## Conector {}\n{}", c.id, extensions::run_connector(&st.http, c, 16000).await));
    }

    // Herramientas: archivos del proyecto + comandos + MCP
    let has_folder = project.as_ref().map(|p| !p.path.is_empty() && std::path::Path::new(&p.path).exists()).unwrap_or(false);
    let mut specs: Vec<Value> = Vec::new();
    if agent.tools && has_folder {
        specs.extend(tool_specs(true).into_iter().filter(|t| mode != "plan" || t["name"] != "write_file"));
        if mode != "plan" {
            specs.push(run_command_spec());
        }
    }
    let mut mcp_map: McpMap = HashMap::new();
    let mut mcp_cc: serde_json::Map<String, Value> = serde_json::Map::new();
    let mut mcp_allow: Vec<String> = Vec::new();
    for server in &agent.mcp {
        let Some(scfg) = cfg.mcp_servers.get(server).filter(|s| s.enabled).cloned() else { continue };
        mcp_cc.insert(server.clone(), json!({"command": scfg.command, "args": scfg.args, "env": scfg.env}));
        match st.mcp.get(server, &scfg).await {
            Ok(client) => {
                for t in client.tools() {
                    let tname = t["name"].as_str().unwrap_or("").to_string();
                    if !agent.mcp_tools.is_empty() && !agent.mcp_tools.contains(&tname) {
                        continue;
                    }
                    let ro = crate::mcp::is_read_only(&scfg, &t);
                    if mode == "plan" && !ro {
                        continue;
                    }
                    let exposed = crate::mcp::tool_name(server, &tname);
                    if ro {
                        mcp_allow.push(exposed.clone());
                    }
                    let desc: String = t["description"].as_str().unwrap_or("").chars().take(900).collect();
                    let schema = if t["inputSchema"].is_object() { t["inputSchema"].clone() } else { json!({"type":"object","properties":{}}) };
                    specs.push(json!({"name": exposed, "description": desc, "input_schema": schema}));
                    mcp_map.insert(exposed, (server.clone(), tname, ro));
                }
            }
            Err(e) => parts.push(format!("## Aviso\nEl servidor MCP «{}» no está disponible ahora mismo ({e}). Si es el Modpack Launcher, pide al usuario que lo abra.", scfg.label)),
        }
    }
    // Para Claude Code: mismo conjunto de servidores MCP en un .mcp.json temporal
    let mcp_config = if mcp_cc.is_empty() {
        None
    } else {
        let f = st.data.join("mcp").join(format!("{}.json", agent.id));
        let _ = std::fs::create_dir_all(f.parent().unwrap());
        std::fs::write(&f, json!({"mcpServers": mcp_cc}).to_string()).ok().map(|_| f.to_string_lossy().to_string())
    };

    // Historial reciente del chat (recortado) + tarea
    let mut msgs: Vec<(String, String)> = Vec::new();
    let hist = &chat.messages[..chat.messages.len().saturating_sub(1)];
    let start = hist.len().saturating_sub(b.history_turns * 2);
    for m in &hist[start..] {
        let role = if m.role == "user" { "user" } else { "assistant" };
        let content = if role == "user" { m.content.clone() } else { m.content.chars().take(1500).collect() };
        if content.trim().is_empty() {
            continue;
        }
        match msgs.last_mut() {
            Some(last) if last.0 == role => {
                last.1.push_str("\n\n");
                last.1.push_str(&content);
            }
            _ => msgs.push((role.into(), content)),
        }
    }
    while msgs.first().map(|m| m.0 != "user").unwrap_or(false) {
        msgs.remove(0);
    }
    let task = if step.task == original { step.task.clone() } else { format!("{}\n\n(Petición original del usuario: {original})", step.task) };
    match msgs.last_mut() {
        Some(last) if last.0 == "user" => {
            last.1.push_str("\n\n");
            last.1.push_str(&task);
        }
        _ => msgs.push(("user".into(), task)),
    }

    let use_tools = !specs.is_empty();
    let chain = providers::model_chain(&cfg, &agent.model, &agent.fallbacks, agent.prefer_free || cfg.routing.economy);
    let volatile = parts.join("\n\n");
    let est = estimate_tokens(&stable) + estimate_tokens(&volatile) + msgs.iter().map(|m| estimate_tokens(&m.1)).sum::<usize>();
    let _ = tx.send(("step_start".into(), json!({
        "stepId": step.id, "agent": agent.id, "agentName": agent.name, "icon": agent.icon, "color": agent.color, "model": agent.model, "chain": chain,
        "task": step.task, "mode": mode, "effort": effort,
        "context": {"files": files, "skills": skills.iter().map(|s| s.id.clone()).collect::<Vec<_>>(), "connectors": connectors.iter().map(|c| c.id.clone()).collect::<Vec<_>>(), "tools": use_tools, "mcp": mcp_map.len(), "estTokens": est}
    })));

    let exec = if use_tools { Some(make_tools(st.clone(), project.clone(), chat.id.clone(), agent.id.clone(), tx.clone(), step.id.clone(), mode.clone(), mcp_map)) } else { None };
    let req = LlmRequest {
        model_ref: agent.model.clone(),
        stable,
        volatile,
        messages: msgs,
        max_tokens: 32000,
        effort,
        tools: specs,
        max_rounds: if use_tools { b.max_tool_rounds } else { 0 },
        web_search: agent.web_search,
        cwd: project.as_ref().filter(|_| has_folder).map(|p| p.path.clone()),
        mode: mode.clone(),
        mcp_config,
        mcp_allow,
    };
    let sink = StepSink { tx: tx.clone(), step: step.id.clone() };
    let (r, fallback_notes) = match providers::stream_chain(&st.http, &cfg, &chain, req, &sink, exec).await {
        Ok(x) => x,
        Err(e) => {
            let _ = tx.send(("step_error".into(), json!({"stepId": step.id, "error": e.to_string()})));
            return StepResult { id: step.id, agent_id: agent.id, agent_name: agent.name, icon: agent.icon, color: agent.color, task: step.task, text: format!("Error: {e}"), error: true, ..Default::default() };
        }
    };
    let pid = project.as_ref().map(|p| p.id.clone());
    let usage = record_usage(&st, pid.clone(), Some(chat.id.clone()), &agent.id, "step", &r);
    let summary = heuristic_summary(&r.text, 420);
    let mut art_ids = Vec::new();
    {
        let mut db = st.db.lock().unwrap();
        db.events.push(Event { id: uid("ev_"), ts: now(), project_id: pid.clone(), chat_id: Some(chat.id.clone()), agent_id: agent.id.clone(), agent_name: agent.name.clone(), task: step.task.clone(), summary: summary.clone(), compressed: false });
        for a in extract_artifacts(&r.text) {
            let (id, ver) = upsert_artifact(&mut db, pid.clone(), Some(chat.id.clone()), a.path.clone(), &a.lang, &a.title, &a.content, &agent.id);
            let _ = tx.send(("artifact".into(), json!({"stepId": step.id, "id": id, "title": a.title, "path": a.path, "lang": a.lang, "version": ver, "applied": false})));
            art_ids.push(id);
        }
        st.mark();
    }
    let _ = tx.send(("step_done".into(), json!({"stepId": step.id, "usage": usage, "summary": summary, "model": r.model, "fallbacks": fallback_notes})));
    StepResult {
        id: step.id, agent_id: agent.id, agent_name: agent.name, icon: agent.icon, color: agent.color, model: r.model, task: step.task,
        text: r.text, files, skills: skills.into_iter().map(|s| s.id).collect(), tools: r.tool_log, usage: Some(usage), artifacts: art_ids, error: false,
    }
}

// ---------------- Compresión de la pizarra ----------------

async fn maybe_compress(st: &Arc<AppState>, project_id: &str) {
    let (cfg, old, summary) = {
        let db = st.db.lock().unwrap();
        let cfg = st.cfg.read().unwrap().clone();
        let evs: Vec<&Event> = db.events.iter().filter(|e| e.project_id.as_deref() == Some(project_id) && !e.compressed).collect();
        let toks: usize = evs.iter().map(|e| estimate_tokens(&e.task) + estimate_tokens(&e.summary)).sum();
        if toks < cfg.budget.compress_at || evs.len() <= cfg.budget.blackboard_items {
            return;
        }
        let old: Vec<Event> = evs[..evs.len() - cfg.budget.blackboard_items].iter().map(|e| (*e).clone()).collect();
        let summary = db.projects.iter().find(|p| p.id == project_id).map(|p| p.summary.clone()).unwrap_or_default();
        (cfg, old, summary)
    };
    let digest = old.iter().map(|e| format!("- [{}] {}", e.agent_name, e.summary)).collect::<Vec<_>>().join("\n");
    let mut new_summary = format!("{summary}\n{digest}").lines().rev().take(40).collect::<Vec<_>>().into_iter().rev().collect::<Vec<_>>().join("\n").trim().to_string();
    if cfg.routing.summarizer == "llm" {
        if let Some(rev) = st.agent("revisor") {
            let req = LlmRequest {
                model_ref: rev.model.clone(),
                stable: "Condensas el historial de trabajo de un equipo en una memoria de proyecto breve (máx. 250 palabras): decisiones tomadas, archivos creados, pendientes.".into(),
                volatile: String::new(),
                messages: vec![("user".into(), format!("Memoria actual:\n{summary}\n\nNuevos eventos:\n{digest}"))],
                max_tokens: 1500, effort: "low".into(), tools: vec![], max_rounds: 0, web_search: false, ..Default::default()
            };
            if let Ok(r) = providers::stream_chat(&st.http, &cfg, req, &NullSink, None).await {
                record_usage(st, Some(project_id.into()), None, "revisor", "compress", &r);
                if !r.demo {
                    new_summary = r.text.trim().to_string();
                }
            }
        }
    }
    let mut db = st.db.lock().unwrap();
    if let Some(p) = db.projects.iter_mut().find(|p| p.id == project_id) {
        p.summary = new_summary;
    }
    let ids: std::collections::HashSet<String> = old.into_iter().map(|e| e.id).collect();
    for e in db.events.iter_mut() {
        if ids.contains(&e.id) {
            e.compressed = true;
        }
    }
    st.mark();
}

// ---------------- Entrada principal ----------------

#[allow(clippy::too_many_arguments)]
pub async fn run_request(st: Arc<AppState>, chat_id: String, text: String, agent_id: Option<String>, attachments: Vec<String>, tx: Tx, ctx: RunCtx) -> anyhow::Result<Message> {
    let (chat, project) = {
        let mut db = st.db.lock().unwrap();
        let limit = st.cfg.read().unwrap().budget.monthly_usd_limit;
        if limit > 0.0 && month_spend(&db) >= limit {
            anyhow::bail!("Límite mensual de {limit} USD alcanzado. Cámbialo en Ajustes → Presupuesto.");
        }
        let chat = db.chats.iter_mut().find(|c| c.id == chat_id).ok_or_else(|| anyhow::anyhow!("Chat no encontrado"))?;
        chat.messages.push(Message { id: uid("m_"), role: "user".into(), content: text.clone(), ts: now(), agent_id: agent_id.clone(), attachments: attachments.clone(), mode: ctx.mode.clone(), effort: ctx.effort.clone(), ..Default::default() });
        if chat.title.is_empty() || chat.title == "Nuevo chat" {
            chat.title = text.split_whitespace().collect::<Vec<_>>().join(" ").chars().take(60).collect();
        }
        chat.updated_at = now();
        let chat = chat.clone();
        let project = db.projects.iter().find(|p| Some(&p.id) == chat.project_id.as_ref()).cloned();
        st.mark();
        (chat, project)
    };
    let _ = tx.send(("status".into(), json!({"text": if agent_id.is_some() { "Enviando al agente…" } else { "Planificando…" }})));

    let planner = st.cfg.read().unwrap().routing.planner.clone();
    let (reply, mut steps, plan_usage) = if let Some(a) = &agent_id {
        (None, heuristic_plan(&st, &text, Some(a)), None)
    } else if planner == "heuristic" {
        (None, heuristic_plan(&st, &text, None), None)
    } else {
        llm_plan(&st, &project, &chat, &text).await
    };

    let mut assistant = Message { id: uid("m_"), role: "assistant".into(), ts: now(), plan_usage: plan_usage.clone(), ..Default::default() };
    if let Some(r) = reply {
        assistant.content = r.clone();
        let _ = tx.send(("plan".into(), json!({"steps": [], "reply": r, "usage": plan_usage})));
    } else {
        for s in steps.iter_mut() {
            s.attachments = attachments.clone();
        }
        let agents = st.all_agents();
        let plan_view: Vec<Value> = steps.iter().map(|s| {
            let a = agents.iter().find(|a| a.id == s.agent);
            json!({"id": s.id, "agent": s.agent, "task": s.task, "dependsOn": s.depends_on, "agentName": a.map(|a| a.name.clone()), "icon": a.map(|a| a.icon.clone())})
        }).collect();
        let _ = tx.send(("plan".into(), json!({"steps": plan_view, "usage": plan_usage})));

        let mut outputs: HashMap<String, StepResult> = HashMap::new();
        let mut pending = steps.clone();
        let ids: Vec<String> = steps.iter().map(|s| s.id.clone()).collect();
        while !pending.is_empty() {
            let (ready, rest): (Vec<Step>, Vec<Step>) = pending.into_iter().partition(|s| s.depends_on.iter().all(|d| outputs.contains_key(d) || !ids.contains(d)));
            let (wave, rest) = if ready.is_empty() {
                let mut r = rest;
                let first = r.remove(0);
                (vec![first], r)
            } else {
                (ready, rest)
            };
            pending = rest;
            let futs = wave.iter().map(|s| {
                let deps: Vec<(String, String, String)> = s.depends_on.iter().filter_map(|d| outputs.get(d).map(|o| (d.clone(), o.agent_name.clone(), o.text.clone()))).collect();
                tokio::spawn(run_step(st.clone(), s.clone(), project.clone(), chat.clone(), text.clone(), deps, tx.clone(), ctx.clone()))
            });
            let results = futures_util::future::join_all(futs).await;
            for (s, r) in wave.iter().zip(results) {
                let r = r.unwrap_or_else(|e| StepResult { id: s.id.clone(), agent_id: s.agent.clone(), text: format!("⚠️ Error interno: {e}"), error: true, ..Default::default() });
                assistant.steps.push(r.clone());
                outputs.insert(s.id.clone(), r);
            }
        }
        assistant.content = if assistant.steps.len() == 1 {
            assistant.steps[0].text.clone()
        } else {
            assistant.steps.iter().map(|s| format!("**{}:** {}", s.agent_name, heuristic_summary(&s.text, 300))).collect::<Vec<_>>().join("\n\n")
        };
    }

    {
        let mut db = st.db.lock().unwrap();
        if let Some(c) = db.chats.iter_mut().find(|c| c.id == chat_id) {
            c.messages.push(assistant.clone());
            c.updated_at = now();
        }
        st.mark();
    }
    if let Some(p) = &project {
        maybe_compress(&st, &p.id).await;
    }
    let _ = tx.send(("done".into(), json!({"message": assistant})));
    Ok(assistant)
}
