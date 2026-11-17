//! faisp — orquestador multi-IA local.
//! Un único ejecutable nativo (Rust): servidor en 127.0.0.1 + ventana de app usando el WebView
//! del sistema (Edge/Chromium en modo app). Sin Electron: ~10 MB de RAM para el backend.
#![cfg_attr(all(windows, not(debug_assertions)), windows_subsystem = "windows")]

mod api;
mod context;
mod defaults;
mod documents;
mod extensions;
mod integrations;
mod elevenlabs;
mod gemini_media;
mod mcp;
mod mcp_http;
mod orchestrator;
mod providers;
mod routines;
mod store;
mod window;

use std::sync::atomic::Ordering;
use std::time::Duration;

const DEFAULT_PORT: u16 = 4317;

struct Args {
    port: u16,
    headless: bool,
    data: Option<String>,
}

fn args() -> Args {
    let mut a = Args { port: DEFAULT_PORT, headless: false, data: None };
    let mut it = std::env::args().skip(1);
    while let Some(x) = it.next() {
        match x.as_str() {
            "--port" => a.port = it.next().and_then(|p| p.parse().ok()).unwrap_or(DEFAULT_PORT),
            "--headless" | "--server" => a.headless = true,
            "--data" => a.data = it.next(),
            _ => {}
        }
    }
    a
}

/// Abre la interfaz como ventana de aplicación (sin barra de navegador).
fn open_window(url: &str, data: &std::path::Path) {
    #[cfg(windows)]
    {
        let candidates = [
            std::env::var("ProgramFiles(x86)").map(|p| format!("{p}\\Microsoft\\Edge\\Application\\msedge.exe")),
            std::env::var("ProgramFiles").map(|p| format!("{p}\\Microsoft\\Edge\\Application\\msedge.exe")),
            std::env::var("ProgramFiles").map(|p| format!("{p}\\Google\\Chrome\\Application\\chrome.exe")),
            std::env::var("LOCALAPPDATA").map(|p| format!("{p}\\Google\\Chrome\\Application\\chrome.exe")),
        ];
        let profile = data.join("webview");
        for exe in candidates.into_iter().flatten() {
            if std::path::Path::new(&exe).exists() {
                let ok = std::process::Command::new(&exe)
                    .arg(format!("--app={url}"))
                    .arg(format!("--user-data-dir={}", profile.display()))
                    .arg("--window-size=1320,880")
                    .arg("--no-first-run")
                    .arg("--disable-features=Translate")
                    .spawn()
                    .is_ok();
                if ok {
                    return;
                }
            }
        }
        let _ = std::process::Command::new("cmd").args(["/C", "start", "", url]).spawn();
    }
    #[cfg(target_os = "macos")]
    {
        let _ = data;
        let _ = std::process::Command::new("open").arg(url).spawn();
    }
    #[cfg(all(unix, not(target_os = "macos")))]
    {
        let _ = data;
        let _ = std::process::Command::new("xdg-open").arg(url).spawn();
    }
}

async fn already_running(port: u16) -> bool {
    let c = reqwest::Client::new();
    match c.post(format!("http://127.0.0.1:{port}/api/ping")).timeout(Duration::from_secs(2)).send().await {
        Ok(r) => r.text().await.map(|t| t.contains("faisp")).unwrap_or(false),
        Err(_) => false,
    }
}

async fn ask_existing_to_open(port: u16) -> bool {
    let c = reqwest::Client::new();
    c.post(format!("http://127.0.0.1:{port}/api/window/open")).timeout(Duration::from_secs(3)).send().await.map(|r| r.status().is_success()).unwrap_or(false)
}

/// Arranca el servidor en el runtime de tokio. Devuelve (url, estado) o None si ya había una instancia.
async fn start_server(a: &Args, data: std::path::PathBuf) -> anyhow::Result<Option<(String, std::sync::Arc<orchestrator::AppState>)>> {
    // Instancia única: si ya está abierta, le pide que abra otra ventana.
    let listener = match tokio::net::TcpListener::bind(("127.0.0.1", a.port)).await {
        Ok(l) => l,
        Err(_) if already_running(a.port).await => {
            if !ask_existing_to_open(a.port).await {
                open_window(&format!("http://127.0.0.1:{}", a.port), &data);
            }
            return Ok(None);
        }
        Err(_) => tokio::net::TcpListener::bind(("127.0.0.1", 0)).await?,
    };
    let port = listener.local_addr()?.port();
    let url = format!("http://127.0.0.1:{port}");
    let st = orchestrator::AppState::load(data.clone());
    st.port.store(port, Ordering::Relaxed);
    {
        let st = st.clone();
        tokio::spawn(async move {
            let mut t = tokio::time::interval(Duration::from_millis(1500));
            loop {
                t.tick().await;
                st.flush();
            }
        });
    }
    routines::spawn_scheduler(st.clone());
    println!("faisp {} escuchando en {url}  (datos: {})", env!("CARGO_PKG_VERSION"), data.display());
    let app = api::router(st.clone());
    let shutdown_st = st.clone();
    tokio::spawn(async move {
        let _ = axum::serve(listener, app)
            .with_graceful_shutdown(async move {
                let _ = tokio::signal::ctrl_c().await;
                shutdown_st.dirty.store(true, Ordering::Relaxed);
                shutdown_st.flush();
                std::process::exit(0);
            })
            .await;
    });
    Ok(Some((url, st)))
}

fn main() -> anyhow::Result<()> {
    let a = args();
    if let Some(d) = &a.data {
        // SAFETY: al arrancar, antes de crear hilos.
        unsafe { std::env::set_var("FAISP_DATA", d) };
    }
    let data = store::data_dir();
    let rt = tokio::runtime::Runtime::new()?;
    let Some((url, st)) = rt.block_on(start_server(&a, data.clone()))? else { return Ok(()) };

    if a.headless {
        rt.block_on(async { std::future::pending::<()>().await });
        return Ok(());
    }
    // Ventana nativa (WebView2). Si no se puede, ventana de Edge en modo app como antes.
    if let Err(e) = window::run(&url, &data, st.clone(), rt) {
        eprintln!("Ventana nativa no disponible ({e}); se usa el navegador.");
        open_window(&url, &data);
        let rt = tokio::runtime::Runtime::new()?;
        rt.block_on(async move {
            let mut t = tokio::time::interval(Duration::from_secs(30));
            loop {
                t.tick().await;
                let idle = chrono::Utc::now().timestamp() - st.last_ping.load(Ordering::Relaxed);
                if idle > 150 && !routines::has_active(&st) {
                    st.dirty.store(true, Ordering::Relaxed);
                    st.flush();
                    std::process::exit(0);
                }
            }
        });
    }
    Ok(())
}
