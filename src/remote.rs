//! Acceso desde el móvil: un segundo servidor en la red local (desactivado por defecto) que sirve la
//! interfaz de teléfono (/m) y la API, protegido con un token secreto que se empareja con un QR.
//! El servidor principal sigue escuchando solo en 127.0.0.1.
use crate::orchestrator::AppState;
use axum::extract::{Request, State};
use axum::http::{header, StatusCode};
use axum::middleware::Next;
use axum::response::{IntoResponse, Response};
use std::sync::{Arc, Mutex, OnceLock};

static STOP: OnceLock<Mutex<Option<tokio::sync::oneshot::Sender<()>>>> = OnceLock::new();
fn stop_slot() -> &'static Mutex<Option<tokio::sync::oneshot::Sender<()>>> {
    STOP.get_or_init(|| Mutex::new(None))
}

pub fn new_token() -> String {
    let b: [u8; 24] = rand::random();
    b.iter().map(|x| format!("{x:02x}")).collect()
}

/// IP de este equipo en la red local (sin enviar nada: solo pregunta qué interfaz usaría).
pub fn lan_ip() -> Option<String> {
    let s = std::net::UdpSocket::bind("0.0.0.0:0").ok()?;
    s.connect("8.8.8.8:80").ok()?;
    let ip = s.local_addr().ok()?.ip();
    (!ip.is_loopback() && !ip.is_unspecified()).then(|| ip.to_string())
}

pub fn running() -> bool {
    stop_slot().lock().unwrap().is_some()
}

/// Lo que no tiene sentido o no debe hacerse desde el teléfono
const BLOCKED: &[&str] = &["/api/remote", "/api/update/install", "/api/pick-folder", "/api/pick-file", "/api/window/open", "/api/account/login", "/api/cli/codex/login", "/api/cli/codex/install", "/api/terminal"];

async fn guard(State(st): State<Arc<AppState>>, req: Request, next: Next) -> Response {
    let token = st.cfg.read().unwrap().remote.token.clone();
    let path = req.uri().path().to_string();
    if token.len() < 16 {
        return StatusCode::FORBIDDEN.into_response();
    }
    if BLOCKED.iter().any(|b| path == *b || path.starts_with(&format!("{b}/"))) || (path.starts_with("/api/providers/") && path.ends_with("/key")) {
        return (StatusCode::FORBIDDEN, "No disponible desde el móvil").into_response();
    }
    // Emparejar: /?t=TOKEN guarda una cookie (1 año) y quita el token de la dirección
    if let Some(q) = req.uri().query() {
        if q.split('&').any(|kv| kv == format!("t={token}")) {
            return (
                StatusCode::FOUND,
                [(header::LOCATION, "/m".to_string()), (header::SET_COOKIE, format!("faisp_m={token}; Path=/; Max-Age=31536000; HttpOnly; SameSite=Strict"))],
            )
                .into_response();
        }
    }
    let ok = req.headers().get(header::COOKIE).and_then(|c| c.to_str().ok()).map(|c| c.split(';').any(|kv| kv.trim() == format!("faisp_m={token}"))).unwrap_or(false)
        || req.headers().get("x-faisp-token").and_then(|v| v.to_str().ok()) == Some(token.as_str());
    if !ok {
        return (
            StatusCode::UNAUTHORIZED,
            [(header::CONTENT_TYPE, "text/html; charset=utf-8")],
            "<!doctype html><meta name=viewport content='width=device-width,initial-scale=1'><body style='font-family:-apple-system,system-ui;background:#262624;color:#eee;padding:40px 24px;line-height:1.5'><h2>faisp</h2><p>Para usar faisp en este teléfono, abre faisp en tu PC → <b>Ajustes → Móvil</b> y escanea el código QR con la cámara.</p></body>",
        )
            .into_response();
    }
    if path == "/" {
        return (StatusCode::FOUND, [(header::LOCATION, "/m")]).into_response();
    }
    next.run(req).await
}

/// Arranca (o reinicia) el servidor de la red local si está activado en la configuración.
pub async fn apply(st: Arc<AppState>) -> anyhow::Result<()> {
    if let Some(tx) = stop_slot().lock().unwrap().take() {
        let _ = tx.send(());
    }
    let (enabled, port) = {
        let c = st.cfg.read().unwrap();
        (c.remote.enabled, c.remote.port)
    };
    if !enabled {
        return Ok(());
    }
    let listener = tokio::net::TcpListener::bind(("0.0.0.0", if port == 0 { 4320 } else { port })).await?;
    let app = crate::api::router(st.clone()).layer(axum::middleware::from_fn_with_state(st.clone(), guard));
    let (tx, rx) = tokio::sync::oneshot::channel::<()>();
    *stop_slot().lock().unwrap() = Some(tx);
    tokio::spawn(async move {
        let _ = axum::serve(listener, app).with_graceful_shutdown(async move {
            let _ = rx.await;
        }).await;
    });
    Ok(())
}
