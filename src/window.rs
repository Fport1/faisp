//! Ventana nativa con WebView2 (el mismo motor que usa Tauri): icono propio en la ventana y en la
//! barra de tareas, sin depender de una ventana de Edge en modo app.
use crate::orchestrator::AppState;
use std::collections::HashMap;
use std::path::Path;
use std::sync::{Arc, Mutex, OnceLock};
use tao::dpi::LogicalSize;
use tao::event::{Event, WindowEvent};
use tao::event_loop::{ControlFlow, EventLoopBuilder, EventLoopProxy, EventLoopWindowTarget};
use tao::window::{Icon, Window, WindowBuilder, WindowId};
use wry::{NewWindowResponse, WebContext, WebView, WebViewBuilder};

#[derive(Debug, Clone)]
pub enum UserEvent {
    OpenWindow,
}

static PROXY: OnceLock<Mutex<EventLoopProxy<UserEvent>>> = OnceLock::new();

/// Pide abrir otra ventana (p. ej. al lanzar faisp cuando ya está abierto). false si no hay ventana nativa.
pub fn request_open() -> bool {
    PROXY.get().map(|p| p.lock().unwrap().send_event(UserEvent::OpenWindow).is_ok()).unwrap_or(false)
}

fn icon() -> Option<Icon> {
    #[cfg(windows)]
    {
        use tao::platform::windows::IconExtWindows;
        // Recurso 1 = assets/faisp.ico incrustado en el .exe; tamaño por defecto según los PPP del sistema.
        return Icon::from_resource(1, None).ok();
    }
    #[allow(unreachable_code)]
    None
}

fn open(target: &EventLoopWindowTarget<UserEvent>, url: &str, ctx: &mut WebContext) -> anyhow::Result<(Window, WebView)> {
    let mut wb = WindowBuilder::new().with_title("faisp").with_inner_size(LogicalSize::new(1320.0, 880.0)).with_min_inner_size(LogicalSize::new(640.0, 480.0)).with_window_icon(icon());
    #[cfg(windows)]
    {
        use tao::platform::windows::WindowBuilderExtWindows;
        wb = wb.with_taskbar_icon(icon());
    }
    let window = wb.build(target)?;
    let origin = url.trim_end_matches('/').to_string();
    let o2 = origin.clone();
    let mut builder = WebViewBuilder::new_with_web_context(ctx)
        .with_url(url)
        .with_devtools(cfg!(debug_assertions))
        // Que se comporte como una app, no como Edge: sin zoom con Ctrl+rueda, sin gestos atrás/adelante, sin autocompletar
        .with_hotkeys_zoom(false)
        .with_back_forward_navigation_gestures(false)
        .with_general_autofill_enabled(false);
    #[cfg(windows)]
    {
        use wry::WebViewBuilderExtWindows;
        // Sin menú contextual de Edge ni atajos del navegador (Ctrl+F, Ctrl+P, F5…); copiar/pegar siguen funcionando
        builder = builder.with_browser_accelerator_keys(cfg!(debug_assertions)).with_default_context_menus(cfg!(debug_assertions));
    }
    let webview = builder
        // Enlaces externos (documentación, inicio de sesión de conectores…) → navegador del sistema
        .with_navigation_handler(move |u| {
            if u.starts_with(&origin) || u.starts_with("about:") || u.starts_with("data:") || u.starts_with("blob:") {
                return true;
            }
            crate::api::open_url(&u);
            false
        })
        .with_new_window_req_handler(move |u, _| {
            if !u.starts_with(&o2) {
                crate::api::open_url(&u);
            }
            NewWindowResponse::Deny
        })
        .build(&window)?;
    Ok((window, webview))
}

pub fn run(url: &str, data: &Path, st: Arc<AppState>, rt: tokio::runtime::Runtime) -> anyhow::Result<()> {
    let event_loop = EventLoopBuilder::<UserEvent>::with_user_event().build();
    let _ = PROXY.set(Mutex::new(event_loop.create_proxy()));
    let mut ctx = WebContext::new(Some(data.join("webview2")));
    let mut windows: HashMap<WindowId, (Window, WebView)> = HashMap::new();
    let first = open(&event_loop, url, &mut ctx)?;
    windows.insert(first.0.id(), first);
    let url = url.to_string();
    event_loop.run(move |event, target, control_flow| {
        let _keep_runtime = &rt; // el servidor vive en este runtime
        *control_flow = ControlFlow::Wait;
        match event {
            Event::UserEvent(UserEvent::OpenWindow) => match open(target, &url, &mut ctx) {
                Ok(w) => {
                    w.0.set_focus();
                    windows.insert(w.0.id(), w);
                }
                Err(e) => eprintln!("No se pudo abrir la ventana: {e}"),
            },
            Event::WindowEvent { event: WindowEvent::CloseRequested, window_id, .. } => {
                windows.remove(&window_id);
                if windows.is_empty() && !crate::routines::has_active(&st) {
                    st.dirty.store(true, std::sync::atomic::Ordering::Relaxed);
                    st.flush();
                    *control_flow = ControlFlow::Exit;
                }
                // Con rutinas activas, faisp sigue trabajando en segundo plano; al abrirlo de nuevo se crea otra ventana.
            }
            _ => {}
        }
    });
}
