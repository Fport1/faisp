//! Cliente MCP (Model Context Protocol) por stdio: arranca servidores MCP locales y expone sus
//! herramientas a los agentes. Así faisp puede usar el sistema de IA del Modpack Launcher y
//! cualquier otro servidor MCP (los mismos que usan Claude Code, Cursor, Gemini CLI…).
use crate::store::McpServerCfg;
use serde_json::{json, Value};
use std::collections::HashMap;
use std::process::Stdio;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::sync::oneshot;

pub struct McpClient {
    stdin: tokio::sync::Mutex<tokio::process::ChildStdin>,
    pending: Mutex<HashMap<u64, oneshot::Sender<Value>>>,
    next: AtomicU64,
    alive: Arc<AtomicBool>,
    tools: std::sync::RwLock<Vec<Value>>,
    server_info: std::sync::RwLock<Value>,
    stderr_tail: Arc<Mutex<Vec<String>>>,
    _child: Mutex<tokio::process::Child>,
}

impl McpClient {
    async fn start(cfg: &McpServerCfg) -> anyhow::Result<Arc<Self>> {
        let mut cmd = tokio::process::Command::new(&cfg.command);
        cmd.args(&cfg.args).envs(&cfg.env).stdin(Stdio::piped()).stdout(Stdio::piped()).stderr(Stdio::piped()).kill_on_drop(true);
        if !cfg.cwd.is_empty() {
            cmd.current_dir(&cfg.cwd);
        }
        #[cfg(windows)]
        cmd.creation_flags(0x0800_0000);
        let mut child = cmd.spawn().map_err(|e| anyhow::anyhow!("No se pudo arrancar \"{}\": {e}", cfg.command))?;
        let stdin = child.stdin.take().unwrap();
        let stdout = child.stdout.take().unwrap();
        let stderr = child.stderr.take().unwrap();
        let alive = Arc::new(AtomicBool::new(true));
        let stderr_tail = Arc::new(Mutex::new(Vec::new()));

        let client = Arc::new(Self {
            stdin: tokio::sync::Mutex::new(stdin),
            pending: Mutex::new(HashMap::new()),
            next: AtomicU64::new(1),
            alive: alive.clone(),
            tools: Default::default(),
            server_info: Default::default(),
            stderr_tail: stderr_tail.clone(),
            _child: Mutex::new(child),
        });

        // stderr: se guarda la cola para diagnosticar
        tokio::spawn(async move {
            let mut lines = BufReader::new(stderr).lines();
            while let Ok(Some(l)) = lines.next_line().await {
                let mut t = stderr_tail.lock().unwrap();
                t.push(l);
                let n = t.len();
                if n > 30 {
                    t.drain(..n - 30);
                }
            }
        });
        // stdout: mensajes JSON-RPC, uno por línea
        let weak = Arc::downgrade(&client);
        tokio::spawn(async move {
            let mut lines = BufReader::new(stdout).lines();
            while let Ok(Some(line)) = lines.next_line().await {
                let Some(c) = weak.upgrade() else { break };
                let Ok(msg) = serde_json::from_str::<Value>(line.trim()) else { continue };
                if msg.get("method").is_some() {
                    // Petición del servidor al cliente (roots, sampling…): no soportado.
                    if let Some(id) = msg.get("id") {
                        let _ = c.send(&json!({"jsonrpc":"2.0","id": id, "error": {"code": -32601, "message": "No soportado por faisp"}})).await;
                    }
                    continue;
                }
                if let Some(id) = msg.get("id").and_then(|v| v.as_u64()) {
                    if let Some(tx) = c.pending.lock().unwrap().remove(&id) {
                        let _ = tx.send(msg);
                    }
                }
            }
            alive.store(false, Ordering::Relaxed);
            if let Some(c) = weak.upgrade() {
                c.pending.lock().unwrap().clear();
            }
        });

        let init = client
            .request("initialize", json!({"protocolVersion": "2025-06-18", "capabilities": {}, "clientInfo": {"name": "faisp", "version": env!("CARGO_PKG_VERSION")}}), Duration::from_secs(30))
            .await?;
        client.send(&json!({"jsonrpc":"2.0","method":"notifications/initialized"})).await?;
        let mut tools = Vec::new();
        let mut cursor: Option<String> = None;
        loop {
            let params = match &cursor {
                Some(c) => json!({"cursor": c}),
                None => json!({}),
            };
            let r = client.request("tools/list", params, Duration::from_secs(30)).await?;
            tools.extend(r["tools"].as_array().cloned().unwrap_or_default());
            cursor = r["nextCursor"].as_str().map(String::from);
            if cursor.is_none() {
                break;
            }
        }
        *client.tools.write().unwrap() = tools;
        *client.server_info.write().unwrap() = init["serverInfo"].clone();
        Ok(client)
    }

    async fn send(&self, v: &Value) -> anyhow::Result<()> {
        let mut s = self.stdin.lock().await;
        s.write_all(format!("{}\n", v).as_bytes()).await?;
        s.flush().await?;
        Ok(())
    }

    pub async fn request(&self, method: &str, params: Value, timeout: Duration) -> anyhow::Result<Value> {
        if !self.alive.load(Ordering::Relaxed) {
            anyhow::bail!("El servidor MCP se cerró. {}", self.stderr());
        }
        let id = self.next.fetch_add(1, Ordering::Relaxed);
        let (tx, rx) = oneshot::channel();
        self.pending.lock().unwrap().insert(id, tx);
        self.send(&json!({"jsonrpc":"2.0","id": id, "method": method, "params": params})).await?;
        let msg = match tokio::time::timeout(timeout, rx).await {
            Ok(Ok(m)) => m,
            Ok(Err(_)) => anyhow::bail!("El servidor MCP se cerró. {}", self.stderr()),
            Err(_) => {
                self.pending.lock().unwrap().remove(&id);
                anyhow::bail!("Tiempo de espera agotado en {method}");
            }
        };
        if let Some(e) = msg.get("error") {
            anyhow::bail!("{}", e["message"].as_str().unwrap_or("error MCP"));
        }
        Ok(msg["result"].clone())
    }

    pub fn tools(&self) -> Vec<Value> {
        self.tools.read().unwrap().clone()
    }

    pub fn server_info(&self) -> Value {
        self.server_info.read().unwrap().clone()
    }

    pub fn alive(&self) -> bool {
        self.alive.load(Ordering::Relaxed)
    }

    fn stderr(&self) -> String {
        self.stderr_tail.lock().unwrap().iter().rev().take(4).rev().cloned().collect::<Vec<_>>().join(" | ")
    }

    /// Ejecuta una herramienta. Devuelve (texto, es_error).
    pub async fn call(&self, tool: &str, args: Value) -> (String, bool) {
        match self.request("tools/call", json!({"name": tool, "arguments": args}), Duration::from_secs(600)).await {
            Ok(r) => {
                let mut out = Vec::new();
                for c in r["content"].as_array().cloned().unwrap_or_default() {
                    match c["type"].as_str().unwrap_or("") {
                        "text" => out.push(c["text"].as_str().unwrap_or("").to_string()),
                        "image" => out.push(format!("[imagen {}]", c["mimeType"].as_str().unwrap_or(""))),
                        "resource" => out.push(c["resource"]["text"].as_str().unwrap_or("[recurso]").to_string()),
                        other => out.push(format!("[{other}]")),
                    }
                }
                if out.is_empty() && !r["structuredContent"].is_null() {
                    out.push(r["structuredContent"].to_string());
                }
                (out.join("\n"), r["isError"].as_bool().unwrap_or(false))
            }
            Err(e) => (format!("Error MCP: {e}"), true),
        }
    }
}

#[derive(Default)]
pub struct McpManager {
    clients: tokio::sync::Mutex<HashMap<String, Arc<McpClient>>>,
}

impl McpManager {
    pub async fn get(&self, name: &str, cfg: &McpServerCfg) -> anyhow::Result<Arc<McpClient>> {
        let mut m = self.clients.lock().await;
        if let Some(c) = m.get(name) {
            if c.alive() {
                return Ok(c.clone());
            }
        }
        let c = McpClient::start(cfg).await?;
        m.insert(name.to_string(), c.clone());
        Ok(c)
    }

    pub async fn stop(&self, name: &str) {
        self.clients.lock().await.remove(name);
    }

    pub async fn status(&self) -> HashMap<String, (bool, usize)> {
        self.clients.lock().await.iter().map(|(k, c)| (k.clone(), (c.alive(), c.tools.read().unwrap().len()))).collect()
    }
}

/// Nombre de herramienta válido para los modelos: ^[a-zA-Z0-9_-]{1,64}$
pub fn tool_name(server: &str, tool: &str) -> String {
    let raw = format!("mcp__{server}__{tool}");
    let s: String = raw.chars().map(|c| if c.is_ascii_alphanumeric() || c == '_' || c == '-' { c } else { '_' }).collect();
    s.chars().take(64).collect()
}

/// ¿La herramienta solo lee? (anotación readOnlyHint del servidor o lista "autoAllow" del usuario)
pub fn is_read_only(cfg: &McpServerCfg, tool: &Value) -> bool {
    let name = tool["name"].as_str().unwrap_or("");
    cfg.auto_allow.iter().any(|a| a == name || a.ends_with(&format!("__{name}"))) || tool["annotations"]["readOnlyHint"].as_bool().unwrap_or(false)
}
