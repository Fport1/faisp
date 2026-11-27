//! API HTTP local (solo 127.0.0.1) + archivos de la interfaz.
use crate::context::*;
use crate::extensions;
use crate::orchestrator::{self, month_spend, AppState};
use crate::providers::provider_ready;
use crate::store::*;
use axum::extract::{Path, Query, State};
use axum::http::{header, StatusCode};
use axum::response::sse::{Event as SseEvent, KeepAlive, Sse};
use axum::response::{IntoResponse, Response};
use axum::routing::{get, post};
use axum::{Json, Router};
use futures_util::StreamExt;
use serde::Deserialize;
use serde_json::{json, Value};
use std::collections::{BTreeMap, HashMap};
use std::convert::Infallible;
use std::sync::Arc;
use std::sync::atomic::Ordering;
use tokio_stream::wrappers::UnboundedReceiverStream;

type St = State<Arc<AppState>>;
type ApiResult = Result<Json<Value>, (StatusCode, String)>;

fn bad(e: impl std::fmt::Display) -> (StatusCode, String) {
    (StatusCode::BAD_REQUEST, e.to_string())
}

pub fn router(st: Arc<AppState>) -> Router {
    router_v3(Router::new())
        .route("/", get(|| ui("index.html")))
        .route("/app.js", get(|| ui("app.js")))
        .route("/app.css", get(|| ui("app.css")))
        .route("/logos.js", get(|| ui("logos.js")))
        .route("/icon.svg", get(|| ui("icon.svg")))
        .route("/manifest.json", get(|| ui("manifest.json")))
        .route("/studio.js", get(|| ui("studio.js")))
        .route("/vendor/three/three.module.min.js", get(|| ui("vendor/three/three.module.min.js")))
        .route("/vendor/three/addons/controls/OrbitControls.js", get(|| ui("vendor/three/addons/controls/OrbitControls.js")))
        .route("/vendor/three/addons/loaders/GLTFLoader.js", get(|| ui("vendor/three/addons/loaders/GLTFLoader.js")))
        .route("/vendor/three/addons/loaders/OBJLoader.js", get(|| ui("vendor/three/addons/loaders/OBJLoader.js")))
        .route("/vendor/three/addons/utils/BufferGeometryUtils.js", get(|| ui("vendor/three/addons/utils/BufferGeometryUtils.js")))
        .route("/icon-512.png", get(|| png(include_bytes!("../ui/icon-512.png"))))
        .route("/icon-256.png", get(|| png(include_bytes!("../ui/icon-256.png"))))
        .route("/icon-192.png", get(|| png(include_bytes!("../ui/icon-192.png"))))
        .route("/vendor/marked.js", get(|| ui("vendor/marked.js")))
        .route("/vendor/purify.js", get(|| ui("vendor/purify.js")))
        .route("/api/ping", post(ping))
        .route("/api/state", get(state))
        .route("/api/config", axum::routing::put(put_config))
        .route("/api/agents", axum::routing::put(put_agents))
        .route("/api/projects", post(create_project))
        .route("/api/projects/{id}", axum::routing::patch(patch_project).delete(delete_project))
        .route("/api/projects/{id}/tree", get(project_tree_api))
        .route("/api/projects/{id}/file", get(project_file))
        .route("/api/projects/{id}/blackboard", get(blackboard).delete(clear_blackboard))
        .route("/api/projects/{id}/open", post(open_project_folder))
        .route("/api/pick-folder", post(pick_folder))
        .route("/api/chats", post(create_chat))
        .route("/api/chats/{id}", get(get_chat).patch(patch_chat).delete(delete_chat))
        .route("/api/chats/{id}/send", post(send))
        .route("/api/artifacts", get(list_artifacts))
        .route("/api/artifacts/{id}", get(get_artifact).delete(delete_artifact))
        .route("/api/artifacts/{id}/apply", post(apply_artifact))
        .route("/api/usage", get(usage))
        .route("/api/providers/{id}/models", get(provider_models))
        .route("/api/extensions", get(get_extensions))
        .route("/api/extensions/reload", post(reload_extensions))
        .route("/api/extensions/open", post(open_ext_folder))
        .route("/api/skills", post(save_skill))
        .route("/api/routines", post(create_routine))
        .route("/api/routines/{id}", axum::routing::patch(patch_routine).delete(delete_routine))
        .route("/api/routines/{id}/run", post(run_routine))
        .with_state(st)
}

// ---------------- UI ----------------

async fn ui(name: &'static str) -> Response {
    let ctype = match name.rsplit('.').next() {
        Some("html") => "text/html; charset=utf-8",
        Some("js") => "text/javascript; charset=utf-8",
        Some("css") => "text/css; charset=utf-8",
        Some("svg") => "image/svg+xml",
        Some("json") => "application/manifest+json",
        _ => "application/octet-stream",
    };
    // En desarrollo: FAISP_UI_DIR=ui sirve desde disco (recarga sin recompilar).
    if let Ok(dir) = std::env::var("FAISP_UI_DIR") {
        if let Ok(b) = std::fs::read(std::path::Path::new(&dir).join(name)) {
            return ([(header::CONTENT_TYPE, ctype), (header::CACHE_CONTROL, "no-store")], b).into_response();
        }
    }
    let body: &'static str = match name {
        "index.html" => include_str!("../ui/index.html"),
        "app.js" => include_str!("../ui/app.js"),
        "app.css" => include_str!("../ui/app.css"),
        "logos.js" => include_str!("../ui/logos.js"),
        "icon.svg" => include_str!("../ui/icon.svg"),
        "manifest.json" => include_str!("../ui/manifest.json"),
        "vendor/marked.js" => include_str!("../ui/vendor/marked.js"),
        "vendor/purify.js" => include_str!("../ui/vendor/purify.js"),
        "studio.js" => include_str!("../ui/studio.js"),
        "m.html" => include_str!("../ui/m.html"),
        "m.js" => include_str!("../ui/m.js"),
        "m.css" => include_str!("../ui/m.css"),
        "m-manifest.json" => include_str!("../ui/m-manifest.json"),
        "vendor/three/three.module.min.js" => include_str!("../ui/vendor/three/three.module.min.js"),
        "vendor/three/addons/controls/OrbitControls.js" => include_str!("../ui/vendor/three/addons/controls/OrbitControls.js"),
        "vendor/three/addons/loaders/GLTFLoader.js" => include_str!("../ui/vendor/three/addons/loaders/GLTFLoader.js"),
        "vendor/three/addons/loaders/OBJLoader.js" => include_str!("../ui/vendor/three/addons/loaders/OBJLoader.js"),
        "vendor/three/addons/utils/BufferGeometryUtils.js" => include_str!("../ui/vendor/three/addons/utils/BufferGeometryUtils.js"),
        _ => return StatusCode::NOT_FOUND.into_response(),
    };
    ([(header::CONTENT_TYPE, ctype)], body).into_response()
}

async fn png(b: &'static [u8]) -> Response {
    ([(header::CONTENT_TYPE, "image/png"), (header::CACHE_CONTROL, "max-age=86400")], b).into_response()
}

async fn ping(State(st): St) -> Json<Value> {
    st.last_ping.store(chrono::Utc::now().timestamp(), Ordering::Relaxed);
    Json(json!({"ok": true, "app": "faisp"}))
}

// ---------------- Estado / configuración ----------------

fn mask(k: &str) -> String {
    if k.is_empty() {
        String::new()
    } else if k.len() <= 8 {
        "••••".into()
    } else {
        format!("••••{}", &k[k.len() - 4..])
    }
}

async fn state(State(st): St) -> Json<Value> {
    let cfg = st.cfg.read().unwrap().clone();
    let mut pub_cfg = cfg.clone();
    for p in pub_cfg.providers.values_mut() {
        if !p.no_key_needed {
            p.api_key = mask(&p.api_key);
        }
    }
    let mut ready: BTreeMap<String, bool> = BTreeMap::new();
    for (k, p) in &cfg.providers {
        // Los locales (Ollama, LiteLLM) solo cuentan si responden de verdad
        let ok = if p.no_key_needed && p.kind == "openai" { crate::providers::usable(&st.http, &cfg, &format!("{k}:x")).await } else { provider_ready(&cfg, k) };
        ready.insert(k.clone(), ok);
    }
    let agents = st.all_agents();
    let db = st.db.lock().unwrap();
    let chats: Vec<Value> = {
        let mut c: Vec<&Chat> = db.chats.iter().collect();
        c.sort_by(|a, b| b.updated_at.cmp(&a.updated_at));
        c.iter().filter(|c| !c.side).map(|c| json!({"id": c.id, "title": c.title, "projectId": c.project_id, "updatedAt": c.updated_at, "routineId": c.routine_id, "count": c.messages.len(), "pending": c.pending.as_ref().map(|p| p.resume_at)})).collect()
    };
    let ext = st.ext.read().unwrap();
    let mut routines = db.routines.clone();
    for r in &ext.routines {
        if !routines.iter().any(|x| x.id == r.id) {
            let mut r = r.clone();
            r.enabled = false;
            routines.push(r);
        }
    }
    Json(json!({
        "config": pub_cfg,
        "providerReady": ready,
        "builtinProviders": crate::defaults::default_providers().keys().collect::<Vec<_>>(),
        "agents": agents,
        "projects": db.projects,
        "chats": chats,
        "routines": routines,
        "extensions": {"plugins": ext.plugins, "skills": ext.skills.len(), "connectors": ext.connectors.len()},
        "monthSpend": month_spend(&db),
        "dataDir": st.data.to_string_lossy(),
        "version": env!("CARGO_PKG_VERSION"),
        "os": std::env::consts::OS,
    }))
}

async fn put_config(State(st): St, Json(mut new): Json<Config>) -> ApiResult {
    let mut cfg = st.cfg.write().unwrap();
    for (id, p) in new.providers.iter_mut() {
        if p.api_key.starts_with("••") {
            p.api_key = cfg.providers.get(id).map(|o| o.api_key.clone()).unwrap_or_default();
        }
    }
    if new.agents.is_empty() {
        new.agents = cfg.agents.clone();
    }
    // Los proveedores principales no se pueden quitar: si faltan, vuelven (con lo que tenían)
    for (id, p) in crate::defaults::default_providers() {
        if !new.providers.contains_key(&id) {
            new.providers.insert(id.clone(), cfg.providers.get(&id).cloned().unwrap_or(p));
        }
    }
    *cfg = new;
    st.mark_cfg();
    Ok(Json(json!({"ok": true})))
}

async fn put_agents(State(st): St, Json(agents): Json<Vec<Agent>>) -> ApiResult {
    st.cfg.write().unwrap().agents = agents.into_iter().filter(|a| a.plugin.is_none()).collect();
    st.mark_cfg();
    Ok(Json(json!({"ok": true})))
}

// ---------------- Proyectos ----------------

async fn create_project(State(st): St, Json(mut p): Json<Project>) -> ApiResult {
    p.id = uid("p_");
    p.created_at = now();
    if p.name.trim().is_empty() {
        p.name = std::path::Path::new(&p.path).file_name().map(|s| s.to_string_lossy().to_string()).unwrap_or("Proyecto".into());
    }
    if p.color.is_empty() {
        p.color = "#d97757".into();
    }
    st.db.lock().unwrap().projects.push(p.clone());
    st.mark();
    Ok(Json(json!(p)))
}

async fn patch_project(State(st): St, Path(id): Path<String>, Json(v): Json<Value>) -> ApiResult {
    let mut db = st.db.lock().unwrap();
    let p = db.projects.iter_mut().find(|p| p.id == id).ok_or_else(|| bad("no existe"))?;
    let mut cur = serde_json::to_value(&*p).unwrap();
    if let (Some(c), Some(n)) = (cur.as_object_mut(), v.as_object()) {
        for (k, val) in n {
            if k != "id" {
                c.insert(k.clone(), val.clone());
            }
        }
    }
    *p = serde_json::from_value(cur).map_err(bad)?;
    let out = json!(*p);
    st.mark();
    Ok(Json(out))
}

async fn delete_project(State(st): St, Path(id): Path<String>) -> ApiResult {
    let mut db = st.db.lock().unwrap();
    db.projects.retain(|p| p.id != id);
    db.chats.retain(|c| c.project_id.as_deref() != Some(&id));
    db.events.retain(|e| e.project_id.as_deref() != Some(&id));
    db.artifacts.retain(|a| a.project_id.as_deref() != Some(&id));
    st.mark();
    Ok(Json(json!({"ok": true})))
}

fn find_project(st: &AppState, id: &str) -> Result<Project, (StatusCode, String)> {
    st.db.lock().unwrap().projects.iter().find(|p| p.id == id).cloned().ok_or_else(|| (StatusCode::NOT_FOUND, "Proyecto no encontrado".into()))
}

async fn project_tree_api(State(st): St, Path(id): Path<String>) -> ApiResult {
    let p = find_project(&st, &id)?;
    if p.path.is_empty() {
        return Ok(Json(json!({"files": [], "exists": false})));
    }
    let exists = std::path::Path::new(&p.path).exists();
    let files = tokio::task::spawn_blocking(move || project_tree(std::path::Path::new(&p.path), 3000)).await.unwrap_or_default();
    Ok(Json(json!({"files": files, "exists": exists})))
}

#[derive(Deserialize)]
struct PathQ {
    path: String,
}
async fn project_file(State(st): St, Path(id): Path<String>, Query(q): Query<PathQ>) -> ApiResult {
    let p = find_project(&st, &id)?;
    let txt = read_project_file(&p, &q.path, 400_000).ok_or_else(|| bad("No se pudo leer"))?;
    Ok(Json(json!({"path": q.path, "content": txt})))
}

async fn blackboard(State(st): St, Path(id): Path<String>) -> ApiResult {
    let db = st.db.lock().unwrap();
    let evs: Vec<&Event> = db.events.iter().filter(|e| e.project_id.as_deref() == Some(&id)).collect();
    let start = evs.len().saturating_sub(80);
    let summary = db.projects.iter().find(|p| p.id == id).map(|p| p.summary.clone()).unwrap_or_default();
    let toks: usize = evs.iter().filter(|e| !e.compressed).map(|e| estimate_tokens(&e.summary) + estimate_tokens(&e.task)).sum();
    Ok(Json(json!({"events": &evs[start..], "summary": summary, "liveTokens": toks})))
}

async fn clear_blackboard(State(st): St, Path(id): Path<String>) -> ApiResult {
    let mut db = st.db.lock().unwrap();
    db.events.retain(|e| e.project_id.as_deref() != Some(&id));
    if let Some(p) = db.projects.iter_mut().find(|p| p.id == id) {
        p.summary.clear();
    }
    st.mark();
    Ok(Json(json!({"ok": true})))
}

fn hidden(cmd: &mut tokio::process::Command) {
    #[cfg(windows)]
    cmd.creation_flags(0x0800_0000);
    let _ = cmd;
}

async fn open_project_folder(State(st): St, Path(id): Path<String>) -> ApiResult {
    let p = find_project(&st, &id)?;
    open_path(&p.path);
    Ok(Json(json!({"ok": true})))
}

pub fn open_path(path: &str) {
    #[cfg(windows)]
    let _ = std::process::Command::new("explorer").arg(path).spawn();
    #[cfg(target_os = "macos")]
    let _ = std::process::Command::new("open").arg(path).spawn();
    #[cfg(all(unix, not(target_os = "macos")))]
    let _ = std::process::Command::new("xdg-open").arg(path).spawn();
}

async fn pick_folder() -> ApiResult {
    #[cfg(windows)]
    {
        let script = "[Console]::OutputEncoding=[Text.Encoding]::UTF8; Add-Type -AssemblyName System.Windows.Forms; $o=New-Object System.Windows.Forms.Form -Property @{TopMost=$true}; $f=New-Object System.Windows.Forms.FolderBrowserDialog; $f.Description='Carpeta del proyecto'; $f.ShowNewFolderButton=$true; if($f.ShowDialog($o) -eq 'OK'){ $f.SelectedPath }";
        let mut cmd = tokio::process::Command::new("powershell");
        cmd.args(["-NoProfile", "-STA", "-Command", script]);
        hidden(&mut cmd);
        let out = cmd.output().await.map_err(bad)?;
        let path = String::from_utf8_lossy(&out.stdout).trim().to_string();
        return Ok(Json(json!({"path": path})));
    }
    #[cfg(not(windows))]
    {
        let path = unix_pick(true).await;
        return Ok(Json(json!({"path": path})));
    }
    #[allow(unreachable_code)]
    Ok(Json(json!({"path": ""})))
}

/// Diálogo nativo para elegir carpeta o archivo en macOS y Linux. Cadena vacía si se cancela.
#[cfg(not(windows))]
async fn unix_pick(folder: bool) -> String {
    let run = |prog: &str, args: Vec<String>| {
        let mut c = tokio::process::Command::new(prog);
        c.args(args);
        c
    };
    let mut tries = Vec::new();
    if cfg!(target_os = "macos") {
        let what = if folder { r#"choose folder with prompt "Carpeta del proyecto""# } else { r#"choose file with prompt "Adjuntar archivo""# };
        tries.push(run("osascript", vec!["-e".into(), format!("POSIX path of ({what})")]));
    } else {
        tries.push(run("zenity", if folder { vec!["--file-selection".into(), "--directory".into(), "--title=Carpeta del proyecto".into()] } else { vec!["--file-selection".into(), "--title=Adjuntar archivo".into()] }));
        tries.push(run("kdialog", if folder { vec!["--getexistingdirectory".into(), ".".into()] } else { vec!["--getopenfilename".into(), ".".into()] }));
    }
    for mut c in tries {
        if let Ok(o) = c.output().await {
            let p = String::from_utf8_lossy(&o.stdout).trim().trim_end_matches('/').to_string();
            if o.status.success() { return p; }
        }
    }
    String::new()
}

// ---------------- Chats ----------------

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct NewChat {
    project_id: Option<String>,
}
async fn create_chat(State(st): St, Json(b): Json<NewChat>) -> ApiResult {
    let c = Chat { id: uid("c_"), project_id: b.project_id, title: "Nuevo chat".into(), created_at: now(), updated_at: now(), ..Default::default() };
    st.db.lock().unwrap().chats.push(c.clone());
    st.mark();
    Ok(Json(json!(c)))
}

async fn get_chat(State(st): St, Path(id): Path<String>) -> ApiResult {
    let db = st.db.lock().unwrap();
    let c = db.chats.iter().find(|c| c.id == id).ok_or_else(|| (StatusCode::NOT_FOUND, "Chat no encontrado".into()))?;
    Ok(Json(json!(c)))
}

async fn patch_chat(State(st): St, Path(id): Path<String>, Json(v): Json<Value>) -> ApiResult {
    let mut db = st.db.lock().unwrap();
    let c = db.chats.iter_mut().find(|c| c.id == id).ok_or_else(|| bad("no existe"))?;
    if let Some(t) = v["title"].as_str() {
        c.title = t.into();
    }
    if v.get("projectId").is_some() {
        c.project_id = v["projectId"].as_str().map(String::from);
    }
    if let Some(ch) = v.get("chapters") {
        if let Ok(list) = serde_json::from_value::<Vec<Chapter>>(ch.clone()) { c.chapters = list; }
    }
    st.mark();
    Ok(Json(json!({"ok": true})))
}

async fn delete_chat(State(st): St, Path(id): Path<String>) -> ApiResult {
    st.db.lock().unwrap().chats.retain(|c| c.id != id);
    st.mark();
    Ok(Json(json!({"ok": true})))
}

#[derive(Deserialize, Default)]
#[serde(default, rename_all = "camelCase")]
struct SendBody {
    text: String,
    agent_id: Option<String>,
    attachments: Vec<String>,
    mode: String,
    effort: String,
}

async fn send(State(st): St, Path(id): Path<String>, Json(b): Json<SendBody>) -> Sse<impl futures_util::Stream<Item = Result<SseEvent, Infallible>>> {
    let agent = b.agent_id.filter(|a| !a.is_empty() && a != "auto");
    let rx = orchestrator::spawn_run(st, id, b.text, agent, b.attachments, orchestrator::RunCtx { mode: b.mode, effort: b.effort });
    let stream = UnboundedReceiverStream::new(rx).map(|(ev, data)| Ok(SseEvent::default().event(ev).data(data.to_string())));
    Sse::new(stream).keep_alive(KeepAlive::default())
}

/// Volver a un chat que está trabajando: repite lo ocurrido y sigue en directo.
async fn chat_live(State(st): St, Path(id): Path<String>) -> Sse<impl futures_util::Stream<Item = Result<SseEvent, Infallible>>> {
    let rx = orchestrator::subscribe(&st, &id).unwrap_or_else(|| {
        let (tx, rx) = tokio::sync::mpsc::unbounded_channel();
        let _ = tx.send(("idle".to_string(), json!({})));
        rx
    });
    let stream = UnboundedReceiverStream::new(rx).map(|(ev, data)| Ok(SseEvent::default().event(ev).data(data.to_string())));
    Sse::new(stream).keep_alive(KeepAlive::default())
}

// ---------------- Terminal y git (paneles como Claude Code) ----------------

fn hidden_cmd(prog: &str) -> std::process::Command {
    #[allow(unused_mut)]
    let mut c = std::process::Command::new(prog);
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        c.creation_flags(0x0800_0000);
    }
    c
}

fn git(dir: &str, args: &[&str]) -> Option<String> {
    let o = hidden_cmd("git").args(["-c", "core.quotepath=off"]).args(args).current_dir(dir).output().ok()?;
    o.status.success().then(|| String::from_utf8_lossy(&o.stdout).to_string())
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct TermBody {
    project_id: Option<String>,
    command: String,
    cwd: Option<String>,
}
async fn terminal_run(State(st): St, headers: axum::http::HeaderMap, Json(b): Json<TermBody>) -> ApiResult {
    if headers.get("x-faisp").is_none() {
        return Err((StatusCode::FORBIDDEN, "no".into()));
    }
    let base = b.project_id.as_deref().and_then(|id| find_project(&st, id).ok()).map(|p| p.path).filter(|p| !p.is_empty()).or_else(|| dirs::home_dir().map(|h| h.to_string_lossy().to_string())).unwrap_or_else(|| ".".into());
    let cwd = b.cwd.filter(|c| std::path::Path::new(c).is_dir()).unwrap_or(base);
    let cmd = b.command.trim().to_string();
    if let Some(rest) = cmd.strip_prefix("cd ").or_else(|| (cmd == "cd").then_some("")) {
        let rest = rest.trim().trim_matches('"');
        let target = if rest.is_empty() { std::path::PathBuf::from(&cwd) } else { std::path::Path::new(&cwd).join(rest) };
        return match std::fs::canonicalize(&target) {
            Ok(p) => Ok(Json(json!({"cwd": p.to_string_lossy().trim_start_matches(r"\\?\").to_string(), "out": "", "code": 0}))),
            Err(_) => Ok(Json(json!({"cwd": cwd, "out": format!("No existe la carpeta: {rest}"), "code": 1}))),
        };
    }
    let cwd2 = cwd.clone();
    let res = tokio::time::timeout(std::time::Duration::from_secs(600), tokio::task::spawn_blocking(move || {
        if cfg!(windows) {
            hidden_cmd("cmd").args(["/D", "/S", "/C", &format!("chcp 65001>nul & {cmd}")]).current_dir(&cwd2).stdin(std::process::Stdio::null()).output()
        } else {
            let sh = std::env::var("SHELL").unwrap_or_else(|_| "/bin/sh".into());
            hidden_cmd(&sh).args(["-c", &cmd]).current_dir(&cwd2).stdin(std::process::Stdio::null()).output()
        }
    })).await;
    let (out, code) = match res {
        Ok(Ok(Ok(o))) => {
            let mut s = String::from_utf8_lossy(&o.stdout).to_string();
            let e = String::from_utf8_lossy(&o.stderr);
            if !e.trim().is_empty() { s.push_str(&e); }
            (s, o.status.code().unwrap_or(-1))
        }
        Ok(Ok(Err(e))) => (format!("No se pudo ejecutar: {e}"), -1),
        Ok(Err(e)) => (format!("Error: {e}"), -1),
        Err(_) => ("Se cortó a los 10 minutos.".into(), -1),
    };
    let max = 200_000;
    let out = if out.len() > max { format!("…(recortado)\n{}", &out[out.len() - max..].chars().collect::<String>()) } else { out };
    Ok(Json(json!({"cwd": cwd, "out": out, "code": code})))
}

async fn project_git(State(st): St, Path(id): Path<String>) -> ApiResult {
    let p = find_project(&st, &id)?;
    if p.path.is_empty() || !std::path::Path::new(&p.path).join(".git").exists() {
        return Ok(Json(json!({"repo": false, "files": []})));
    }
    let dir = p.path.clone();
    let v = tokio::task::spawn_blocking(move || {
        let branch = git(&dir, &["rev-parse", "--abbrev-ref", "HEAD"]).unwrap_or_default().trim().to_string();
        let mut counts: HashMap<String, (i64, i64)> = HashMap::new();
        let numstat = git(&dir, &["diff", "--numstat", "HEAD"]).or_else(|| git(&dir, &["diff", "--numstat"])).unwrap_or_default();
        for l in numstat.lines() {
            let parts: Vec<&str> = l.splitn(3, '\t').collect();
            if parts.len() == 3 {
                counts.insert(parts[2].to_string(), (parts[0].parse().unwrap_or(0), parts[1].parse().unwrap_or(0)));
            }
        }
        let status = git(&dir, &["status", "--porcelain=v1", "-uall"]).unwrap_or_default();
        let mut files = Vec::new();
        for l in status.lines().take(500) {
            if l.len() < 4 { continue; }
            let st_code = l[..2].trim().to_string();
            let mut path = l[3..].trim().trim_matches('"').to_string();
            if let Some((_, to)) = path.split_once(" -> ") { path = to.to_string(); }
            let (a, r) = if st_code == "??" {
                let n = std::fs::read_to_string(std::path::Path::new(&dir).join(&path)).map(|s| s.lines().count() as i64).unwrap_or(0);
                (n, 0)
            } else {
                counts.get(&path).copied().unwrap_or((0, 0))
            };
            files.push(json!({"path": path, "status": st_code, "added": a, "removed": r}));
        }
        json!({"repo": true, "branch": branch, "files": files})
    }).await.unwrap_or(json!({"repo": false, "files": []}));
    Ok(Json(v))
}

async fn project_git_diff(State(st): St, Path(id): Path<String>, Query(q): Query<PathQ>) -> ApiResult {
    let p = find_project(&st, &id)?;
    let dir = p.path.clone();
    let path = q.path.clone();
    if path.contains("..") {
        return Err(bad("Ruta no válida"));
    }
    let diff = tokio::task::spawn_blocking(move || {
        git(&dir, &["diff", "HEAD", "--", &path]).filter(|s| !s.is_empty()).or_else(|| git(&dir, &["diff", "--", &path]).filter(|s| !s.is_empty())).unwrap_or_else(|| {
            std::fs::read_to_string(std::path::Path::new(&dir).join(&path)).map(|s| s.lines().take(3000).map(|l| format!("+{l}")).collect::<Vec<_>>().join("\n")).unwrap_or_default()
        })
    }).await.unwrap_or_default();
    Ok(Json(json!({"path": q.path, "diff": diff})))
}

// ---------------- Recursos de Minecraft para el Estudio (texturas y modelos padre) ----------------

fn find_asset(root: &std::path::Path, suffix: &str) -> Option<std::path::PathBuf> {
    for base in ["src/main/resources", "common/src/main/resources", "fabric/src/main/resources", "src/client/resources", "resources", ""] {
        let p = root.join(base).join(suffix);
        if p.is_file() {
            return Some(p);
        }
    }
    fn walk(dir: &std::path::Path, suffix: &str, depth: usize, seen: &mut usize) -> Option<std::path::PathBuf> {
        if depth > 9 || *seen > 40_000 { return None; }
        for e in std::fs::read_dir(dir).ok()?.flatten() {
            *seen += 1;
            let name = e.file_name().to_string_lossy().to_string();
            if name.starts_with('.') || crate::context::IGNORE.contains(&name.as_str()) { continue; }
            let p = e.path();
            if p.is_dir() {
                if name == "assets" {
                    let c = p.parent()?.join(suffix);
                    if c.is_file() { return Some(c); }
                }
                if let Some(f) = walk(&p, suffix, depth + 1, seen) { return Some(f); }
            }
        }
        None
    }
    walk(root, suffix, 0, &mut 0)
}

#[derive(Deserialize)]
struct AssetQ {
    kind: String,
    #[serde(rename = "ref")]
    reference: String,
}
async fn project_asset(State(st): St, Path(id): Path<String>, Query(q): Query<AssetQ>) -> Response {
    let Ok(p) = find_project(&st, &id) else { return StatusCode::NOT_FOUND.into_response() };
    let (ns, path) = q.reference.split_once(':').unwrap_or(("minecraft", q.reference.as_str()));
    if path.contains("..") || ns.contains("..") || !(q.kind == "textures" || q.kind == "models") {
        return StatusCode::BAD_REQUEST.into_response();
    }
    let ext = if q.kind == "textures" { "png" } else { "json" };
    let suffix = format!("assets/{ns}/{}/{path}.{ext}", q.kind);
    let root = std::path::PathBuf::from(&p.path);
    match tokio::task::spawn_blocking(move || find_asset(&root, &suffix)).await.ok().flatten().and_then(|f| std::fs::read(f).ok()) {
        Some(b) => ([(header::CONTENT_TYPE, if ext == "png" { "image/png" } else { "application/json" }), (header::CACHE_CONTROL, "no-store")], b).into_response(),
        None => StatusCode::NOT_FOUND.into_response(),
    }
}

// ---------------- Actualizaciones (descarga pública en faisp.vercel.app) ----------------

const UPDATE_BASE: &str = "https://faisp.vercel.app/descargar";

fn ver_tuple(v: &str) -> (u64, u64, u64) {
    let p: Vec<u64> = v.trim().trim_start_matches('v').split(['.', '-', '+']).take(3).map(|x| x.parse().unwrap_or(0)).collect();
    (p.first().copied().unwrap_or(0), p.get(1).copied().unwrap_or(0), p.get(2).copied().unwrap_or(0))
}

async fn fetch_latest(st: &AppState) -> Result<Value, (StatusCode, String)> {
    let r = st.http.get(format!("{UPDATE_BASE}/version.json?t={}", chrono::Utc::now().timestamp())).timeout(std::time::Duration::from_secs(15)).send().await.map_err(|e| bad(format!("No se pudo consultar: {e}")))?;
    if !r.status().is_success() {
        return Err(bad(format!("No se pudo consultar ({})", r.status())));
    }
    r.json::<Value>().await.map_err(|e| bad(format!("Respuesta no válida: {e}")))
}

async fn update_check(State(st): St) -> ApiResult {
    let v = fetch_latest(&st).await?;
    let latest = v["version"].as_str().unwrap_or("0.0.0").to_string();
    let cur = env!("CARGO_PKG_VERSION");
    Ok(Json(json!({"current": cur, "latest": latest, "available": ver_tuple(&latest) > ver_tuple(cur), "notes": v["notes"], "date": v["date"], "channel": v["channel"], "size": v["size"]})))
}

/// Descarga la versión nueva, comprueba su huella SHA-256, la descomprime y lanza su Instalar.cmd
/// (que cierra faisp, copia los archivos y la vuelve a abrir). Los datos del usuario no se tocan.
async fn update_install(State(st): St, headers: axum::http::HeaderMap) -> ApiResult {
    if headers.get("x-faisp").is_none() {
        return Err((StatusCode::FORBIDDEN, "no".into()));
    }
    if !cfg!(windows) {
        return Err(bad("Las actualizaciones automáticas son solo para Windows por ahora"));
    }
    let v = fetch_latest(&st).await?;
    let want = v["sha256"].as_str().unwrap_or("").to_lowercase();
    let latest = v["version"].as_str().unwrap_or("");
    if ver_tuple(latest) <= ver_tuple(env!("CARGO_PKG_VERSION")) {
        return Err(bad("Ya tienes la última versión"));
    }
    let bytes = st.http.get(format!("{UPDATE_BASE}/faisp-windows.zip?v={latest}")).timeout(std::time::Duration::from_secs(600)).send().await.map_err(|e| bad(format!("No se pudo descargar: {e}")))?.bytes().await.map_err(|e| bad(format!("Descarga cortada: {e}")))?;
    let got: String = {
        use sha2::{Digest, Sha256};
        Sha256::digest(&bytes).iter().map(|b| format!("{b:02x}")).collect()
    };
    if want.is_empty() || got != want {
        return Err(bad("La descarga no coincide con la publicada; inténtalo de nuevo más tarde"));
    }
    let dir = std::env::temp_dir().join("faisp-update");
    let dir2 = dir.clone();
    tokio::task::spawn_blocking(move || -> anyhow::Result<()> {
        let _ = std::fs::remove_dir_all(&dir2);
        std::fs::create_dir_all(&dir2)?;
        let mut zip = zip::ZipArchive::new(std::io::Cursor::new(bytes))?;
        for i in 0..zip.len() {
            let mut f = zip.by_index(i)?;
            let Some(name) = f.enclosed_name() else { continue };
            let out = dir2.join(name);
            if f.is_dir() {
                std::fs::create_dir_all(&out)?;
            } else {
                if let Some(p) = out.parent() { std::fs::create_dir_all(p)?; }
                let mut w = std::fs::File::create(&out)?;
                std::io::copy(&mut f, &mut w)?;
            }
        }
        Ok(())
    }).await.map_err(|e| bad(e.to_string()))?.map_err(|e| bad(format!("No se pudo descomprimir: {e}")))?;
    let inst = dir.join("faisp").join("Instalar.cmd");
    if !inst.is_file() {
        return Err(bad("El paquete no trae Instalar.cmd"));
    }
    let mut c = std::process::Command::new("cmd");
    c.arg("/C").arg(&inst).arg("/actualizar").current_dir(dir.join("faisp"));
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        // Consola propia y grupo propio: sigue viva cuando el instalador cierra faisp
        c.creation_flags(0x0000_0010 | 0x0000_0200);
    }
    c.spawn().map_err(|e| bad(format!("No se pudo lanzar el instalador: {e}")))?;
    Ok(Json(json!({"ok": true, "version": latest})))
}

// ---------------- Acceso desde el móvil ----------------

fn remote_info(st: &AppState) -> Value {
    let c = st.cfg.read().unwrap().remote.clone();
    let port = if c.port == 0 { 4320 } else { c.port };
    let ip = crate::remote::lan_ip();
    let url = ip.as_ref().map(|ip| format!("http://{ip}:{port}/?t={}", c.token));
    json!({"enabled": c.enabled, "running": crate::remote::running(), "port": port, "ip": ip, "url": url})
}
async fn remote_get(State(st): St) -> Json<Value> {
    Json(remote_info(&st))
}
#[derive(Deserialize, Default)]
#[serde(default, rename_all = "camelCase")]
struct RemoteBody {
    enabled: Option<bool>,
    new_token: bool,
}
async fn remote_set(State(st): St, headers: axum::http::HeaderMap, Json(b): Json<RemoteBody>) -> ApiResult {
    if headers.get("x-faisp").is_none() {
        return Err((StatusCode::FORBIDDEN, "no".into()));
    }
    {
        let mut c = st.cfg.write().unwrap();
        if let Some(e) = b.enabled { c.remote.enabled = e; }
        if b.new_token || c.remote.token.len() < 16 { c.remote.token = crate::remote::new_token(); }
        if c.remote.port == 0 { c.remote.port = 4320; }
    }
    st.mark_cfg();
    crate::remote::apply(st.clone()).await.map_err(|e| bad(format!("No se pudo abrir el puerto en la red local: {e}")))?;
    Ok(Json(remote_info(&st)))
}
async fn remote_qr(State(st): St) -> Response {
    let Some(url) = remote_info(&st)["url"].as_str().map(String::from) else { return StatusCode::NOT_FOUND.into_response() };
    match qrcode::QrCode::new(url.as_bytes()) {
        Ok(q) => ([(header::CONTENT_TYPE, "image/svg+xml"), (header::CACHE_CONTROL, "no-store")], q.render::<qrcode::render::svg::Color>().min_dimensions(220, 220).quiet_zone(true).build()).into_response(),
        Err(_) => StatusCode::INTERNAL_SERVER_ERROR.into_response(),
    }
}

// ---------------- Artefactos ----------------

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ArtQ {
    project_id: Option<String>,
    chat_id: Option<String>,
}
async fn list_artifacts(State(st): St, Query(q): Query<ArtQ>) -> ApiResult {
    let db = st.db.lock().unwrap();
    let mut list: Vec<Value> = db
        .artifacts
        .iter()
        .filter(|a| q.project_id.is_none() || a.project_id == q.project_id)
        .filter(|a| q.chat_id.is_none() || a.chat_id == q.chat_id)
        .map(|a| json!({"id": a.id, "title": a.title, "path": a.path, "lang": a.lang, "projectId": a.project_id, "chatId": a.chat_id, "updatedAt": a.updated_at, "versions": a.versions.len(), "appliedVersion": a.applied_version, "agentId": a.versions.last().map(|v| v.agent_id.clone())}))
        .collect();
    list.sort_by(|a, b| b["updatedAt"].as_str().cmp(&a["updatedAt"].as_str()));
    Ok(Json(json!(list)))
}

async fn get_artifact(State(st): St, Path(id): Path<String>) -> ApiResult {
    let db = st.db.lock().unwrap();
    let a = db.artifacts.iter().find(|a| a.id == id).ok_or_else(|| (StatusCode::NOT_FOUND, "no existe".into()))?;
    Ok(Json(json!(a)))
}

async fn delete_artifact(State(st): St, Path(id): Path<String>) -> ApiResult {
    st.db.lock().unwrap().artifacts.retain(|a| a.id != id);
    st.mark();
    Ok(Json(json!({"ok": true})))
}

#[derive(Deserialize, Default)]
#[serde(default)]
struct ApplyBody {
    version: usize,
    path: Option<String>,
}
async fn apply_artifact(State(st): St, Path(id): Path<String>, Json(b): Json<ApplyBody>) -> ApiResult {
    let (art, project) = {
        let db = st.db.lock().unwrap();
        let a = db.artifacts.iter().find(|a| a.id == id).cloned().ok_or_else(|| bad("no existe"))?;
        let p = db.projects.iter().find(|p| Some(&p.id) == a.project_id.as_ref()).cloned().ok_or_else(|| bad("El artefacto no pertenece a un proyecto con carpeta"))?;
        (a, p)
    };
    let path = b.path.or(art.path.clone()).ok_or_else(|| bad("Falta la ruta de destino"))?;
    let v = if b.version == 0 { art.versions.len() } else { b.version };
    let content = &art.versions.get(v - 1).ok_or_else(|| bad("versión inválida"))?.content;
    write_with_backup(&project, &path, content, &st.data.join("backups")).map_err(bad)?;
    let mut db = st.db.lock().unwrap();
    if let Some(a) = db.artifacts.iter_mut().find(|a| a.id == id) {
        a.applied_version = v;
        a.path = Some(path.clone());
    }
    st.mark();
    Ok(Json(json!({"ok": true, "path": path, "version": v})))
}

// ---------------- Uso de tokens ----------------

async fn usage(State(st): St) -> ApiResult {
    let db = st.db.lock().unwrap();
    let cfg = st.cfg.read().unwrap();
    let mut by_agent: HashMap<String, (u64, u64, u64, f64, usize)> = HashMap::new();
    let mut by_model: HashMap<String, (u64, u64, u64, f64, usize)> = HashMap::new();
    let mut by_project: HashMap<String, f64> = HashMap::new();
    let mut by_day: BTreeMap<String, (u64, f64)> = BTreeMap::new();
    let (mut tin, mut tout, mut tcache, mut tcost, mut saved) = (0u64, 0u64, 0u64, 0f64, 0f64);
    let cutoff = (chrono::Utc::now() - chrono::Duration::days(30)).to_rfc3339();
    for u in db.usage.iter().filter(|u| u.ts >= cutoff) {
        let t = &u.tokens;
        for (map, key) in [(&mut by_agent, u.agent_id.clone()), (&mut by_model, u.model.clone())] {
            let e = map.entry(key).or_default();
            e.0 += t.input;
            e.1 += t.output;
            e.2 += t.cache_read;
            e.3 += u.cost;
            e.4 += 1;
        }
        *by_project.entry(u.project_id.clone().unwrap_or_default()).or_default() += u.cost;
        let d = by_day.entry(u.ts[..10].to_string()).or_default();
        d.0 += t.input + t.output + t.cache_read;
        d.1 += u.cost;
        tin += t.input;
        tout += t.output;
        tcache += t.cache_read;
        tcost += u.cost;
        let short = u.model.rsplit('/').next().unwrap_or(&u.model);
        if let Some(p) = cfg.pricing.get(&u.model).or_else(|| cfg.pricing.get(short)) {
            let inp = p.first().copied().unwrap_or(0.0);
            let c = p.get(2).copied().unwrap_or(inp * 0.1);
            saved += t.cache_read as f64 * (inp - c) / 1e6;
        }
    }
    let rows = |m: HashMap<String, (u64, u64, u64, f64, usize)>| -> Vec<Value> {
        let mut v: Vec<Value> = m.into_iter().map(|(k, (i, o, c, cost, n))| json!({"key": k, "input": i, "output": o, "cacheRead": c, "cost": cost, "calls": n})).collect();
        v.sort_by(|a, b| b["cost"].as_f64().partial_cmp(&a["cost"].as_f64()).unwrap_or(std::cmp::Ordering::Equal));
        v
    };
    let recent: Vec<&UsageRow> = db.usage.iter().rev().take(60).collect();
    Ok(Json(json!({
        "totals": {"input": tin, "output": tout, "cacheRead": tcache, "cost": tcost, "cacheSaved": saved, "monthSpend": month_spend(&db), "limit": cfg.budget.monthly_usd_limit},
        "byAgent": rows(by_agent), "byModel": rows(by_model),
        "byProject": by_project, "byDay": by_day.into_iter().map(|(d, (t, c))| json!({"day": d, "tokens": t, "cost": c})).collect::<Vec<_>>(),
        "recent": recent,
    })))
}

async fn provider_models(State(st): St, Path(id): Path<String>) -> ApiResult {
    let cfg = st.cfg.read().unwrap().clone();
    let models = crate::providers::list_models(&st.http, &cfg, &id).await.map_err(bad)?;
    Ok(Json(json!({"models": models})))
}

// ---------------- Extensiones ----------------

async fn get_extensions(State(st): St) -> Json<Value> {
    let ext = st.ext.read().unwrap();
    Json(json!({"plugins": ext.plugins, "skills": ext.skills, "connectors": ext.connectors, "agents": ext.agents, "routines": ext.routines, "dir": st.data.to_string_lossy()}))
}

async fn reload_extensions(State(st): St) -> Json<Value> {
    *st.ext.write().unwrap() = extensions::load(&st.data, &st.cfg.read().unwrap().skill_dirs.clone());
    get_extensions(State(st)).await
}

#[derive(Deserialize, Default)]
#[serde(default)]
struct OpenExt {
    which: String,
}
async fn open_ext_folder(State(st): St, Json(b): Json<OpenExt>) -> Json<Value> {
    let p = st.data.join(if b.which == "skills" { "skills" } else { "plugins" });
    let _ = std::fs::create_dir_all(&p);
    open_path(&p.to_string_lossy());
    Json(json!({"ok": true}))
}

#[derive(Deserialize, Default)]
#[serde(default)]
struct SkillBody {
    name: String,
    description: String,
    agents: String,
    keywords: String,
    body: String,
}
async fn save_skill(State(st): St, Json(b): Json<SkillBody>) -> ApiResult {
    let slug: String = b.name.to_lowercase().chars().map(|c| if c.is_alphanumeric() { c } else { '-' }).collect::<String>().trim_matches('-').to_string();
    if slug.is_empty() {
        return Err(bad("Nombre inválido"));
    }
    let f = st.data.join("skills").join(format!("{slug}.md"));
    let txt = format!("---\nname: {slug}\ndescription: {}\nagents: {}\nkeywords: {}\n---\n{}\n", b.description.replace('\n', " "), b.agents, b.keywords, b.body);
    std::fs::write(&f, txt).map_err(bad)?;
    *st.ext.write().unwrap() = extensions::load(&st.data, &st.cfg.read().unwrap().skill_dirs.clone());
    Ok(Json(json!({"ok": true, "file": f.to_string_lossy()})))
}

// ---------------- Rutinas ----------------

async fn create_routine(State(st): St, Json(mut r): Json<Routine>) -> ApiResult {
    if r.id.is_empty() || !r.id.contains('/') {
        r.id = uid("r_");
    }
    if r.schedule.is_empty() {
        r.schedule = "manual".into();
    }
    let mut db = st.db.lock().unwrap();
    db.routines.retain(|x| x.id != r.id);
    db.routines.push(r.clone());
    st.mark();
    Ok(Json(json!(r)))
}

async fn patch_routine(State(st): St, Path(id): Path<String>, Json(v): Json<Value>) -> ApiResult {
    let mut db = st.db.lock().unwrap();
    let r = db.routines.iter_mut().find(|r| r.id == id).ok_or_else(|| bad("no existe"))?;
    let mut cur = serde_json::to_value(&*r).unwrap();
    if let (Some(c), Some(n)) = (cur.as_object_mut(), v.as_object()) {
        for (k, val) in n {
            if k != "id" {
                c.insert(k.clone(), val.clone());
            }
        }
    }
    *r = serde_json::from_value(cur).map_err(bad)?;
    st.mark();
    Ok(Json(json!(*r)))
}

async fn delete_routine(State(st): St, Path(id): Path<String>) -> ApiResult {
    st.db.lock().unwrap().routines.retain(|r| r.id != id);
    st.mark();
    Ok(Json(json!({"ok": true})))
}

async fn run_routine(State(st): St, Path(id): Path<String>) -> ApiResult {
    let chat_id = crate::routines::run_now(st, &id).await.map_err(bad)?;
    Ok(Json(json!({"ok": true, "chatId": chat_id})))
}

// ---------------- Aprobaciones (modos de permisos) ----------------

#[derive(Deserialize, Default)]
#[serde(default)]
struct ApprovalBody {
    allow: bool,
}
async fn approve(State(st): St, Path(id): Path<String>, Json(b): Json<ApprovalBody>) -> ApiResult {
    let tx = st.approvals.lock().unwrap().remove(&id);
    match tx {
        Some(tx) => {
            let _ = tx.send(b.allow);
            Ok(Json(json!({"ok": true})))
        }
        None => Err((StatusCode::NOT_FOUND, "Esa petición ya no está pendiente".into())),
    }
}

// ---------------- Cuenta de Claude (vía Claude Code) ----------------

fn claude_exe(st: &AppState) -> Option<std::path::PathBuf> {
    let configured = st.cfg.read().unwrap().providers.get("claude").map(|p| p.base_url.clone()).unwrap_or_default();
    crate::integrations::find_claude_code(&configured)
}

async fn account(State(st): St) -> ApiResult {
    let Some(exe) = claude_exe(&st) else {
        return Ok(Json(json!({"found": false})));
    };
    let mut cmd = tokio::process::Command::new(&exe);
    cmd.args(["auth", "status"]).kill_on_drop(true);
    hidden(&mut cmd);
    let out = tokio::time::timeout(std::time::Duration::from_secs(20), cmd.output()).await;
    let status: Value = match out {
        Ok(Ok(o)) => serde_json::from_slice(&o.stdout).unwrap_or_else(|_| json!({"raw": String::from_utf8_lossy(&o.stdout).chars().take(400).collect::<String>()})),
        _ => json!({"error": "No respondió"}),
    };
    let expired = status["loginExpiresAt"].as_str().and_then(|t| chrono::DateTime::parse_from_rfc3339(t).ok()).map(|t| t < chrono::Utc::now()).unwrap_or(false);
    let sub = st.cfg.read().unwrap().routing.use_subscription;
    Ok(Json(json!({"found": true, "path": exe.to_string_lossy(), "status": status, "expired": expired, "useSubscription": sub})))
}

async fn account_login(State(st): St) -> ApiResult {
    let exe = claude_exe(&st).ok_or_else(|| bad("No encuentro Claude Code en este PC"))?;
    // Abre una consola visible con el inicio de sesión oficial de Claude Code (navegador + código).
    #[cfg(windows)]
    {
        std::process::Command::new("cmd").args(["/C", "start", "Iniciar sesión en Claude", &exe.to_string_lossy(), "auth", "login"]).spawn().map_err(bad)?;
    }
    #[cfg(not(windows))]
    {
        std::process::Command::new(&exe).args(["auth", "login"]).spawn().map_err(bad)?;
    }
    Ok(Json(json!({"ok": true})))
}

async fn account_logout(State(st): St) -> ApiResult {
    let exe = claude_exe(&st).ok_or_else(|| bad("No encuentro Claude Code"))?;
    let mut cmd = tokio::process::Command::new(&exe);
    cmd.args(["auth", "logout"]).kill_on_drop(true);
    hidden(&mut cmd);
    let _ = tokio::time::timeout(std::time::Duration::from_secs(20), cmd.output()).await;
    Ok(Json(json!({"ok": true})))
}

// ---------------- Servidores MCP ----------------

async fn mcp_list(State(st): St) -> ApiResult {
    let servers = st.cfg.read().unwrap().mcp_servers.clone();
    let status = st.mcp.status().await;
    let list: Vec<Value> = servers
        .iter()
        .map(|(k, s)| {
            let (alive, tools) = status.get(k).cloned().unwrap_or((false, 0));
            json!({"name": k, "label": s.label, "description": s.description, "command": s.command, "enabled": s.enabled, "source": s.source, "running": alive, "tools": tools, "autoAllow": s.auto_allow.len()})
        })
        .collect();
    Ok(Json(json!({"servers": list, "modpackDetected": crate::integrations::modpack_dir().is_some()})))
}

async fn mcp_test(State(st): St, Path(name): Path<String>) -> ApiResult {
    let cfg = st.cfg.read().unwrap().mcp_servers.get(&name).cloned().ok_or_else(|| bad("No existe"))?;
    st.mcp.stop(&name).await;
    let (c, _) = st.mcp.get(&st.http, &name, &cfg).await.map_err(bad)?;
    let tools: Vec<Value> = c.tools().iter().map(|t| json!({"name": t["name"], "description": t["description"].as_str().unwrap_or("").chars().take(160).collect::<String>(), "readOnly": crate::mcp::is_read_only(&cfg, t)})).collect();
    Ok(Json(json!({"server": c.server_info(), "tools": tools})))
}

#[derive(Deserialize, Default)]
#[serde(default)]
struct ImportBody {
    path: String,
}
async fn mcp_import(State(st): St, Json(b): Json<ImportBody>) -> ApiResult {
    let servers = crate::integrations::read_mcp_json(std::path::Path::new(&b.path)).map_err(bad)?;
    let n = servers.len();
    {
        let mut cfg = st.cfg.write().unwrap();
        for (k, v) in servers {
            cfg.mcp_servers.insert(k, v);
        }
    }
    st.mark_cfg();
    Ok(Json(json!({"ok": true, "imported": n})))
}

async fn detect_integrations(State(st): St) -> ApiResult {
    let changed = {
        let mut cfg = st.cfg.write().unwrap();
        crate::integrations::detect_modpack(&mut cfg)
    };
    if changed {
        st.mark_cfg();
        let dirs = st.cfg.read().unwrap().skill_dirs.clone();
        *st.ext.write().unwrap() = extensions::load(&st.data, &dirs);
    }
    Ok(Json(json!({"changed": changed, "modpack": crate::integrations::modpack_dir().is_some()})))
}

// ---------------- Ventanas de uso (como "Uso" en Claude) ----------------

async fn usage_windows(State(st): St) -> ApiResult {
    let db = st.db.lock().unwrap();
    let now = chrono::Utc::now();
    let since = |h: i64| (now - chrono::Duration::hours(h)).to_rfc3339();
    let (h5, d7) = (since(5), since(24 * 7));
    let mut out = json!({});
    for (key, from) in [("session", &h5), ("week", &d7)] {
        let mut sub = (0u64, 0u64, 0usize); // tokens, salida, llamadas — suscripción de Claude
        let mut api = (0u64, 0f64, 0usize); // tokens, coste, llamadas — APIs
        for u in db.usage.iter().filter(|u| &u.ts >= from && !u.demo) {
            let t = u.tokens.input + u.tokens.output + u.tokens.cache_read + u.tokens.cache_write;
            if u.provider == "claude" {
                sub.0 += t;
                sub.1 += u.tokens.output;
                sub.2 += 1;
            } else {
                api.0 += t;
                api.1 += u.cost;
                api.2 += 1;
            }
        }
        out[key] = json!({"subscription": {"tokens": sub.0, "output": sub.1, "calls": sub.2}, "api": {"tokens": api.0, "cost": api.1, "calls": api.2}});
    }
    // La ventana de 5 h empieza con la primera petición dentro de ella (como el reinicio de sesión de Claude).
    let first = db.usage.iter().filter(|u| u.ts >= h5 && u.provider == "claude" && !u.demo).map(|u| u.ts.clone()).min();
    out["sessionResetsAt"] = json!(first.and_then(|t| chrono::DateTime::parse_from_rfc3339(&t).ok()).map(|t| (t + chrono::Duration::hours(5)).to_rfc3339()));
    Ok(Json(out))
}

pub fn router_v3(r: Router<Arc<AppState>>) -> Router<Arc<AppState>> {
    r.route("/api/approvals/{id}", post(approve))
        .route("/api/account", get(account))
        .route("/api/account/login", post(account_login))
        .route("/api/account/logout", post(account_logout))
        .route("/api/mcp", get(mcp_list))
        .route("/api/mcp/{name}/test", post(mcp_test))
        .route("/api/mcp/import", post(mcp_import))
        .route("/api/integrations/detect", post(detect_integrations))
        .route("/api/usage/windows", get(usage_windows))
        .route("/api/providers/{id}/test", post(provider_test))
        .route("/api/mcp/{name}/connect", post(mcp_connect))
        .route("/api/mcp/{name}/disconnect", post(mcp_disconnect))
        .route("/oauth/callback", get(oauth_callback))
        .route("/api/cli/codex/status", get(codex_status))
        .route("/api/claude/limits", get(claude_limits_get))
        .route("/api/limits", get(all_limits))
        .route("/api/window/open", post(window_open))
        .route("/api/pick-file", post(pick_file))
        .route("/api/grammar", post(grammar))
        .route("/api/obsidian/vaults", get(obsidian_vaults))
        .route("/mcp/{token}", post(mcp_bridge))
        .route("/api/chats/{id}/stop", post(chat_stop))
        .route("/api/chats/{id}/live", get(chat_live))
        .route("/api/terminal", post(terminal_run))
        .route("/api/remote", get(remote_get).post(remote_set))
        .route("/api/remote/qr.svg", get(remote_qr))
        .route("/m", get(|| ui("m.html")))
        .route("/m.js", get(|| ui("m.js")))
        .route("/m.css", get(|| ui("m.css")))
        .route("/m-manifest.json", get(|| ui("m-manifest.json")))
        .route("/apple-touch-icon.png", get(|| png(include_bytes!("../ui/apple-touch-icon.png"))))
        .route("/api/update/check", get(update_check))
        .route("/api/update/install", post(update_install))
        .route("/api/projects/{id}/git", get(project_git))
        .route("/api/projects/{id}/asset", get(project_asset))
        .route("/api/projects/{id}/git/diff", get(project_git_diff))
        .route("/api/chats/{id}/fork", post(chat_fork))
        .route("/api/chats/{id}/rewind", post(chat_rewind))
        .route("/api/chats/{id}/compact", post(chat_compact))
        .route("/api/chats/{id}/context", get(chat_context))
        .route("/api/chats/{id}/resume", post(chat_resume_cancel))
        .route("/api/side-chat", post(side_chat))
        .route("/api/runs", get(runs))
        .route("/api/upload", post(upload))
        .route("/api/file", get(serve_file))
        .route("/api/keep-awake", get(keep_awake_get).post(keep_awake_set))
        .route("/api/providers/{id}/key", get(provider_key))
        .route("/api/claude/limits/refresh", post(claude_limits_refresh))
        .route("/api/cli/codex/login", post(codex_login))
        .route("/api/cli/codex/logout", post(codex_logout))
        .route("/api/cli/codex/install", post(codex_install))
}


// ---------------- Probar proveedores (respuesta real) ----------------

struct Collect(std::sync::Mutex<String>);
impl crate::providers::Sink for Collect {
    fn text(&self, t: &str) {
        self.0.lock().unwrap().push_str(t);
    }
    fn tool(&self, _: &str, _: &Value) {}
}

#[derive(Deserialize, Default)]
#[serde(default)]
struct TestBody {
    model: String,
}
async fn provider_test(State(st): St, Path(id): Path<String>, Json(b): Json<TestBody>) -> ApiResult {
    let cfg = st.cfg.read().unwrap().clone();
    let p = cfg.providers.get(&id).cloned().ok_or_else(|| bad("Proveedor desconocido"))?;
    let mut model = b.model.clone();
    if model.is_empty() {
        model = match id.as_str() {
            "anthropic" | "claude" => "claude-haiku-5-5".into(),
            "gemini" => "gemini-3.8-flash".into(),
            "groq" => "openai/gpt-oss-20b".into(),
            "xai" => "grok-4.7".into(),
            "cerebras" => "gpt-oss-120b".into(),
            "cloudflare" => "@cf/meta/llama-3.3-70b-instruct-fp8-fast".into(),
            "chatgpt" => String::new(),
            _ => String::new(),
        };
        if model.is_empty() && p.kind == "openai" {
            let list = crate::providers::list_models(&st.http, &cfg, &id).await.unwrap_or_default();
            model = list.iter().find(|m| m.ends_with(":free")).or(list.first()).cloned().unwrap_or_default();
        }
    }
    if p.no_key_needed && p.kind == "openai" && !crate::providers::usable(&st.http, &cfg, &format!("{id}:x")).await {
        let how = if id == "ollama" { " Descárgalo en ollama.com, ábrelo y baja un modelo (por ejemplo: ollama pull qwen2.5-coder)." } else { "" };
        return Ok(Json(json!({"ok": false, "error": format!("{} no responde en {}. ¿Está instalado y abierto?{how}", p.label, crate::providers::base_of(&p))})));
    }
    if !crate::providers::provider_ready(&cfg, &id) {
        return Ok(Json(json!({"ok": false, "error": if p.kind == "claude-code" || p.kind == "codex-cli" { "No está instalado" } else { "Falta la API key: pulsa «Obtener clave»" }})));
    }
    let req = crate::providers::LlmRequest {
        model_ref: format!("{id}:{model}"),
        stable: "Prueba de conexión. Responde exactamente con la palabra: ok".into(),
        messages: vec![("user".into(), "¿Funcionas?".into())],
        max_tokens: 600,
        effort: if p.kind == "anthropic" || p.kind == "claude-code" { "low".into() } else { String::new() },
        ..Default::default()
    };
    let t0 = std::time::Instant::now();
    let sink = Collect(Default::default());
    let r = tokio::time::timeout(std::time::Duration::from_secs(120), crate::providers::stream_chat(&st.http, &cfg, req, &sink, None)).await;
    let ms = t0.elapsed().as_millis() as u64;
    Ok(Json(match r {
        Ok(Ok(res)) if res.demo => json!({"ok": false, "error": "Sin configurar (respondió el modo demo)"}),
        Ok(Ok(res)) => json!({"ok": true, "ms": ms, "model": res.model, "text": res.text.chars().take(120).collect::<String>(), "tokens": res.usage.input + res.usage.output}),
        Ok(Err(e)) => json!({"ok": false, "ms": ms, "error": friendly_error(&e.to_string(), &p.label)}),
        Err(_) => json!({"ok": false, "error": "Tiempo agotado (120 s)"}),
    }))
}

// ---------------- Conectores remotos con OAuth ----------------

pub fn open_url(url: &str) {
    #[cfg(windows)]
    let _ = std::process::Command::new("rundll32").args(["url.dll,FileProtocolHandler", url]).spawn();
    #[cfg(target_os = "macos")]
    let _ = std::process::Command::new("open").arg(url).spawn();
    #[cfg(all(unix, not(target_os = "macos")))]
    let _ = std::process::Command::new("xdg-open").arg(url).spawn();
}

async fn mcp_connect(State(st): St, Path(name): Path<String>) -> ApiResult {
    let cfg = st.cfg.read().unwrap().mcp_servers.get(&name).cloned().ok_or_else(|| bad("Conector no configurado"))?;
    if cfg.transport != "http" {
        return Err(bad("Este conector es local; no necesita iniciar sesión"));
    }
    let url = crate::mcp_http::begin(&st.http, &name, &cfg, &st.oauth).await.map_err(bad)?;
    open_url(&url);
    Ok(Json(json!({"ok": true, "url": url})))
}

async fn mcp_disconnect(State(st): St, Path(name): Path<String>) -> ApiResult {
    {
        let mut cfg = st.cfg.write().unwrap();
        if let Some(s) = cfg.mcp_servers.get_mut(&name) {
            s.oauth = None;
            s.token.clear();
        }
    }
    st.mcp.stop(&name).await;
    st.mark_cfg();
    Ok(Json(json!({"ok": true})))
}

#[derive(Deserialize, Default)]
#[serde(default)]
struct CallbackQ {
    code: String,
    state: String,
    error: String,
    error_description: String,
}
async fn oauth_callback(State(st): St, Query(q): Query<CallbackQ>) -> Response {
    let page = |ok: bool, msg: &str| {
        axum::response::Html(format!("<!doctype html><meta charset=utf-8><title>faisp</title><body style=\"font-family:system-ui;background:#262624;color:#f5f4ef;display:grid;place-items:center;height:100vh;margin:0\"><div style=\"text-align:center\"><div style=\"font-size:42px\">{}</div><h2 style=\"font-weight:500\">{}</h2><p style=\"color:#a8a69e\">Puedes cerrar esta pestaña y volver a faisp.</p></div></body>", if ok { "&#10003;" } else { "&#10007;" }, msg)).into_response()
    };
    if !q.error.is_empty() {
        return page(false, &format!("No se conectó: {} {}", q.error, q.error_description));
    }
    let secret = {
        let pend = st.oauth.0.lock().unwrap();
        pend.get(&q.state).map(|p| p.server.clone())
    }
    .and_then(|srv| st.cfg.read().unwrap().mcp_servers.get(&srv).map(|c| c.oauth_client_secret.clone()));
    match crate::mcp_http::finish(&st.http, &st.oauth, &q.state, &q.code, secret).await {
        Ok((server, tokens)) => {
            {
                let mut cfg = st.cfg.write().unwrap();
                if let Some(s) = cfg.mcp_servers.get_mut(&server) {
                    s.oauth = Some(tokens);
                    s.enabled = true;
                }
            }
            st.mcp.stop(&server).await;
            st.mark_cfg();
            let label = st.cfg.read().unwrap().mcp_servers.get(&server).map(|s| s.label.clone()).unwrap_or(server);
            page(true, &format!("{label} conectado"))
        }
        Err(e) => page(false, &e.to_string()),
    }
}

// ---------------- Codex CLI (cuenta de ChatGPT) ----------------

fn codex_exe(st: &AppState) -> Option<std::path::PathBuf> {
    let configured = st.cfg.read().unwrap().providers.get("chatgpt").map(|p| p.base_url.clone()).unwrap_or_default();
    crate::providers::find_codex(&configured)
}

async fn codex_status(State(st): St) -> ApiResult {
    let Some(exe) = codex_exe(&st) else { return Ok(Json(json!({"found": false}))) };
    let mut cmd = tokio::process::Command::new(&exe);
    cmd.args(["login", "status"]).kill_on_drop(true);
    hidden(&mut cmd);
    let out = tokio::time::timeout(std::time::Duration::from_secs(20), cmd.output()).await;
    let text = match out {
        Ok(Ok(o)) => format!("{}{}", String::from_utf8_lossy(&o.stdout), String::from_utf8_lossy(&o.stderr)).trim().to_string(),
        _ => "No respondió".into(),
    };
    let logged = text.to_lowercase().contains("logged in") && !text.to_lowercase().contains("not logged");
    Ok(Json(json!({"found": true, "path": exe.to_string_lossy(), "loggedIn": logged, "status": text.chars().take(200).collect::<String>()})))
}

async fn codex_login(State(st): St) -> ApiResult {
    let exe = codex_exe(&st).ok_or_else(|| bad("Codex CLI no está instalado"))?;
    #[cfg(windows)]
    std::process::Command::new("cmd").args(["/C", "start", "Iniciar sesión en ChatGPT", &exe.to_string_lossy(), "login"]).spawn().map_err(bad)?;
    #[cfg(not(windows))]
    std::process::Command::new(&exe).arg("login").spawn().map_err(bad)?;
    Ok(Json(json!({"ok": true})))
}

async fn codex_logout(State(st): St) -> ApiResult {
    let exe = codex_exe(&st).ok_or_else(|| bad("Codex CLI no está instalado"))?;
    let mut cmd = tokio::process::Command::new(&exe);
    cmd.arg("logout").kill_on_drop(true);
    hidden(&mut cmd);
    let _ = tokio::time::timeout(std::time::Duration::from_secs(20), cmd.output()).await;
    Ok(Json(json!({"ok": true})))
}

async fn codex_install() -> ApiResult {
    // Solo a petición del usuario (botón): instala el paquete oficial de OpenAI con npm en una consola visible.
    #[cfg(windows)]
    std::process::Command::new("cmd").args(["/C", "start", "Instalar Codex CLI", "cmd", "/K", "npm install -g @openai/codex"]).spawn().map_err(bad)?;
    #[cfg(not(windows))]
    std::process::Command::new("npm").args(["install", "-g", "@openai/codex"]).spawn().map_err(bad)?;
    Ok(Json(json!({"ok": true})))
}


// ---------------- Límites del plan de Claude ----------------

async fn claude_limits_get() -> Json<Value> {
    Json(crate::providers::claude_limits().unwrap_or(Value::Null))
}

/// Pide a Claude Code una respuesta mínima (Haiku, esfuerzo bajo) solo para leer los límites actuales.
async fn claude_limits_refresh(State(st): St) -> ApiResult {
    let cfg = st.cfg.read().unwrap().clone();
    if !crate::providers::provider_ready(&cfg, "claude") {
        return Err(bad("Claude Code no está disponible"));
    }
    let req = crate::providers::LlmRequest {
        model_ref: "claude:claude-haiku-5-5".into(),
        stable: "Responde solo: ok".into(),
        messages: vec![("user".into(), "ok".into())],
        max_tokens: 50,
        effort: "low".into(),
        ..Default::default()
    };
    let sink = Collect(Default::default());
    match tokio::time::timeout(std::time::Duration::from_secs(90), crate::providers::stream_chat(&st.http, &cfg, req, &sink, None)).await {
        Ok(Ok(_)) => Ok(Json(crate::providers::claude_limits().unwrap_or(Value::Null))),
        Ok(Err(e)) => Err(bad(e)),
        Err(_) => Err(bad("Tiempo agotado")),
    }
}


// ---------------- Uso y límites de todas las IAs ----------------

async fn account_info(http: &reqwest::Client, id: &str, key: &str) -> Option<Value> {
    let t = std::time::Duration::from_secs(8);
    match id {
        "openrouter" => {
            let v: Value = http.get("https://openrouter.ai/api/v1/key").bearer_auth(key).timeout(t).send().await.ok()?.json().await.ok()?;
            let d = &v["data"];
            Some(json!({"kind": "credits", "used": d["usage"], "limit": d["limit"], "remaining": d["limit_remaining"], "free": d["is_free_tier"]}))
        }
        "elevenlabs" => {
            let v: Value = http.get("https://api.elevenlabs.io/v1/user/subscription").header("xi-api-key", key).timeout(t).send().await.ok()?.json().await.ok()?;
            Some(json!({"kind": "characters", "used": v["character_count"], "limit": v["character_limit"], "resetsAt": v["next_character_count_reset_unix"], "tier": v["tier"]}))
        }
        _ => None,
    }
}

async fn all_limits(State(st): St) -> ApiResult {
    let cfg = st.cfg.read().unwrap().clone();
    // Consumo de faisp por proveedor (7 días y 30 días)
    let (week, month) = {
        let db = st.db.lock().unwrap();
        let now = chrono::Utc::now();
        let w = (now - chrono::Duration::days(7)).to_rfc3339();
        let m = (now - chrono::Duration::days(30)).to_rfc3339();
        let mut week: BTreeMap<String, (u64, f64, usize)> = BTreeMap::new();
        let mut month: BTreeMap<String, (u64, f64, usize)> = BTreeMap::new();
        for u in db.usage.iter().filter(|u| !u.demo && u.ts >= m) {
            let t = u.tokens.input + u.tokens.output + u.tokens.cache_read + u.tokens.cache_write;
            let e = month.entry(u.provider.clone()).or_default();
            e.0 += t;
            e.1 += u.cost;
            e.2 += 1;
            if u.ts >= w {
                let e = week.entry(u.provider.clone()).or_default();
                e.0 += t;
                e.1 += u.cost;
                e.2 += 1;
            }
        }
        (week, month)
    };
    let mut providers = serde_json::Map::new();
    let api_limits = crate::providers::provider_limits();
    for (id, p) in &cfg.providers {
        if p.kind == "mock" {
            continue;
        }
        let ready = if p.kind == "elevenlabs" { !p.api_key.is_empty() } else { crate::providers::usable(&st.http, &cfg, &format!("{id}:x")).await };
        let key = crate::providers::api_key(id, p).unwrap_or_default();
        let account = if ready && !key.is_empty() { account_info(&st.http, id, &key).await } else { None };
        let w = week.get(id).cloned().unwrap_or_default();
        let mo = month.get(id).cloned().unwrap_or_default();
        providers.insert(id.clone(), json!({
            "label": p.label, "kind": p.kind, "ready": ready, "free": p.free,
            "rate": api_limits.get(id).cloned().unwrap_or(Value::Null),
            "account": account,
            "week": {"tokens": w.0, "cost": w.1, "calls": w.2},
            "month": {"tokens": mo.0, "cost": mo.1, "calls": mo.2},
        }));
    }
    Ok(Json(json!({"claude": crate::providers::claude_limits(), "providers": providers})))
}

fn friendly_error(e: &str, label: &str) -> String {
    let l = e.to_lowercase();
    let msg = if l.contains("error sending request") || l.contains("connect") || l.contains("dns") {
        format!("No se pudo conectar con {label}. Revisa tu conexión o que el servicio esté disponible.")
    } else if l.contains("http 401") || l.contains("http 403") || l.contains("invalid api key") || l.contains("unauthorized") {
        format!("{label} rechazó la clave: comprueba que está bien copiada y activa.")
    } else if l.contains("http 404") || l.contains("not found") || l.contains("does not exist") {
        format!("Ese modelo no existe en {label}: elige otro con «Ver modelos».")
    } else if l.contains("http 429") || l.contains("rate limit") || l.contains("quota") {
        format!("{label}: límite de uso alcanzado. Espera un poco o revisa tu plan.")
    } else if l.contains("http 402") || l.contains("credit") || l.contains("billing") || l.contains("insufficient") {
        format!("{label}: sin saldo o sin facturación activada.")
    } else {
        return e.chars().take(300).collect();
    };
    format!("{msg}  (detalle: {})", e.chars().take(140).collect::<String>())
}

async fn pick_file(State(st): St) -> ApiResult {
    #[cfg(windows)]
    {
        let script = "[Console]::OutputEncoding=[Text.Encoding]::UTF8; Add-Type -AssemblyName System.Windows.Forms; $o=New-Object System.Windows.Forms.Form -Property @{TopMost=$true}; $f=New-Object System.Windows.Forms.OpenFileDialog; $f.Title='Adjuntar archivo'; $f.Filter='Documentos y multimedia|*.pdf;*.docx;*.xlsx;*.xls;*.ods;*.csv;*.pptx;*.odt;*.odp;*.txt;*.md;*.json;*.mp4;*.mov;*.webm;*.mkv;*.avi;*.mp3;*.wav;*.ogg;*.flac;*.m4a;*.aac;*.png;*.jpg;*.jpeg;*.webp;*.gif|Todos|*.*'; if($f.ShowDialog($o) -eq 'OK'){ $f.FileName }";
        let mut cmd = tokio::process::Command::new("powershell");
        cmd.args(["-NoProfile", "-STA", "-Command", script]);
        hidden(&mut cmd);
        let out = cmd.output().await.map_err(bad)?;
        let path = String::from_utf8_lossy(&out.stdout).trim().to_string();
        if !path.is_empty() {
            st.picked.lock().unwrap().insert(path.clone());
        }
        return Ok(Json(json!({"path": path})));
    }
    #[cfg(not(windows))]
    {
        let path = unix_pick(false).await;
        if !path.is_empty() {
            st.picked.lock().unwrap().insert(path.clone());
        }
        return Ok(Json(json!({"path": path})));
    }
    #[allow(unreachable_code)]
    Ok(Json(json!({"path": ""})))
}

async fn window_open() -> ApiResult {
    if crate::window::request_open() { Ok(Json(json!({"ok": true}))) } else { Err(bad("sin ventana nativa")) }
}

/// Devuelve la clave completa de un proveedor (solo accesible desde este PC: el servidor escucha en 127.0.0.1).
async fn provider_key(State(st): St, Path(id): Path<String>) -> ApiResult {
    let cfg = st.cfg.read().unwrap();
    let p = cfg.providers.get(&id).ok_or_else(|| bad("Proveedor desconocido"))?;
    Ok(Json(json!({"key": crate::providers::api_key(&id, p).unwrap_or_default()})))
}

#[derive(Deserialize, Default)]
#[serde(default)]
struct GrammarBody {
    text: String,
    language: String,
}
/// Revisión de ortografía y gramática con LanguageTool (servicio público, español e inglés).
async fn grammar(State(st): St, Json(b): Json<GrammarBody>) -> ApiResult {
    if b.text.trim().len() < 3 {
        return Ok(Json(json!({"matches": []})));
    }
    let text: String = b.text.chars().take(18000).collect();
    let lang = if b.language.is_empty() { "auto".to_string() } else { b.language.clone() };
    let mut form = vec![("text", text), ("language", lang.clone())];
    if lang == "auto" {
        form.push(("preferredVariants", "es-ES,en-US".into()));
    }
    let r = st.http.post("https://api.languagetool.org/v2/check").timeout(std::time::Duration::from_secs(15)).form(&form).send().await.map_err(bad)?;
    if !r.status().is_success() {
        let s = r.status();
        return Err(bad(if s.as_u16() == 429 { "Corrector: demasiadas revisiones seguidas; espera un momento".to_string() } else { format!("Corrector: HTTP {s}") }));
    }
    let v: Value = r.json().await.map_err(bad)?;
    let matches: Vec<Value> = v["matches"].as_array().cloned().unwrap_or_default().iter().map(|m| json!({
        "offset": m["offset"], "length": m["length"], "message": m["message"], "short": m["shortMessage"],
        "replacements": m["replacements"].as_array().map(|a| a.iter().take(5).filter_map(|r| r["value"].as_str()).collect::<Vec<_>>()).unwrap_or_default(),
        "type": m["rule"]["issueType"], "rule": m["rule"]["id"],
    })).collect();
    Ok(Json(json!({"matches": matches, "language": v["language"]["detectedLanguage"]["name"]})))
}

async fn obsidian_vaults() -> Json<Value> {
    Json(json!({"vaults": crate::integrations::obsidian_vaults()}))
}

/// Servidor MCP mínimo (solo 127.0.0.1) con las herramientas propias de faisp para un paso concreto.
async fn mcp_bridge(State(st): St, Path(token): Path<String>, Json(msg): Json<Value>) -> Response {
    let entry = st.bridge.lock().unwrap().get(&token).cloned();
    let Some((specs, exec)) = entry else { return (StatusCode::NOT_FOUND, "sesión MCP caducada").into_response() };
    let id = msg.get("id").cloned();
    let method = msg["method"].as_str().unwrap_or("");
    let Some(id) = id else { return StatusCode::ACCEPTED.into_response() }; // notificaciones
    let result = match method {
        "initialize" => json!({"protocolVersion": msg["params"]["protocolVersion"].as_str().unwrap_or("2025-06-18"), "capabilities": {"tools": {}}, "serverInfo": {"name": "faisp", "version": env!("CARGO_PKG_VERSION")}}),
        "ping" => json!({}),
        "tools/list" => json!({"tools": specs.iter().map(|t| json!({"name": t["name"], "description": t["description"], "inputSchema": t["input_schema"]})).collect::<Vec<_>>()}),
        "tools/call" => {
            let name = msg["params"]["name"].as_str().unwrap_or("").to_string();
            if !specs.iter().any(|t| t["name"] == name.as_str()) {
                return Json(json!({"jsonrpc": "2.0", "id": id, "error": {"code": -32602, "message": "Herramienta desconocida"}})).into_response();
            }
            let out = exec(name, msg["params"]["arguments"].clone()).await;
            json!({"content": [{"type": "text", "text": out}], "isError": false})
        }
        _ => return Json(json!({"jsonrpc": "2.0", "id": id, "error": {"code": -32601, "message": "Método no soportado"}})).into_response(),
    };
    Json(json!({"jsonrpc": "2.0", "id": id, "result": result})).into_response()
}

// ---------------- Chats: detener, bifurcar, rebobinar, compactar ----------------

async fn chat_stop(State(st): St, Path(id): Path<String>) -> ApiResult {
    let n = st.cancels.lock().unwrap().get(&id).cloned();
    match n {
        Some(n) => { n.notify_one(); Ok(Json(json!({"ok": true}))) }
        None => Ok(Json(json!({"ok": false, "info": "no había nada en curso"}))),
    }
}

#[derive(Deserialize, Default)]
#[serde(default, rename_all = "camelCase")]
struct MsgRef {
    message_id: String,
}
async fn chat_fork(State(st): St, Path(id): Path<String>, Json(b): Json<MsgRef>) -> ApiResult {
    let mut db = st.db.lock().unwrap();
    let c = db.chats.iter().find(|c| c.id == id).cloned().ok_or_else(|| bad("no existe"))?;
    let pos = c.messages.iter().position(|m| m.id == b.message_id).ok_or_else(|| bad("mensaje no encontrado"))?;
    let mut n = c.clone();
    n.id = uid("c_");
    n.title = format!("↳ {}", c.title);
    n.messages.truncate(pos + 1);
    n.pending = None;
    n.chapters.retain(|ch| n.messages.iter().any(|m| m.id == ch.message_id));
    n.summarized_upto = n.summarized_upto.min(n.messages.len());
    n.created_at = now();
    n.updated_at = now();
    db.chats.push(n.clone());
    st.mark();
    Ok(Json(json!(n)))
}
async fn chat_rewind(State(st): St, Path(id): Path<String>, Json(b): Json<MsgRef>) -> ApiResult {
    let mut db = st.db.lock().unwrap();
    let c = db.chats.iter_mut().find(|c| c.id == id).ok_or_else(|| bad("no existe"))?;
    let pos = c.messages.iter().position(|m| m.id == b.message_id).ok_or_else(|| bad("mensaje no encontrado"))?;
    let removed = c.messages[pos].clone();
    c.messages.truncate(pos);
    let len = c.messages.len();
    c.chapters.retain(|ch| c.messages.iter().any(|m| m.id == ch.message_id));
    if c.summarized_upto > len { c.summarized_upto = len; c.summary.clear(); }
    c.updated_at = now();
    st.mark();
    Ok(Json(json!({"text": removed.content, "attachments": removed.attachments})))
}
async fn chat_compact(State(st): St, Path(id): Path<String>) -> ApiResult {
    crate::orchestrator::compact_chat(&st, &id, true).await;
    chat_context(State(st), Path(id)).await
}
async fn chat_context(State(st): St, Path(id): Path<String>) -> ApiResult {
    let db = st.db.lock().unwrap();
    let c = db.chats.iter().find(|c| c.id == id).ok_or_else(|| bad("no existe"))?;
    let turns = st.cfg.read().unwrap().budget.history_turns * 2;
    let start = c.messages.len().saturating_sub(turns).max(c.summarized_upto.min(c.messages.len()));
    let tokens: usize = estimate_tokens(&c.summary) + c.messages[start..].iter().map(|m| estimate_tokens(&m.content.chars().take(if m.role == "user" { 100000 } else { 1500 }).collect::<String>())).sum::<usize>();
    let full: usize = c.messages.iter().map(|m| estimate_tokens(&m.content)).sum();
    Ok(Json(json!({"tokens": tokens, "fullTokens": full, "window": 1_000_000, "messages": c.messages.len(), "summarized": c.summarized_upto, "hasSummary": !c.summary.is_empty(), "pending": c.pending})))
}
async fn chat_resume_cancel(State(st): St, Path(id): Path<String>) -> ApiResult {
    let mut db = st.db.lock().unwrap();
    if let Some(c) = db.chats.iter_mut().find(|c| c.id == id) { c.pending = None; }
    st.mark();
    Ok(Json(json!({"ok": true})))
}

#[derive(Deserialize, Default)]
#[serde(default, rename_all = "camelCase")]
struct SideBody {
    project_id: Option<String>,
}
/// Chat lateral del proyecto (uno por proyecto, fuera de recientes)
async fn side_chat(State(st): St, Json(b): Json<SideBody>) -> ApiResult {
    let mut db = st.db.lock().unwrap();
    if let Some(c) = db.chats.iter().find(|c| c.side && c.project_id == b.project_id) {
        return Ok(Json(json!(c)));
    }
    let c = Chat { id: uid("c_"), project_id: b.project_id, title: "Chat lateral".into(), side: true, created_at: now(), updated_at: now(), ..Default::default() };
    db.chats.push(c.clone());
    st.mark();
    Ok(Json(json!(c)))
}

async fn runs(State(st): St) -> Json<Value> {
    let r = st.running.lock().unwrap().iter().map(|(k, (t, s, p))| json!({"chatId": k, "title": t, "startedAt": s, "projectId": p})).collect::<Vec<_>>();
    let db = st.db.lock().unwrap();
    let pend = db.chats.iter().filter_map(|c| c.pending.as_ref().map(|p| json!({"chatId": c.id, "title": c.title, "resumeAt": p.resume_at}))).collect::<Vec<_>>();
    let routines = db.routines.iter().filter(|r| r.enabled).map(|r| json!({"id": r.id, "name": r.name, "schedule": r.schedule, "lastRun": r.last_run})).collect::<Vec<_>>();
    Json(json!({"running": r, "paused": pend, "routines": routines}))
}

// ---------------- Subir archivos (pegar / arrastrar) y servirlos ----------------

async fn upload(State(st): St, headers: axum::http::HeaderMap, body: axum::body::Bytes) -> ApiResult {
    if body.len() > 30 * 1024 * 1024 {
        return Err(bad("El archivo supera 30 MB"));
    }
    let raw = headers.get("x-file-name").and_then(|v| v.to_str().ok()).unwrap_or("archivo.bin");
    let name: String = percent_decode(raw).chars().map(|c| if c.is_alphanumeric() || ".-_ ".contains(c) { c } else { '_' }).collect();
    let dir = st.data.join("uploads");
    std::fs::create_dir_all(&dir).map_err(bad)?;
    let path = dir.join(format!("{}_{}", uid(""), name.trim()));
    std::fs::write(&path, &body).map_err(bad)?;
    let p = path.to_string_lossy().to_string();
    st.picked.lock().unwrap().insert(p.clone());
    Ok(Json(json!({"path": p, "size": body.len()})))
}

fn percent_decode(s: &str) -> String {
    let b = s.as_bytes();
    let mut out = Vec::with_capacity(b.len());
    let mut i = 0;
    while i < b.len() {
        if b[i] == b'%' && i + 2 < b.len() {
            if let Ok(v) = u8::from_str_radix(&s[i + 1..i + 3], 16) { out.push(v); i += 3; continue; }
        }
        out.push(b[i]);
        i += 1;
    }
    String::from_utf8_lossy(&out).to_string()
}

#[derive(Deserialize)]
struct FileQ {
    path: String,
}
/// Sirve un archivo local para previsualizarlo (solo adjuntos elegidos/subidos o dentro de un proyecto).
async fn serve_file(State(st): St, Query(q): Query<FileQ>) -> Response {
    let p = std::path::PathBuf::from(&q.path);
    let allowed = st.picked.lock().unwrap().contains(&q.path)
        || p.starts_with(st.data.join("uploads"))
        || st.db.lock().unwrap().projects.iter().any(|pr| !pr.path.is_empty() && p.starts_with(&pr.path));
    if !allowed || !p.is_file() {
        return StatusCode::NOT_FOUND.into_response();
    }
    let mime = crate::gemini_media::mime_for(&p).unwrap_or("application/octet-stream");
    match std::fs::read(&p) {
        Ok(b) => ([(header::CONTENT_TYPE, mime), (header::CACHE_CONTROL, "max-age=3600")], b).into_response(),
        Err(_) => StatusCode::NOT_FOUND.into_response(),
    }
}

// ---------------- Mantener la computadora activa ----------------

async fn keep_awake_get(State(st): St) -> Json<Value> {
    Json(json!({"on": st.keep_awake.lock().unwrap().is_some()}))
}
#[derive(Deserialize, Default)]
#[serde(default)]
struct AwakeBody {
    on: bool,
}
async fn keep_awake_set(State(st): St, Json(b): Json<AwakeBody>) -> Json<Value> {
    let mut g = st.keep_awake.lock().unwrap();
    if b.on && g.is_none() {
        let (tx, rx) = std::sync::mpsc::channel::<()>();
        // El estado de ejecución es por hilo: un hilo dedicado lo mantiene mientras esté activo
        std::thread::spawn(move || {
            #[cfg(windows)]
            unsafe {
                use windows_sys::Win32::System::Power::*;
                SetThreadExecutionState(ES_CONTINUOUS | ES_SYSTEM_REQUIRED);
                let _ = rx.recv();
                SetThreadExecutionState(ES_CONTINUOUS);
            }
            #[cfg(not(windows))]
            {
                // macOS: caffeinate; Linux: systemd-inhibit. Se paran al apagar la opción.
                let child = if cfg!(target_os = "macos") {
                    std::process::Command::new("caffeinate").args(["-i", "-s"]).spawn().ok()
                } else {
                    std::process::Command::new("systemd-inhibit").args(["--what=idle:sleep", "--who=faisp", "--why=Trabajo en curso", "sleep", "infinity"]).spawn().ok()
                };
                let _ = rx.recv();
                if let Some(mut c) = child { let _ = c.kill(); }
            }
        });
        *g = Some(tx);
    } else if !b.on {
        if let Some(tx) = g.take() { let _ = tx.send(()); }
    }
    Json(json!({"on": g.is_some()}))
}
