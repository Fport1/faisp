//! faisp — orquestador multi-IA local.
//! Un único ejecutable nativo (Rust): servidor en 127.0.0.1 + ventana de app usando el WebView
//! del sistema (Edge/Chromium en modo app). Sin Electron: ~10 MB de RAM para el backend.
#![cfg_attr(all(windows, not(debug_assertions)), windows_subsystem = "windows")]

mod api;
mod context;
mod defaults;
mod extensions;
mod integrations;
mod mcp;
mod orchestrator;
mod providers;
mod routines;
mod store;

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

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    let a = args();
    if let Some(d) = &a.data {
        // SAFETY: se llama al arrancar, antes de crear hilos que lean el entorno.
        unsafe { std::env::set_var("FAISP_DATA", d) };
    }
    let data = store::data_dir();

    // Instancia única: si ya está abierta, solo abre otra ventana.
    let listener = match tokio::net::TcpListener::bind(("127.0.0.1", a.port)).await {
        Ok(l) => l,
        Err(_) if already_running(a.port).await => {
            open_window(&format!("http://127.0.0.1:{}", a.port), &data);
            return Ok(());
        }
        Err(_) => tokio::net::TcpListener::bind(("127.0.0.1", 0)).await?,
    };
    let port = listener.local_addr()?.port();
    let url = format!("http://127.0.0.1:{port}");

    let st = orchestrator::AppState::load(data.clone());

    // Guardado diferido
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

    // Cierre automático: sin ventana abierta (sin pings) y sin rutinas activas → termina.
    if !a.headless {
        let st = st.clone();
        tokio::spawn(async move {
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
        open_window(&url, &data);
    }
    println!("faisp {} escuchando en {url}  (datos: {})", env!("CARGO_PKG_VERSION"), data.display());

    let app = api::router(st.clone());
    let shutdown_st = st.clone();
    axum::serve(listener, app)
        .with_graceful_shutdown(async move {
            let _ = tokio::signal::ctrl_c().await;
            shutdown_st.dirty.store(true, Ordering::Relaxed);
            shutdown_st.flush();
        })
        .await?;
    Ok(())
}
