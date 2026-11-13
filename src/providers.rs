//! Proveedores de modelos con streaming y bucle de herramientas.
//! - anthropic: Messages API por HTTP (no hay SDK oficial de Anthropic para Rust). Caché de prompt
//!   sobre la parte estable, `effort`, y fallback del servidor ante rechazos en Opus/Sonnet 5.5.
//! - openai: cualquier endpoint /chat/completions (OpenRouter, LiteLLM, Ollama, OpenAI, o los que añadas).
//! - demo: simula la respuesta cuando falta la clave, para probar sin gastar.
use crate::context::estimate_tokens;
use crate::store::{Config, Provider, TokenUsage, ToolCallLog};
use futures_util::future::BoxFuture;
use futures_util::StreamExt;
use serde_json::{json, Value};
use std::collections::HashMap;
use std::sync::Arc;
use std::time::Duration;

pub trait Sink: Send + Sync {
    fn text(&self, t: &str);
    fn tool(&self, name: &str, input: &Value);
}

pub type ToolExec = Arc<dyn Fn(String, Value) -> BoxFuture<'static, String> + Send + Sync>;

#[derive(Clone, Default)]
pub struct LlmRequest {
    pub model_ref: String,
    pub stable: String,
    pub volatile: String,
    pub messages: Vec<(String, String)>,
    pub max_tokens: u32,
    pub effort: String,
    pub tools: Vec<Value>,
    pub max_rounds: usize,
    pub web_search: bool,
    /// Carpeta de trabajo (Claude Code trabaja directamente en ella).
    pub cwd: Option<String>,
    /// Modo de permisos: auto | manual | acceptEdits | plan | bypass
    pub mode: String,
    /// Archivo .mcp.json para Claude Code y herramientas MCP permitidas sin preguntar.
    pub mcp_config: Option<String>,
    pub mcp_allow: Vec<String>,
}

/// ¿Es gratis este modelo? (proveedor marcado como gratuito/local, o modelo ":free" de OpenRouter)
pub fn is_free(cfg: &Config, model_ref: &str) -> bool {
    let (pid, model) = parse_model_ref(model_ref);
    model.ends_with(":free") || cfg.providers.get(&pid).map(|p| p.free).unwrap_or(false)
}

/// Orden en que se probarán los modelos de un agente.
pub fn model_chain(cfg: &Config, primary: &str, fallbacks: &[String], prefer_free: bool) -> Vec<String> {
    let mut chain: Vec<String> = std::iter::once(primary.to_string()).chain(fallbacks.iter().cloned()).filter(|m| !m.trim().is_empty()).collect();
    if cfg.routing.use_subscription && cfg.providers.get("claude").map(|p| p.kind == "claude-code").unwrap_or(false) {
        let mut with_sub = Vec::new();
        for m in chain {
            if let Some(rest) = m.strip_prefix("anthropic:") {
                with_sub.push(format!("claude:{rest}"));
            }
            with_sub.push(m);
        }
        chain = with_sub;
    }
    let mut seen = std::collections::HashSet::new();
    chain.retain(|m| seen.insert(m.clone()));
    if prefer_free {
        chain.sort_by_key(|m| !is_free(cfg, m)); // estable: los gratis primero, mismo orden relativo
    }
    chain
}

struct Tracking<'a> {
    inner: &'a dyn Sink,
    emitted: std::sync::atomic::AtomicBool,
}
impl Sink for Tracking<'_> {
    fn text(&self, t: &str) {
        self.emitted.store(true, std::sync::atomic::Ordering::Relaxed);
        self.inner.text(t);
    }
    fn tool(&self, name: &str, input: &Value) {
        self.emitted.store(true, std::sync::atomic::Ordering::Relaxed);
        self.inner.tool(name, input);
    }
}

/// Prueba la cadena de modelos: salta proveedores sin configurar y, si uno falla antes de
/// empezar a responder (429, caída, modelo inexistente…), pasa al siguiente.
/// Los proveedores locales (Ollama, LiteLLM…) no tienen clave: comprobamos que respondan (caché 60 s).
async fn local_reachable(http: &reqwest::Client, base: &str) -> bool {
    use std::sync::{Mutex, OnceLock};
    use std::time::Instant;
    static CACHE: OnceLock<Mutex<HashMap<String, (Instant, bool)>>> = OnceLock::new();
    let cache = CACHE.get_or_init(Default::default);
    if let Some((t, ok)) = cache.lock().unwrap().get(base) {
        if t.elapsed() < Duration::from_secs(60) {
            return *ok;
        }
    }
    let ok = http.get(format!("{}/models", base.trim_end_matches('/'))).timeout(Duration::from_millis(1500)).send().await.map(|r| r.status().as_u16() < 500).unwrap_or(false);
    cache.lock().unwrap().insert(base.to_string(), (Instant::now(), ok));
    ok
}

async fn usable(http: &reqwest::Client, cfg: &Config, model_ref: &str) -> bool {
    let pid = parse_model_ref(model_ref).0;
    match cfg.providers.get(&pid) {
        Some(p) if p.kind == "claude-code" => crate::integrations::find_claude_code(&p.base_url).is_some(),
        Some(p) if p.no_key_needed && p.kind != "mock" => local_reachable(http, &p.base_url).await,
        _ => provider_ready(cfg, &pid),
    }
}

pub async fn stream_chain(http: &reqwest::Client, cfg: &Config, chain: &[String], req: LlmRequest, sink: &dyn Sink, tools: Option<ToolExec>) -> anyhow::Result<(LlmResult, Vec<String>)> {
    let mut ready: Vec<&String> = Vec::new();
    for m in chain {
        if usable(http, cfg, m).await {
            ready.push(m);
        }
    }
    let mut notes = Vec::new();
    if ready.is_empty() {
        let (pid, model) = parse_model_ref(chain.first().map(|s| s.as_str()).unwrap_or(""));
        let label = cfg.providers.get(&pid).map(|p| p.label.clone()).unwrap_or(pid.clone());
        let reason = if chain.len() > 1 { format!("ningún modelo de la cadena está disponible; falta la API key de {label}") } else { format!("falta la API key de {label}") };
        return Ok((demo(&req, &pid, &model, &reason, sink).await, notes));
    }
    let mut last_err = None;
    for m in ready {
        let track = Tracking { inner: sink, emitted: Default::default() };
        let mut r = req.clone();
        r.model_ref = m.clone();
        match stream_chat(http, cfg, r, &track, tools.clone()).await {
            Ok(res) => return Ok((res, notes)),
            Err(e) => {
                if track.emitted.load(std::sync::atomic::Ordering::Relaxed) {
                    return Err(e);
                }
                notes.push(format!("{m}: {}", e.to_string().chars().take(160).collect::<String>()));
                last_err = Some(e);
            }
        }
    }
    Err(last_err.unwrap_or_else(|| anyhow::anyhow!("Sin modelos disponibles")))
}

/// Lista los modelos que ofrece un proveedor (GET /models).
pub async fn list_models(http: &reqwest::Client, cfg: &Config, id: &str) -> anyhow::Result<Vec<String>> {
    let p = cfg.providers.get(id).ok_or_else(|| anyhow::anyhow!("Proveedor desconocido"))?;
    if p.kind == "claude-code" {
        return Ok(["claude-opus-5-5", "claude-sonnet-5-5", "claude-haiku-5-5", "claude-fable-5-2"].iter().map(|s| s.to_string()).collect());
    }
    let key = api_key(id, p).unwrap_or_default();
    let v: Value = if p.kind == "anthropic" {
        let base = if p.base_url.is_empty() { "https://api.anthropic.com" } else { p.base_url.trim_end_matches('/') };
        http.get(format!("{base}/v1/models?limit=100")).header("x-api-key", key).header("anthropic-version", "2023-06-01").send().await?.error_for_status()?.json().await?
    } else {
        let mut rb = http.get(format!("{}/models", p.base_url.trim_end_matches('/')));
        if !key.is_empty() {
            rb = rb.bearer_auth(key);
        }
        rb.send().await?.error_for_status()?.json().await?
    };
    let arr = v["data"].as_array().or_else(|| v["models"].as_array()).cloned().unwrap_or_default();
    let mut ids: Vec<String> = arr.iter().filter_map(|m| m["id"].as_str().or_else(|| m["name"].as_str()).map(|s| s.trim_start_matches("models/").to_string())).collect();
    ids.sort();
    Ok(ids)
}

#[derive(Default, Debug)]
pub struct LlmResult {
    pub text: String,
    pub provider: String,
    pub model: String,
    pub demo: bool,
    pub usage: TokenUsage,
    pub tool_log: Vec<ToolCallLog>,
}

pub fn parse_model_ref(r: &str) -> (String, String) {
    match r.split_once(':') {
        Some((p, m)) => (p.to_string(), m.to_string()),
        None => ("anthropic".into(), r.to_string()),
    }
}

fn env_key(provider_id: &str) -> Option<String> {
    std::env::var(format!("{}_API_KEY", provider_id.to_uppercase().replace('-', "_"))).ok().filter(|s| !s.is_empty())
}

pub fn api_key(id: &str, p: &Provider) -> Option<String> {
    if !p.api_key.is_empty() {
        return Some(p.api_key.clone());
    }
    env_key(id)
}

pub fn provider_ready(cfg: &Config, id: &str) -> bool {
    match cfg.providers.get(id) {
        None => false,
        Some(p) if p.kind == "claude-code" => crate::integrations::find_claude_code(&p.base_url).is_some(),
        Some(p) if p.kind == "mock" || p.no_key_needed => true,
        Some(p) => api_key(id, p).is_some(),
    }
}

pub async fn stream_chat(http: &reqwest::Client, cfg: &Config, req: LlmRequest, sink: &dyn Sink, tools: Option<ToolExec>) -> anyhow::Result<LlmResult> {
    let (pid, model) = parse_model_ref(&req.model_ref);
    let Some(p) = cfg.providers.get(&pid) else {
        anyhow::bail!("Proveedor desconocido: \"{pid}\". Añádelo en Ajustes → Proveedores.");
    };
    if !provider_ready(cfg, &pid) {
        return Ok(demo(&req, &pid, &model, &format!("falta la API key de {}", p.label), sink).await);
    }
    match p.kind.as_str() {
        "anthropic" => anthropic(http, &pid, p, &model, req, sink, tools).await,
        "claude-code" => claude_code(&pid, p, &model, req, sink).await,
        "openai" if req.web_search && p.responses_api => responses(http, &pid, p, &model, req, sink).await,
        "openai" => openai(http, &pid, p, &model, req, sink, tools).await,
        _ => Ok(demo(&req, &pid, &model, "proveedor de demostración", sink).await),
    }
}

async fn send_with_retry(rb: impl Fn() -> reqwest::RequestBuilder) -> anyhow::Result<reqwest::Response> {
    let mut wait = 2;
    for attempt in 0..3 {
        let res = rb().send().await?;
        let s = res.status().as_u16();
        if res.status().is_success() {
            return Ok(res);
        }
        if attempt < 2 && (s == 429 || s == 529 || s >= 500) {
            tokio::time::sleep(Duration::from_secs(wait)).await;
            wait *= 3;
            continue;
        }
        let body = res.text().await.unwrap_or_default();
        anyhow::bail!("HTTP {s}: {}", body.chars().take(600).collect::<String>());
    }
    unreachable!()
}

/// Itera eventos SSE (`data: ...`) de una respuesta en streaming.
async fn for_each_sse(res: reqwest::Response, mut f: impl FnMut(Value) -> anyhow::Result<()>) -> anyhow::Result<()> {
    let mut stream = res.bytes_stream();
    let mut buf: Vec<u8> = Vec::new();
    while let Some(chunk) = stream.next().await {
        buf.extend_from_slice(&chunk?);
        while let Some(pos) = buf.iter().position(|&b| b == b'\n') {
            let line: Vec<u8> = buf.drain(..=pos).collect();
            let line = String::from_utf8_lossy(&line);
            let line = line.trim();
            if let Some(data) = line.strip_prefix("data:") {
                let data = data.trim();
                if data.is_empty() || data == "[DONE]" {
                    continue;
                }
                if let Ok(v) = serde_json::from_str::<Value>(data) {
                    f(v)?;
                }
            }
        }
    }
    Ok(())
}

async fn run_tools(calls: Vec<(String, String, Value, bool)>, exec: &Option<ToolExec>, sink: &dyn Sink, log: &mut Vec<ToolCallLog>) -> Vec<(String, String, bool)> {
    // (id, nombre, input, json_valido) → (id, resultado, es_error)
    let mut out = Vec::new();
    for (id, name, input, valid) in calls {
        sink.tool(&name, &input);
        let (result, is_err) = if !valid {
            ("INVALID_JSON: los argumentos de la herramienta no eran JSON válido; reintenta.".to_string(), true)
        } else if let Some(ex) = exec {
            (ex(name.clone(), input.clone()).await, false)
        } else {
            ("Herramienta no disponible".to_string(), true)
        };
        let short_in = serde_json::to_string(&input).unwrap_or_default().chars().take(300).collect();
        log.push(ToolCallLog { name: name.clone(), input: short_in, result: result.chars().take(400).collect() });
        out.push((id, result, is_err));
    }
    out
}

// ---------------- Anthropic ----------------

async fn anthropic(http: &reqwest::Client, pid: &str, p: &Provider, model: &str, req: LlmRequest, sink: &dyn Sink, exec: Option<ToolExec>) -> anyhow::Result<LlmResult> {
    let key = api_key(pid, p).unwrap_or_default();
    let base = if p.base_url.is_empty() { "https://api.anthropic.com".to_string() } else { p.base_url.trim_end_matches('/').to_string() };
    let url = format!("{base}/v1/messages");

    let mut system = vec![json!({"type":"text","text":req.stable,"cache_control":{"type":"ephemeral"}})];
    if !req.volatile.is_empty() {
        system.push(json!({"type":"text","text":req.volatile}));
    }
    let mut tools: Vec<Value> = req
        .tools
        .iter()
        .map(|t| {
            let mut t = t.clone();
            t["eager_input_streaming"] = json!(true);
            t
        })
        .collect();
    if req.web_search {
        tools.push(json!({"type": "web_search_20260209", "name": "web_search", "max_uses": 5}));
    }
    let fallback = model == "claude-opus-5-5" || model == "claude-sonnet-5-5";

    let mut msgs: Vec<Value> = req.messages.iter().map(|(r, c)| json!({"role": r, "content": c})).collect();
    let mut result = LlmResult { provider: pid.into(), model: model.into(), ..Default::default() };

    let max_rounds = req.max_rounds.max(if req.web_search { 4 } else { 0 });
    for round in 0..=max_rounds {
        let mut body = json!({
            "model": model,
            "max_tokens": if req.max_tokens == 0 { 32000 } else { req.max_tokens },
            "system": system,
            "messages": msgs,
            "stream": true,
            "cache_control": {"type": "ephemeral"},
        });
        if !req.effort.is_empty() {
            body["output_config"] = json!({"effort": req.effort});
        }
        if !tools.is_empty() {
            body["tools"] = json!(tools);
        }
        if fallback {
            body["fallbacks"] = json!("default");
        }
        let res = send_with_retry(|| {
            let mut rb = http.post(&url).header("x-api-key", &key).header("anthropic-version", "2023-06-01").header("content-type", "application/json");
            if fallback {
                rb = rb.header("anthropic-beta", "server-side-fallback-2026-07-01");
            }
            for (k, v) in &p.headers {
                rb = rb.header(k, v);
            }
            rb.json(&body)
        })
        .await?;

        // Reconstrucción de bloques (texto, thinking con firma, tool_use) para devolverlos intactos.
        let mut blocks: Vec<Value> = Vec::new();
        let mut index_pos: HashMap<u64, usize> = HashMap::new();
        let mut partial: HashMap<usize, String> = HashMap::new();
        let mut stop_reason = String::new();
        let mut stop_category = String::new();
        let mut round_text = String::new();
        let mut first_text = true;
        let needs_sep = !result.text.is_empty();

        for_each_sse(res, |ev| {
            match ev["type"].as_str().unwrap_or("") {
                "message_start" => {
                    let u = &ev["message"]["usage"];
                    result.usage.input += u["input_tokens"].as_u64().unwrap_or(0);
                    result.usage.cache_read += u["cache_read_input_tokens"].as_u64().unwrap_or(0);
                    result.usage.cache_write += u["cache_creation_input_tokens"].as_u64().unwrap_or(0);
                    if let Some(m) = ev["message"]["model"].as_str() {
                        result.model = m.to_string();
                    }
                }
                "content_block_start" => {
                    let idx = ev["index"].as_u64().unwrap_or(0);
                    index_pos.insert(idx, blocks.len());
                    blocks.push(ev["content_block"].clone());
                }
                "content_block_delta" => {
                    let idx = ev["index"].as_u64().unwrap_or(0);
                    let Some(&pos) = index_pos.get(&idx) else { return Ok(()) };
                    let d = &ev["delta"];
                    match d["type"].as_str().unwrap_or("") {
                        "text_delta" => {
                            let t = d["text"].as_str().unwrap_or("");
                            if first_text && needs_sep {
                                sink.text("\n\n");
                                round_text.push_str("\n\n");
                            }
                            first_text = false;
                            sink.text(t);
                            round_text.push_str(t);
                            let cur = blocks[pos]["text"].as_str().unwrap_or("").to_string();
                            blocks[pos]["text"] = json!(cur + t);
                        }
                        "thinking_delta" => {
                            let cur = blocks[pos]["thinking"].as_str().unwrap_or("").to_string();
                            blocks[pos]["thinking"] = json!(cur + d["thinking"].as_str().unwrap_or(""));
                        }
                        "signature_delta" => {
                            let cur = blocks[pos]["signature"].as_str().unwrap_or("").to_string();
                            blocks[pos]["signature"] = json!(cur + d["signature"].as_str().unwrap_or(""));
                        }
                        "input_json_delta" => {
                            partial.entry(pos).or_default().push_str(d["partial_json"].as_str().unwrap_or(""));
                        }
                        _ => {}
                    }
                }
                "message_delta" => {
                    if let Some(s) = ev["delta"]["stop_reason"].as_str() {
                        stop_reason = s.to_string();
                    }
                    if let Some(c) = ev["delta"]["stop_details"]["category"].as_str() {
                        stop_category = c.to_string();
                    }
                    if let Some(o) = ev["usage"]["output_tokens"].as_u64() {
                        result.usage.output += o;
                    }
                }
                "error" => anyhow::bail!("Anthropic: {}", ev["error"]["message"].as_str().unwrap_or("error en streaming")),
                _ => {}
            }
            Ok(())
        })
        .await?;
        result.text.push_str(&round_text);

        // Herramientas solicitadas
        let mut calls = Vec::new();
        for (pos, b) in blocks.iter_mut().enumerate() {
            if b["type"] == "server_tool_use" {
                let raw = partial.remove(&pos).unwrap_or_default();
                let input = serde_json::from_str::<Value>(&raw).unwrap_or(json!({}));
                sink.tool(b["name"].as_str().unwrap_or("web_search"), &input);
                result.tool_log.push(ToolCallLog { name: b["name"].as_str().unwrap_or("").into(), input: raw.chars().take(300).collect(), result: "(búsqueda en el servidor)".into() });
                b["input"] = input;
                continue;
            }
            if b["type"] == "tool_use" {
                let raw = partial.remove(&pos).unwrap_or_default();
                let (input, valid) = if raw.trim().is_empty() {
                    (json!({}), true)
                } else {
                    match serde_json::from_str::<Value>(&raw) {
                        Ok(v) if v.is_object() => (v, true),
                        _ => (json!({}), false),
                    }
                };
                b["input"] = input.clone();
                calls.push((b["id"].as_str().unwrap_or("").to_string(), b["name"].as_str().unwrap_or("").to_string(), input, valid));
            }
        }

        if stop_reason == "tool_use" && !calls.is_empty() && round < max_rounds {
            let results = run_tools(calls, &exec, sink, &mut result.tool_log).await;
            msgs.push(json!({"role":"assistant","content": blocks}));
            let content: Vec<Value> = results
                .into_iter()
                .map(|(id, r, err)| {
                    let mut v = json!({"type":"tool_result","tool_use_id": id, "content": r});
                    if err {
                        v["is_error"] = json!(true);
                    }
                    v
                })
                .collect();
            msgs.push(json!({"role":"user","content": content}));
            continue;
        }
        // La búsqueda web del servidor puede pausar el turno: se reenvía para que continúe.
        if stop_reason == "pause_turn" && round < max_rounds {
            msgs.push(json!({"role":"assistant","content": blocks}));
            continue;
        }

        let note = match stop_reason.as_str() {
            "refusal" => format!("\n\n> ⚠️ El modelo rechazó la petición ({}).", if stop_category.is_empty() { "sin categoría" } else { &stop_category }),
            "max_tokens" => "\n\n> ⚠️ Respuesta cortada por límite de tokens.".into(),
            "tool_use" => "\n\n> ⚠️ Se alcanzó el máximo de rondas de herramientas.".into(),
            _ => String::new(),
        };
        if !note.is_empty() {
            sink.text(&note);
            result.text.push_str(&note);
        }
        break;
    }
    Ok(result)
}

// ---------------- Compatible con OpenAI (OpenRouter, LiteLLM, Ollama…) ----------------

async fn openai(http: &reqwest::Client, pid: &str, p: &Provider, model: &str, req: LlmRequest, sink: &dyn Sink, exec: Option<ToolExec>) -> anyhow::Result<LlmResult> {
    let key = api_key(pid, p).unwrap_or_default();
    let url = format!("{}/chat/completions", p.base_url.trim_end_matches('/'));
    let sys = if req.volatile.is_empty() { req.stable.clone() } else { format!("{}\n\n{}", req.stable, req.volatile) };
    let mut msgs: Vec<Value> = vec![json!({"role":"system","content": sys})];
    msgs.extend(req.messages.iter().map(|(r, c)| json!({"role": r, "content": c})));
    let mut tools: Vec<Value> = req
        .tools
        .iter()
        .map(|t| json!({"type":"function","function":{"name": t["name"], "description": t["description"], "parameters": t["input_schema"]}}))
        .collect();
    let mut result = LlmResult { provider: pid.into(), model: model.into(), ..Default::default() };

    let mut round = 0;
    while round <= req.max_rounds {
        let mut body = json!({"model": model, "messages": msgs, "stream": true, "stream_options": {"include_usage": true}});
        if req.max_tokens > 0 {
            body["max_tokens"] = json!(req.max_tokens);
        }
        if !tools.is_empty() {
            body["tools"] = json!(tools);
        }
        let res = send_with_retry(|| {
            let mut rb = http.post(&url).header("content-type", "application/json");
            if !key.is_empty() {
                rb = rb.bearer_auth(&key);
            }
            for (k, v) in &p.headers {
                rb = rb.header(k, v);
            }
            rb.json(&body)
        })
        .await;
        let res = match res {
            Ok(r) => r,
            // Algunos modelos no soportan herramientas: reintenta sin ellas.
            Err(e) if !tools.is_empty() && e.to_string().contains("HTTP 4") => {
                tools.clear();
                continue;
            }
            Err(e) => anyhow::bail!("{}: {e}", p.label),
        };

        let mut text = String::new();
        let mut finish = String::new();
        let mut calls: Vec<(String, String, String)> = Vec::new(); // id, nombre, args
        let mut usage_seen = false;
        let needs_sep = !result.text.is_empty();
        let mut first = true;
        for_each_sse(res, |ev| {
            if let Some(ch) = ev["choices"].get(0) {
                if let Some(t) = ch["delta"]["content"].as_str() {
                    if !t.is_empty() {
                        if first && needs_sep {
                            sink.text("\n\n");
                            text.push_str("\n\n");
                        }
                        first = false;
                        sink.text(t);
                        text.push_str(t);
                    }
                }
                if let Some(tcs) = ch["delta"]["tool_calls"].as_array() {
                    for tc in tcs {
                        let i = tc["index"].as_u64().unwrap_or(0) as usize;
                        while calls.len() <= i {
                            calls.push(Default::default());
                        }
                        if let Some(id) = tc["id"].as_str() {
                            calls[i].0 = id.to_string();
                        }
                        if let Some(n) = tc["function"]["name"].as_str() {
                            calls[i].1.push_str(n);
                        }
                        if let Some(a) = tc["function"]["arguments"].as_str() {
                            calls[i].2.push_str(a);
                        }
                    }
                }
                if let Some(f) = ch["finish_reason"].as_str() {
                    finish = f.to_string();
                }
            }
            if ev["usage"].is_object() {
                usage_seen = true;
                result.usage.input += ev["usage"]["prompt_tokens"].as_u64().unwrap_or(0);
                result.usage.output += ev["usage"]["completion_tokens"].as_u64().unwrap_or(0);
                result.usage.cache_read += ev["usage"]["prompt_tokens_details"]["cached_tokens"].as_u64().unwrap_or(0);
            }
            if let Some(m) = ev["model"].as_str() {
                result.model = m.to_string();
            }
            Ok(())
        })
        .await?;
        if !usage_seen {
            result.usage.input += estimate_tokens(&serde_json::to_string(&msgs).unwrap_or_default()) as u64;
            result.usage.output += estimate_tokens(&text) as u64;
        }
        result.text.push_str(&text);

        if !calls.is_empty() && (finish == "tool_calls" || finish.is_empty()) && round < req.max_rounds {
            let parsed: Vec<(String, String, Value, bool)> = calls
                .iter()
                .map(|(id, n, a)| match serde_json::from_str::<Value>(if a.trim().is_empty() { "{}" } else { a }) {
                    Ok(v) if v.is_object() => (id.clone(), n.clone(), v, true),
                    _ => (id.clone(), n.clone(), json!({}), false),
                })
                .collect();
            msgs.push(json!({"role":"assistant","content": if text.is_empty() { Value::Null } else { json!(text) },
                "tool_calls": calls.iter().map(|(id, n, a)| json!({"id": id, "type":"function","function":{"name": n, "arguments": a}})).collect::<Vec<_>>()}));
            for (id, r, _) in run_tools(parsed, &exec, sink, &mut result.tool_log).await {
                msgs.push(json!({"role":"tool","tool_call_id": id, "content": r}));
            }
            round += 1;
            continue;
        }
        if finish == "length" {
            let n = "\n\n> ⚠️ Respuesta cortada por límite de tokens.";
            sink.text(n);
            result.text.push_str(n);
        }
        break;
    }
    Ok(result)
}

// ---------------- Claude Code (suscripción de Claude del usuario) ----------------
//
// faisp no gestiona credenciales de claude.ai: ejecuta el Claude Code instalado en este PC,
// con la sesión que el propio usuario inició ("claude auth login"). Consume de su plan.

pub fn claude_code_args(model: &str, req: &LlmRequest, has_cwd: bool) -> Vec<String> {
    let mut a: Vec<String> = ["-p", "--output-format", "stream-json", "--verbose", "--include-partial-messages", "--no-session-persistence", "--model", model]
        .iter().map(|s| s.to_string()).collect();
    if !req.effort.is_empty() {
        a.extend(["--effort".into(), req.effort.clone()]);
    }
    let system: String = req.stable.chars().take(24000).collect();
    a.extend(["--system-prompt".into(), system]);
    let mut tools: Vec<&str> = Vec::new();
    if has_cwd {
        tools.extend(["Read", "Glob", "Grep"]);
        match req.mode.as_str() {
            "auto" | "acceptEdits" => tools.extend(["Edit", "Write"]),
            "bypass" => tools.extend(["Edit", "Write", "Bash"]),
            _ => {}
        }
    }
    if req.web_search {
        tools.extend(["WebSearch", "WebFetch"]);
    }
    a.extend(["--tools".into(), tools.join(",")]);
    let pm = match req.mode.as_str() {
        "plan" => "plan",
        "acceptEdits" => "acceptEdits",
        "bypass" => "bypassPermissions",
        "manual" => "dontAsk",
        _ => "auto",
    };
    a.extend(["--permission-mode".into(), pm.into()]);
    a.push("--strict-mcp-config".into());
    if let Some(c) = &req.mcp_config {
        a.extend(["--mcp-config".into(), c.clone()]);
        if !req.mcp_allow.is_empty() {
            a.push("--allowedTools".into());
            a.extend(req.mcp_allow.iter().cloned());
        }
    }
    a
}

async fn claude_code(pid: &str, p: &Provider, model: &str, req: LlmRequest, sink: &dyn Sink) -> anyhow::Result<LlmResult> {
    use tokio::io::{AsyncBufReadExt, AsyncWriteExt};
    let exe = crate::integrations::find_claude_code(&p.base_url).ok_or_else(|| anyhow::anyhow!("No encuentro Claude Code en este PC. Instálalo o indica la ruta de claude.exe en Ajustes."))?;
    let cwd = req.cwd.clone().filter(|c| std::path::Path::new(c).is_dir());
    let args = claude_code_args(model, &req, cwd.is_some());
    // El contexto volátil y la conversación van por stdin (sin límite de longitud de la línea de órdenes).
    let mut prompt = String::new();
    if !req.volatile.is_empty() {
        prompt.push_str("<contexto>\n");
        prompt.push_str(&req.volatile);
        prompt.push_str("\n</contexto>\n\n");
    }
    let n = req.messages.len();
    for (i, (role, content)) in req.messages.iter().enumerate() {
        if i + 1 == n {
            prompt.push_str(content);
        } else {
            prompt.push_str(&format!("{}: {}\n\n", if role == "user" { "Usuario" } else { "Asistente" }, content));
        }
    }
    let mut cmd = tokio::process::Command::new(&exe);
    cmd.args(&args).stdin(std::process::Stdio::piped()).stdout(std::process::Stdio::piped()).stderr(std::process::Stdio::piped()).kill_on_drop(true);
    cmd.current_dir(cwd.clone().unwrap_or_else(|| std::env::temp_dir().to_string_lossy().into()));
    #[cfg(windows)]
    cmd.creation_flags(0x0800_0000);
    let mut child = cmd.spawn().map_err(|e| anyhow::anyhow!("No se pudo ejecutar Claude Code: {e}"))?;
    {
        let mut stdin = child.stdin.take().unwrap();
        stdin.write_all(prompt.as_bytes()).await?;
        stdin.shutdown().await?;
    }
    let stdout = child.stdout.take().unwrap();
    let mut lines = tokio::io::BufReader::new(stdout).lines();
    let mut result = LlmResult { provider: pid.into(), model: model.into(), ..Default::default() };
    let mut streamed = String::new();
    let mut final_text = String::new();
    let mut error: Option<String> = None;
    while let Some(line) = lines.next_line().await? {
        let Ok(ev) = serde_json::from_str::<Value>(&line) else { continue };
        match ev["type"].as_str().unwrap_or("") {
            "system" if ev["subtype"] == "init" => {
                if let Some(m) = ev["model"].as_str() {
                    result.model = m.into();
                }
            }
            "stream_event" => {
                let e = &ev["event"];
                if e["type"] == "message_start" && !streamed.is_empty() && !streamed.ends_with('\n') {
                    sink.text("\n\n");
                    streamed.push_str("\n\n");
                }
                if e["type"] == "content_block_delta" && e["delta"]["type"] == "text_delta" {
                    let t = e["delta"]["text"].as_str().unwrap_or("");
                    sink.text(t);
                    streamed.push_str(t);
                }
            }
            "assistant" => {
                for b in ev["message"]["content"].as_array().cloned().unwrap_or_default() {
                    if b["type"] == "tool_use" {
                        let name = b["name"].as_str().unwrap_or("").to_string();
                        sink.tool(&name, &b["input"]);
                        result.tool_log.push(ToolCallLog { name, input: b["input"].to_string().chars().take(300).collect(), result: String::new() });
                    }
                }
            }
            "result" => {
                final_text = ev["result"].as_str().unwrap_or("").to_string();
                let u = &ev["usage"];
                result.usage = TokenUsage {
                    input: u["input_tokens"].as_u64().unwrap_or(0),
                    output: u["output_tokens"].as_u64().unwrap_or(0),
                    cache_read: u["cache_read_input_tokens"].as_u64().unwrap_or(0),
                    cache_write: u["cache_creation_input_tokens"].as_u64().unwrap_or(0),
                };
                if ev["is_error"].as_bool().unwrap_or(false) {
                    error = Some(final_text.clone());
                }
            }
            _ => {}
        }
    }
    let status = child.wait().await?;
    if let Some(e) = error {
        if streamed.is_empty() {
            anyhow::bail!("Claude Code: {}", e.chars().take(400).collect::<String>());
        }
    }
    if streamed.is_empty() && !final_text.is_empty() {
        sink.text(&final_text);
        streamed = final_text;
    }
    if streamed.is_empty() && !status.success() {
        let mut err = String::new();
        if let Some(mut se) = child.stderr.take() {
            use tokio::io::AsyncReadExt;
            let _ = se.read_to_string(&mut err).await;
        }
        anyhow::bail!("Claude Code terminó con error: {}", err.chars().take(400).collect::<String>());
    }
    result.text = streamed;
    Ok(result)
}

// ---------------- Responses API (búsqueda web en xAI Grok) ----------------

async fn responses(http: &reqwest::Client, pid: &str, p: &Provider, model: &str, req: LlmRequest, sink: &dyn Sink) -> anyhow::Result<LlmResult> {
    let key = api_key(pid, p).unwrap_or_default();
    let url = format!("{}/responses", p.base_url.trim_end_matches('/'));
    let sys = if req.volatile.is_empty() { req.stable.clone() } else { format!("{}\n\n{}", req.stable, req.volatile) };
    let mut input = vec![json!({"role":"system","content": sys})];
    input.extend(req.messages.iter().map(|(r, c)| json!({"role": r, "content": c})));
    let body = json!({"model": model, "input": input, "tools": [{"type": "web_search"}]});
    sink.tool("web_search", &json!({"proveedor": p.label}));
    let res = send_with_retry(|| {
        let mut rb = http.post(&url).header("content-type", "application/json");
        if !key.is_empty() {
            rb = rb.bearer_auth(&key);
        }
        rb.json(&body)
    })
    .await?;
    let v: Value = res.json().await?;
    let mut text = String::new();
    let mut log = Vec::new();
    for item in v["output"].as_array().cloned().unwrap_or_default() {
        match item["type"].as_str().unwrap_or("") {
            "message" => {
                for c in item["content"].as_array().cloned().unwrap_or_default() {
                    if let Some(t) = c["text"].as_str() {
                        text.push_str(t);
                    }
                    // Enlaces citados
                    for a in c["annotations"].as_array().cloned().unwrap_or_default() {
                        if let (Some(u), Some(t)) = (a["url"].as_str(), a["title"].as_str()) {
                            log.push(ToolCallLog { name: "fuente".into(), input: t.chars().take(120).collect(), result: u.into() });
                        }
                    }
                }
            }
            "web_search_call" => log.push(ToolCallLog { name: "web_search".into(), input: item["action"].to_string().chars().take(300).collect(), result: String::new() }),
            _ => {}
        }
    }
    sink.text(&text);
    Ok(LlmResult {
        text,
        provider: pid.into(),
        model: v["model"].as_str().unwrap_or(model).into(),
        demo: false,
        usage: TokenUsage {
            input: v["usage"]["input_tokens"].as_u64().unwrap_or(0),
            output: v["usage"]["output_tokens"].as_u64().unwrap_or(0),
            cache_read: v["usage"]["input_tokens_details"]["cached_tokens"].as_u64().unwrap_or(0),
            cache_write: 0,
        },
        tool_log: log,
    })
}

// ---------------- Demo ----------------

async fn demo(req: &LlmRequest, pid: &str, model: &str, reason: &str, sink: &dyn Sink) -> LlmResult {
    let ask = req.messages.last().map(|m| m.1.clone()).unwrap_or_default();
    let ctx = estimate_tokens(&req.stable) + estimate_tokens(&req.volatile) + estimate_tokens(&ask);
    let shown: String = ask.chars().take(300).collect();
    let text = format!(
        "*(modo demo — {reason}; añade la clave en Ajustes para respuestas reales)*\n\nRecibí la tarea con **~{ctx} tokens** de contexto. Modelo previsto: `{pid}:{model}`{}.\n\n> {shown}{}",
        if req.tools.is_empty() { String::new() } else { format!(", con {} herramientas de proyecto", req.tools.len()) } + if req.web_search { " y búsqueda web" } else { "" },
        if ask.chars().count() > 300 { "…" } else { "" }
    );
    let chars: Vec<char> = text.chars().collect();
    for chunk in chars.chunks(14) {
        sink.text(&chunk.iter().collect::<String>());
        tokio::time::sleep(Duration::from_millis(10)).await;
    }
    LlmResult { text, provider: pid.into(), model: model.into(), demo: true, ..Default::default() }
}
