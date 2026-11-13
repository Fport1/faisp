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
        .route("/icon.svg", get(|| ui("icon.svg")))
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
        "icon.svg" => include_str!("../ui/icon.svg"),
        "vendor/marked.js" => include_str!("../ui/vendor/marked.js"),
        "vendor/purify.js" => include_str!("../ui/vendor/purify.js"),
        _ => return StatusCode::NOT_FOUND.into_response(),
    };
    ([(header::CONTENT_TYPE, ctype)], body).into_response()
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
    let ready: BTreeMap<String, bool> = cfg.providers.keys().map(|k| (k.clone(), provider_ready(&cfg, k))).collect();
    let agents = st.all_agents();
    let db = st.db.lock().unwrap();
    let chats: Vec<Value> = {
        let mut c: Vec<&Chat> = db.chats.iter().collect();
        c.sort_by(|a, b| b.updated_at.cmp(&a.updated_at));
        c.iter().map(|c| json!({"id": c.id, "title": c.title, "projectId": c.project_id, "updatedAt": c.updated_at, "routineId": c.routine_id, "count": c.messages.len()})).collect()
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
        "agents": agents,
        "projects": db.projects,
        "chats": chats,
        "routines": routines,
        "extensions": {"plugins": ext.plugins, "skills": ext.skills.len(), "connectors": ext.connectors.len()},
        "monthSpend": month_spend(&db),
        "dataDir": st.data.to_string_lossy(),
        "version": env!("CARGO_PKG_VERSION"),
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
    #[allow(unreachable_code)]
    Ok(Json(json!({"path": ""})))
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
    let (tx, rx) = tokio::sync::mpsc::unbounded_channel::<(String, Value)>();
    let tx2 = tx.clone();
    let agent = b.agent_id.filter(|a| !a.is_empty() && a != "auto");
    tokio::spawn(async move {
        if let Err(e) = orchestrator::run_request(st, id, b.text, agent, b.attachments, tx, orchestrator::RunCtx { mode: b.mode, effort: b.effort }).await {
            let _ = tx2.send(("error".into(), json!({"error": e.to_string()})));
        }
    });
    let stream = UnboundedReceiverStream::new(rx).map(|(ev, data)| Ok(SseEvent::default().event(ev).data(data.to_string())));
    Sse::new(stream).keep_alive(KeepAlive::default())
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
    cmd.args(["auth", "logout"]);
    hidden(&mut cmd);
    let _ = cmd.output().await;
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
    let c = st.mcp.get(&name, &cfg).await.map_err(bad)?;
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
}
