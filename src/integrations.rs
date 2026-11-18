//! Integraciones detectadas en el PC: Modpack Launcher (servidor MCP + skills + AGENTS.md) e
//! importación genérica de archivos .mcp.json (el formato de Claude Code, Cursor, Gemini CLI…).
use crate::store::{Agent, Config, McpServerCfg, SkillDirCfg};
use serde_json::Value;
use std::path::{Path, PathBuf};

pub fn modpack_dir() -> Option<PathBuf> {
    let d = dirs::config_dir()?.join("modpack-launcher").join("ai").join("launcher");
    d.join(".mcp.json").exists().then_some(d)
}

/// Lee los servidores de un .mcp.json ({"mcpServers": {nombre: {command, args, env}}}).
pub fn read_mcp_json(path: &Path) -> anyhow::Result<Vec<(String, McpServerCfg)>> {
    let v: Value = serde_json::from_str(&std::fs::read_to_string(path)?)?;
    let servers = v["mcpServers"].as_object().cloned().unwrap_or_default();
    Ok(servers
        .into_iter()
        .filter(|(_, s)| s["command"].is_string())
        .map(|(name, s)| {
            let cfg = McpServerCfg {
                label: name.clone(),
                command: s["command"].as_str().unwrap_or("").into(),
                args: s["args"].as_array().map(|a| a.iter().filter_map(|x| x.as_str().map(String::from)).collect()).unwrap_or_default(),
                env: s["env"].as_object().map(|o| o.iter().filter_map(|(k, v)| v.as_str().map(|v| (k.clone(), v.to_string()))).collect()).unwrap_or_default(),
                cwd: s["cwd"].as_str().unwrap_or("").into(),
                enabled: true,
                source: path.to_string_lossy().into(),
                ..Default::default()
            };
            (name, cfg)
        })
        .collect())
}

/// Detecta el Modpack Launcher y lo integra (solo la primera vez). Devuelve true si cambió algo.
pub fn detect_modpack(cfg: &mut Config) -> bool {
    let Some(dir) = modpack_dir() else { return false };
    if cfg.mcp_servers.contains_key("modpack-launcher") {
        return false;
    }
    let Ok(servers) = read_mcp_json(&dir.join(".mcp.json")) else { return false };
    let Some((_, mut server)) = servers.into_iter().find(|(n, _)| n == "modpack-launcher") else { return false };

    // Herramientas que el propio launcher marca como de solo lectura en su configuración de Claude
    if let Ok(t) = std::fs::read_to_string(dir.join(".claude").join("settings.json")) {
        if let Ok(v) = serde_json::from_str::<Value>(&t) {
            server.auto_allow = v["permissions"]["allow"]
                .as_array()
                .map(|a| a.iter().filter_map(|x| x.as_str()).map(|s| s.trim_start_matches("mcp__modpack-launcher__").to_string()).collect())
                .unwrap_or_default();
        }
    }
    server.label = "Modpack Launcher".into();
    server.description = "Instancias, mods, crashes, registro del juego, modelos y animaciones, guías y control en vivo. Necesita el launcher abierto.".into();
    server.source = "modpack-launcher".into();
    cfg.mcp_servers.insert("modpack-launcher".into(), server);

    let skills = dir.join(".claude").join("skills");
    if skills.exists() && !cfg.skill_dirs.iter().any(|s| Path::new(&s.path) == skills) {
        cfg.skill_dirs.push(SkillDirCfg { path: skills.to_string_lossy().into(), label: "Modpack Launcher".into(), agents: vec!["launcher".into(), "modelos".into(), "codigo".into()] });
    }

    if !cfg.agents.iter().any(|a| a.id == "launcher") {
        cfg.agents.push(Agent {
            id: "launcher".into(),
            name: "Modpack Launcher".into(),
            icon: "play".into(),
            color: "#4f9d69".into(),
            model: crate::defaults::OPUS.into(),
            effort: "medium".into(),
            description: crate::defaults::LAUNCHER_DESC.into(),
            keywords: ["instancia", "modpack", "launcher", "crash", "crashea", "mods", "resource pack", "resourcepack", "shader", "datapack", "mundo", "rendimiento", "lag", "fps", "config", "neoforge", "forge"].iter().map(|s| s.to_string()).collect(),
            system: format!("Eres la IA del Modpack Launcher dentro de faisp. Usa SIEMPRE las herramientas del launcher (mcp__modpack-launcher__*) para ver y cambiar instancias; no supongas versiones ni loaders. Responde en español.\n\n{}", crate::defaults::LAUNCHER_EXCEPTION),
            system_file: dir.join("AGENTS.md").to_string_lossy().into(),
            builtin: true,
            tools: false,
            mcp: vec!["modpack-launcher".into()],
            fallbacks: vec!["anthropic:claude-sonnet-5-5".into()],
            ..Default::default()
        });
    }
    // El Modelador 3D también aprovecha guías, rigs y registro del launcher.
    if let Some(m) = cfg.agents.iter_mut().find(|a| a.id == "modelos") {
        if !m.mcp.contains(&"modpack-launcher".to_string()) {
            m.mcp.push("modpack-launcher".into());
            m.mcp_tools = ["guia", "analizar_rig", "crear_animaciones_base", "analizar_animacion", "escribir_animacion", "registro", "ver_recurso", "documentacion", "leer_archivo", "listar_archivos", "instancias"].iter().map(|s| s.to_string()).collect();
        }
    }
    true
}

/// El agente de audio usa también la conversión de medios del Modpack Launcher (mp3 → ogg).
pub fn link_audio(cfg: &mut Config) {
    if !cfg.mcp_servers.contains_key("modpack-launcher") {
        return;
    }
    if let Some(a) = cfg.agents.iter_mut().find(|a| a.id == "audio") {
        if !a.mcp.contains(&"modpack-launcher".to_string()) {
            a.mcp.push("modpack-launcher".into());
            a.mcp_tools = ["analizar_medio", "convertir_medio", "instancias", "guia", "listar_archivos", "leer_archivo"].iter().map(|s| s.to_string()).collect();
        }
    }
}

/// Bóvedas de Obsidian registradas en este PC (%APPDATA%/obsidian/obsidian.json).
pub fn obsidian_vaults() -> Vec<serde_json::Value> {
    let Some(f) = dirs::config_dir().map(|d| d.join("obsidian").join("obsidian.json")) else { return vec![] };
    let Ok(t) = std::fs::read_to_string(f) else { return vec![] };
    let Ok(v) = serde_json::from_str::<Value>(&t) else { return vec![] };
    v["vaults"].as_object().map(|o| o.values().filter_map(|x| {
        let p = x["path"].as_str()?;
        Some(serde_json::json!({"path": p, "name": Path::new(p).file_name().map(|n| n.to_string_lossy().to_string()).unwrap_or_default(), "open": x["open"].as_bool().unwrap_or(false)}))
    }).collect()).unwrap_or_default()
}

/// Busca un ejecutable en el PATH (y la carpeta global de npm en Windows).
pub fn find_on_path(names: &[&str]) -> Option<PathBuf> {
    let mut dirs_: Vec<PathBuf> = std::env::var_os("PATH").map(|p| std::env::split_paths(&p).collect()).unwrap_or_default();
    if let Some(a) = dirs::config_dir() {
        dirs_.push(a.join("npm"));
    }
    for d in dirs_ {
        for n in names {
            let p = d.join(n);
            if p.is_file() {
                return Some(p);
            }
        }
    }
    None
}

/// Busca el ejecutable de Claude Code: el configurado, el del PATH, el de la app de escritorio de Claude.
pub fn find_claude_code(configured: &str) -> Option<PathBuf> {
    if !configured.is_empty() && Path::new(configured).exists() {
        return Some(PathBuf::from(configured));
    }
    if let Some(path) = std::env::var_os("PATH") {
        for d in std::env::split_paths(&path) {
            for n in ["claude.exe", "claude.cmd", "claude"] {
                let p = d.join(n);
                if p.is_file() {
                    return Some(p);
                }
            }
        }
    }
    let home = dirs::home_dir()?;
    for p in [home.join(".local").join("bin").join("claude.exe"), home.join(".claude").join("local").join("claude.exe")] {
        if p.exists() {
            return Some(p);
        }
    }
    // App de escritorio: %LOCALAPPDATA%\Claude-Data\<perfil>\claude-code\<versión>\<hash>\claude.exe (la más reciente)
    let base = dirs::data_local_dir()?.join("Claude-Data");
    let mut best: Option<(std::time::SystemTime, PathBuf)> = None;
    for prof in std::fs::read_dir(base).ok()?.flatten() {
        let cc = prof.path().join("claude-code");
        let Ok(vers) = std::fs::read_dir(&cc) else { continue };
        for v in vers.flatten() {
            let Ok(hashes) = std::fs::read_dir(v.path()) else { continue };
            for h in hashes.flatten() {
                let exe = h.path().join("claude.exe");
                if let Ok(m) = std::fs::metadata(&exe).and_then(|m| m.modified()) {
                    if best.as_ref().map(|(t, _)| m > *t).unwrap_or(true) {
                        best = Some((m, exe));
                    }
                }
            }
        }
    }
    best.map(|(_, p)| p)
}
