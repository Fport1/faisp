//! Servidores MCP remotos (Streamable HTTP) y autorización OAuth 2.1 con PKCE, como los
//! conectores de Claude. Identificación del cliente: documento de metadatos (CIMD) publicado en
//! la web de faisp o, si el servidor no lo admite, registro dinámico (DCR).
use crate::store::{McpServerCfg, OAuthTokens};
use base64::Engine;
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Mutex, RwLock};
use std::time::Duration;

pub const CIMD_URL: &str = "https://faisp.vercel.app/oauth/client-metadata.json";
pub const REDIRECT: &str = "http://127.0.0.1:4317/oauth/callback";

pub struct HttpMcp {
    http: reqwest::Client,
    url: String,
    headers: Vec<(String, String)>,
    token: RwLock<String>,
    session: RwLock<Option<String>>,
    next: AtomicU64,
    alive: AtomicBool,
    tools: RwLock<Vec<Value>>,
    info: RwLock<Value>,
}

/// Token Bearer para un servidor: fijo, por orden (gh auth token) u OAuth (refrescado si caducó).
pub async fn bearer(http: &reqwest::Client, cfg: &mut McpServerCfg) -> anyhow::Result<(String, bool)> {
    if !cfg.token.is_empty() {
        return Ok((cfg.token.clone(), false));
    }
    if !cfg.token_command.is_empty() {
        let mut parts = cfg.token_command.split_whitespace();
        let prog = parts.next().unwrap_or("");
        let mut cmd = tokio::process::Command::new(prog);
        cmd.args(parts);
        #[cfg(windows)]
        cmd.creation_flags(0x0800_0000);
        let out = cmd.output().await.map_err(|e| anyhow::anyhow!("No se pudo ejecutar «{}»: {e}", cfg.token_command))?;
        let t = String::from_utf8_lossy(&out.stdout).trim().to_string();
        if t.is_empty() {
            anyhow::bail!("«{}» no devolvió un token. ¿Has iniciado sesión?", cfg.token_command);
        }
        return Ok((t, false));
    }
    let Some(o) = cfg.oauth.clone() else { return Ok((String::new(), false)) };
    if o.expires_at == 0 || o.expires_at > chrono::Utc::now().timestamp() + 60 || o.refresh_token.is_empty() {
        return Ok((o.access_token, false));
    }
    // Refrescar
    let mut form = vec![("grant_type", "refresh_token".to_string()), ("refresh_token", o.refresh_token.clone()), ("client_id", o.client_id.clone())];
    if !o.resource.is_empty() {
        form.push(("resource", o.resource.clone()));
    }
    if !cfg.oauth_client_secret.is_empty() {
        form.push(("client_secret", cfg.oauth_client_secret.clone()));
    }
    let v: Value = http.post(&o.token_endpoint).form(&form).send().await?.json().await?;
    if let Some(at) = v["access_token"].as_str() {
        let mut n = o.clone();
        n.access_token = at.into();
        if let Some(rt) = v["refresh_token"].as_str() {
            n.refresh_token = rt.into();
        }
        n.expires_at = v["expires_in"].as_i64().map(|s| chrono::Utc::now().timestamp() + s).unwrap_or(0);
        cfg.oauth = Some(n.clone());
        return Ok((n.access_token, true));
    }
    anyhow::bail!("La sesión del conector caducó; vuelve a conectarlo ({})", v["error"].as_str().unwrap_or("sin detalle"))
}

impl HttpMcp {
    pub async fn connect(http: &reqwest::Client, cfg: &McpServerCfg, token: String) -> anyhow::Result<Self> {
        let c = Self {
            http: http.clone(),
            url: cfg.url.clone(),
            headers: cfg.headers.iter().map(|(k, v)| (k.clone(), v.clone())).collect(),
            token: RwLock::new(token),
            session: RwLock::new(None),
            next: AtomicU64::new(1),
            alive: AtomicBool::new(true),
            tools: Default::default(),
            info: Default::default(),
        };
        let init = c.request("initialize", json!({"protocolVersion": "2025-06-18", "capabilities": {}, "clientInfo": {"name": "faisp", "version": env!("CARGO_PKG_VERSION")}}), Duration::from_secs(30)).await?;
        *c.info.write().unwrap() = init["serverInfo"].clone();
        let _ = c.post(&json!({"jsonrpc":"2.0","method":"notifications/initialized"}), Duration::from_secs(15)).await;
        let mut tools = Vec::new();
        let mut cursor: Option<String> = None;
        loop {
            let params = cursor.as_ref().map(|c| json!({"cursor": c})).unwrap_or(json!({}));
            let r = c.request("tools/list", params, Duration::from_secs(30)).await?;
            tools.extend(r["tools"].as_array().cloned().unwrap_or_default());
            cursor = r["nextCursor"].as_str().map(String::from);
            if cursor.is_none() {
                break;
            }
        }
        *c.tools.write().unwrap() = tools;
        Ok(c)
    }

    async fn post(&self, body: &Value, timeout: Duration) -> anyhow::Result<reqwest::Response> {
        let mut rb = self.http.post(&self.url).timeout(timeout).header("Accept", "application/json, text/event-stream").header("Content-Type", "application/json").header("MCP-Protocol-Version", "2025-06-18");
        let tok = self.token.read().unwrap().clone();
        if !tok.is_empty() {
            rb = rb.bearer_auth(tok);
        }
        if let Some(s) = self.session.read().unwrap().clone() {
            rb = rb.header("Mcp-Session-Id", s);
        }
        for (k, v) in &self.headers {
            rb = rb.header(k, v);
        }
        let res = rb.json(body).send().await?;
        if let Some(s) = res.headers().get("mcp-session-id").and_then(|v| v.to_str().ok()) {
            *self.session.write().unwrap() = Some(s.to_string());
        }
        if res.status().as_u16() == 401 {
            anyhow::bail!("NO_AUTORIZADO: el conector necesita iniciar sesión");
        }
        if !res.status().is_success() {
            let s = res.status();
            anyhow::bail!("HTTP {s}: {}", res.text().await.unwrap_or_default().chars().take(300).collect::<String>());
        }
        Ok(res)
    }

    pub async fn request(&self, method: &str, params: Value, timeout: Duration) -> anyhow::Result<Value> {
        let id = self.next.fetch_add(1, Ordering::Relaxed);
        let res = self.post(&json!({"jsonrpc":"2.0","id": id, "method": method, "params": params}), timeout).await?;
        let ctype = res.headers().get("content-type").and_then(|v| v.to_str().ok()).unwrap_or("").to_string();
        let text = res.text().await?;
        let msg: Value = if ctype.contains("text/event-stream") {
            text.lines()
                .filter_map(|l| l.strip_prefix("data:"))
                .filter_map(|d| serde_json::from_str::<Value>(d.trim()).ok())
                .find(|m| m["id"].as_u64() == Some(id))
                .ok_or_else(|| anyhow::anyhow!("Respuesta SSE sin resultado para {method}"))?
        } else {
            serde_json::from_str(&text)?
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
        self.info.read().unwrap().clone()
    }
    pub fn alive(&self) -> bool {
        self.alive.load(Ordering::Relaxed)
    }

    pub async fn call(&self, tool: &str, args: Value) -> (String, bool) {
        match self.request("tools/call", json!({"name": tool, "arguments": args}), Duration::from_secs(300)).await {
            Ok(r) => crate::mcp::content_to_text(&r),
            Err(e) => {
                if e.to_string().starts_with("NO_AUTORIZADO") {
                    self.alive.store(false, Ordering::Relaxed);
                }
                (format!("Error MCP: {e}"), true)
            }
        }
    }
}

// ---------------- OAuth ----------------

pub struct PendingAuth {
    pub server: String,
    pub verifier: String,
    pub client_id: String,
    pub token_endpoint: String,
    pub resource: String,
}

#[derive(Default)]
pub struct OAuthPending(pub Mutex<HashMap<String, PendingAuth>>);

fn b64(bytes: &[u8]) -> String {
    base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(bytes)
}

fn random_token() -> String {
    let bytes: [u8; 32] = rand::random();
    b64(&bytes)
}

async fn get_json(http: &reqwest::Client, url: &str) -> Option<Value> {
    let r = http.get(url).timeout(Duration::from_secs(15)).send().await.ok()?;
    if !r.status().is_success() {
        return None;
    }
    r.json().await.ok()
}

/// Prepara la autorización y devuelve la URL a abrir en el navegador.
pub async fn begin(http: &reqwest::Client, server: &str, cfg: &McpServerCfg, pending: &OAuthPending) -> anyhow::Result<String> {
    let mcp = reqwest::Url::parse(&cfg.url)?;
    let origin = format!("{}://{}", mcp.scheme(), mcp.host_str().unwrap_or(""));
    let origin = match mcp.port() {
        Some(p) => format!("{origin}:{p}"),
        None => origin,
    };
    // 1) Metadatos del recurso protegido (RFC 9728): cabecera WWW-Authenticate o ruta well-known
    let mut resource_meta: Option<Value> = None;
    if let Ok(r) = http.post(&cfg.url).header("Accept", "application/json, text/event-stream").json(&json!({"jsonrpc":"2.0","id":0,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"faisp","version":"0"}}})).send().await {
        if let Some(h) = r.headers().get("www-authenticate").and_then(|v| v.to_str().ok()) {
            if let Some(i) = h.find("resource_metadata=\"") {
                let rest = &h[i + 19..];
                if let Some(end) = rest.find('"') {
                    resource_meta = get_json(http, &rest[..end]).await;
                }
            }
        }
    }
    if resource_meta.is_none() {
        let path = mcp.path().trim_end_matches('/');
        for u in [format!("{origin}/.well-known/oauth-protected-resource{path}"), format!("{origin}/.well-known/oauth-protected-resource")] {
            if let Some(v) = get_json(http, &u).await {
                resource_meta = Some(v);
                break;
            }
        }
    }
    let rm = resource_meta.unwrap_or(json!({}));
    let resource = rm["resource"].as_str().unwrap_or(&cfg.url).to_string();
    let issuer = rm["authorization_servers"][0].as_str().unwrap_or(&origin).trim_end_matches('/').to_string();
    // 2) Metadatos del servidor de autorización (RFC 8414 / OIDC)
    let iss_url = reqwest::Url::parse(&issuer)?;
    let iss_path = iss_url.path().trim_end_matches('/');
    let iss_origin = issuer.trim_end_matches(iss_path).to_string();
    let mut asm = None;
    for u in [format!("{iss_origin}/.well-known/oauth-authorization-server{iss_path}"), format!("{issuer}/.well-known/oauth-authorization-server"), format!("{issuer}/.well-known/openid-configuration")] {
        if let Some(v) = get_json(http, &u).await {
            asm = Some(v);
            break;
        }
    }
    let asm = asm.ok_or_else(|| anyhow::anyhow!("El servidor no publica sus metadatos OAuth"))?;
    let authz = asm["authorization_endpoint"].as_str().ok_or_else(|| anyhow::anyhow!("Sin authorization_endpoint"))?.to_string();
    let token_ep = asm["token_endpoint"].as_str().ok_or_else(|| anyhow::anyhow!("Sin token_endpoint"))?.to_string();
    // 3) Cliente: propio (configurado) > CIMD > registro dinámico
    let client_id = if !cfg.oauth_client_id.is_empty() {
        cfg.oauth_client_id.clone()
    } else if asm["client_id_metadata_document_supported"].as_bool().unwrap_or(false) {
        CIMD_URL.to_string()
    } else if let Some(reg) = asm["registration_endpoint"].as_str() {
        let v: Value = http
            .post(reg)
            .json(&json!({"client_name": "faisp", "client_uri": "https://faisp.vercel.app", "redirect_uris": [REDIRECT], "grant_types": ["authorization_code", "refresh_token"], "response_types": ["code"], "token_endpoint_auth_method": "none"}))
            .send()
            .await?
            .json()
            .await?;
        v["client_id"].as_str().ok_or_else(|| anyhow::anyhow!("El registro dinámico falló: {v}"))?.to_string()
    } else {
        anyhow::bail!("Este servicio exige un cliente OAuth registrado. Indica tu client_id en el conector.")
    };
    // 4) PKCE + URL de autorización
    let verifier = random_token();
    let challenge = b64(&Sha256::digest(verifier.as_bytes()));
    let state = random_token();
    let mut url = reqwest::Url::parse(&authz)?;
    {
        let mut q = url.query_pairs_mut();
        q.append_pair("response_type", "code").append_pair("client_id", &client_id).append_pair("redirect_uri", REDIRECT)
            .append_pair("code_challenge", &challenge).append_pair("code_challenge_method", "S256").append_pair("state", &state).append_pair("resource", &resource);
        let scope = if !cfg.oauth_scope.is_empty() { cfg.oauth_scope.clone() } else { rm["scopes_supported"].as_array().map(|a| a.iter().filter_map(|x| x.as_str()).collect::<Vec<_>>().join(" ")).unwrap_or_default() };
        if !scope.is_empty() {
            q.append_pair("scope", &scope);
        }
        if cfg.url.contains("googleapis.com") {
            q.append_pair("access_type", "offline").append_pair("prompt", "consent");
        }
    }
    pending.0.lock().unwrap().insert(state, PendingAuth { server: server.into(), verifier, client_id, token_endpoint: token_ep, resource });
    Ok(url.to_string())
}

/// Canjea el código del callback por tokens. Devuelve (servidor, tokens).
pub async fn finish(http: &reqwest::Client, pending: &OAuthPending, state: &str, code: &str, client_secret: Option<String>) -> anyhow::Result<(String, OAuthTokens)> {
    let p = pending.0.lock().unwrap().remove(state).ok_or_else(|| anyhow::anyhow!("Autorización desconocida o caducada"))?;
    let mut form = vec![("grant_type", "authorization_code".to_string()), ("code", code.to_string()), ("redirect_uri", REDIRECT.to_string()), ("client_id", p.client_id.clone()), ("code_verifier", p.verifier.clone()), ("resource", p.resource.clone())];
    if let Some(s) = client_secret.filter(|s| !s.is_empty()) {
        form.push(("client_secret", s));
    }
    let v: Value = http.post(&p.token_endpoint).header("Accept", "application/json").form(&form).send().await?.json().await?;
    let at = v["access_token"].as_str().ok_or_else(|| anyhow::anyhow!("No se obtuvo token: {}", v["error_description"].as_str().or(v["error"].as_str()).unwrap_or("error")))?;
    Ok((
        p.server,
        OAuthTokens {
            client_id: p.client_id,
            token_endpoint: p.token_endpoint,
            access_token: at.into(),
            refresh_token: v["refresh_token"].as_str().unwrap_or("").into(),
            expires_at: v["expires_in"].as_i64().map(|s| chrono::Utc::now().timestamp() + s).unwrap_or(0),
            resource: p.resource,
        },
    ))
}
