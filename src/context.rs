//! Contexto de proyecto: árbol de archivos, lectura segura, resúmenes baratos, artefactos
//! y las herramientas que los agentes usan sobre tu carpeta (list_dir, read_file, search, write_file).
use crate::store::{Event, Project};
use regex::Regex;
use serde_json::{json, Value};
use std::path::{Component, Path, PathBuf};
use std::sync::OnceLock;

pub const IGNORE: &[&str] = &["node_modules", ".git", ".gradle", "build", "run", "runs", "dist", "libs", "out", ".idea", ".vscode", "bin", "target", "gradle", "__pycache__", ".next"];
const BINARY_EXT: &[&str] = &["png", "jpg", "jpeg", "gif", "webp", "ogg", "wav", "mp3", "jar", "zip", "class", "nbt", "mca", "dat", "psd", "fpack", "exe", "dll", "so", "pdb", "rlib", "ico", "ttf", "otf", "woff", "woff2"];

pub fn estimate_tokens(s: &str) -> usize {
    (s.chars().count() as f64 / 3.6).ceil() as usize
}

fn is_binary(name: &str) -> bool {
    name.rsplit('.').next().map(|e| BINARY_EXT.contains(&e.to_lowercase().as_str())).unwrap_or(false)
}

pub fn project_tree(root: &Path, limit: usize) -> Vec<String> {
    let mut out = Vec::new();
    fn walk(dir: &Path, rel: &str, depth: usize, limit: usize, out: &mut Vec<String>) {
        if out.len() >= limit || depth > 10 {
            return;
        }
        let Ok(rd) = std::fs::read_dir(dir) else { return };
        let mut entries: Vec<_> = rd.flatten().collect();
        entries.sort_by_key(|e| (e.file_type().map(|t| t.is_dir()).unwrap_or(false), e.file_name()));
        for e in entries {
            if out.len() >= limit {
                return;
            }
            let name = e.file_name().to_string_lossy().to_string();
            if name.starts_with('.') || IGNORE.contains(&name.as_str()) {
                continue;
            }
            let r = if rel.is_empty() { name.clone() } else { format!("{rel}/{name}") };
            let is_dir = e.file_type().map(|t| t.is_dir()).unwrap_or(false);
            if is_dir {
                walk(&e.path(), &r, depth + 1, limit, out);
            } else if !is_binary(&name) {
                out.push(r);
            }
        }
    }
    walk(root, "", 0, limit, &mut out);
    out
}

/// Árbol compacto: una línea por carpeta con nº de archivos y algunos nombres.
pub fn compact_tree(files: &[String], max_lines: usize) -> String {
    let mut dirs: Vec<(String, Vec<String>)> = Vec::new();
    for f in files {
        let (d, n) = match f.rfind('/') {
            Some(i) => (f[..i].to_string(), f[i + 1..].to_string()),
            None => (".".to_string(), f.clone()),
        };
        match dirs.iter_mut().find(|(x, _)| *x == d) {
            Some((_, v)) => v.push(n),
            None => dirs.push((d, vec![n])),
        }
    }
    let mut lines = Vec::new();
    for (d, names) in dirs.iter() {
        let shown: Vec<_> = names.iter().take(6).cloned().collect();
        lines.push(format!("{d}/ ({}): {}{}", names.len(), shown.join(", "), if names.len() > 6 { ", …" } else { "" }));
        if lines.len() >= max_lines {
            lines.push("…".into());
            break;
        }
    }
    lines.join("\n")
}

/// Resuelve una ruta relativa dentro del proyecto sin permitir salir de él.
pub fn safe_path(project: &Project, rel: &str) -> anyhow::Result<PathBuf> {
    if project.path.is_empty() {
        anyhow::bail!("El proyecto no tiene carpeta asociada.");
    }
    let root = PathBuf::from(&project.path);
    let rel = rel.trim().trim_start_matches(['/', '\\']);
    let mut full = root.clone();
    for c in Path::new(rel).components() {
        match c {
            Component::Normal(p) => full.push(p),
            Component::CurDir => {}
            _ => anyhow::bail!("Ruta no permitida: {rel}"),
        }
    }
    Ok(full)
}

pub fn read_project_file(project: &Project, rel: &str, max_chars: usize) -> Option<String> {
    let p = safe_path(project, rel).ok()?;
    let txt = if crate::documents::is_document(&p) { crate::documents::extract(&p).ok()? } else { std::fs::read_to_string(p).ok()? };
    Some(truncate(&txt, max_chars))
}

pub fn truncate(s: &str, max: usize) -> String {
    if s.chars().count() <= max {
        return s.to_string();
    }
    let cut: String = s.chars().take(max).collect();
    format!("{cut}\n…(recortado, {} caracteres en total)", s.chars().count())
}

fn re_code() -> &'static Regex {
    static R: OnceLock<Regex> = OnceLock::new();
    R.get_or_init(|| Regex::new(r"(?s)```[^\n]*\n.*?```").unwrap())
}
fn re_path() -> &'static Regex {
    static R: OnceLock<Regex> = OnceLock::new();
    R.get_or_init(|| Regex::new(r"```[\w+-]*[ \t]+path=([^\s`]+)").unwrap())
}
fn re_artifact() -> &'static Regex {
    static R: OnceLock<Regex> = OnceLock::new();
    R.get_or_init(|| Regex::new(r"(?s)```([\w+-]*)(?:[ \t]+path=([^\s`]+))?[^\n]*\n(.*?)```").unwrap())
}

/// Resumen sin coste de tokens: quita código, recorta prosa, conserva rutas de archivos.
pub fn heuristic_summary(text: &str, max: usize) -> String {
    let files: Vec<String> = re_path().captures_iter(text).map(|c| c[1].to_string()).collect();
    let prose = re_code().replace_all(text, " ");
    let prose: String = prose.chars().filter(|c| !matches!(c, '#' | '>' | '*' | '_' | '`')).collect();
    let prose = prose.split_whitespace().collect::<Vec<_>>().join(" ");
    let mut s: String = prose.chars().take(max).collect();
    if prose.chars().count() > max {
        s.push('…');
    }
    if !files.is_empty() {
        s.push_str(&format!(" [archivos: {}]", files.join(", ")));
    }
    s
}

pub fn blackboard_text(events: &[&Event], n: usize) -> String {
    let start = events.len().saturating_sub(n);
    events[start..]
        .iter()
        .map(|e| format!("- [{}] {} → {}", e.agent_name, e.task.chars().take(140).collect::<String>(), e.summary))
        .collect::<Vec<_>>()
        .join("\n")
}

pub struct FoundArtifact {
    pub lang: String,
    pub path: Option<String>,
    pub content: String,
    pub title: String,
}

pub fn extract_artifacts(text: &str) -> Vec<FoundArtifact> {
    re_artifact()
        .captures_iter(text)
        .filter_map(|c| {
            let lang = c.get(1).map(|m| m.as_str().to_lowercase()).unwrap_or_default();
            let path = c.get(2).map(|m| m.as_str().to_string());
            let content = c.get(3).map(|m| m.as_str().to_string()).unwrap_or_default();
            let big = content.lines().count() >= 25;
            if path.is_none() && lang != "html" && lang != "svg" && !big {
                return None;
            }
            let title = match &path {
                Some(p) => p.rsplit('/').next().unwrap_or(p).to_string(),
                None if lang == "html" => "Página HTML".into(),
                None if lang == "svg" => "Imagen SVG".into(),
                None => format!("Bloque {}", if lang.is_empty() { "texto" } else { &lang }),
            };
            Some(FoundArtifact { lang, path, content, title })
        })
        .collect()
}

// ---------------- Herramientas para agentes ----------------

pub fn tool_specs(allow_write: bool) -> Vec<Value> {
    let mut v = vec![
        json!({"name":"list_dir","description":"Lista archivos y carpetas de una ruta del proyecto (relativa a la raíz). Usa \"\" para la raíz.","input_schema":{"type":"object","properties":{"path":{"type":"string"}},"required":["path"],"additionalProperties":false}}),
        json!({"name":"read_file","description":"Lee un archivo del proyecto: texto, código, PDF, Word (.docx), Excel/hojas (.xlsx, .xls, .ods, .csv), PowerPoint (.pptx) y OpenDocument. Para archivos largos usa start_line/max_lines.","input_schema":{"type":"object","properties":{"path":{"type":"string"},"start_line":{"type":"integer"},"max_lines":{"type":"integer"}},"required":["path"],"additionalProperties":false}}),
        json!({"name":"search","description":"Busca texto (regex) en los archivos del proyecto. Devuelve ruta:línea: contenido. Opcional: filtrar por subcarpeta o extensión.","input_schema":{"type":"object","properties":{"pattern":{"type":"string"},"under":{"type":"string"},"ext":{"type":"string"}},"required":["pattern"],"additionalProperties":false}}),
    ];
    v.push(json!({"name":"write_file","description": if allow_write { "Escribe (crea o reemplaza) un archivo del proyecto con el contenido completo. Se guarda copia de seguridad del anterior." } else { "Propone un archivo completo para el proyecto. El usuario lo revisará y aplicará." },"input_schema":{"type":"object","properties":{"path":{"type":"string"},"content":{"type":"string"}},"required":["path","content"],"additionalProperties":false}}));
    v
}

pub fn tool_list_dir(project: &Project, rel: &str) -> String {
    let Ok(p) = safe_path(project, rel) else { return "Ruta no permitida".into() };
    let Ok(rd) = std::fs::read_dir(&p) else { return format!("No existe la carpeta: {rel}") };
    let mut items: Vec<String> = rd
        .flatten()
        .filter(|e| !IGNORE.contains(&e.file_name().to_string_lossy().as_ref()))
        .map(|e| {
            let n = e.file_name().to_string_lossy().to_string();
            match e.metadata() {
                Ok(m) if m.is_dir() => format!("{n}/"),
                Ok(m) => format!("{n} ({} B)", m.len()),
                Err(_) => n,
            }
        })
        .collect();
    items.sort();
    if items.len() > 300 {
        let extra = items.len() - 300;
        items.truncate(300);
        items.push(format!("… y {extra} más"));
    }
    if items.is_empty() { "(vacía)".into() } else { items.join("\n") }
}

pub fn tool_read_file(project: &Project, rel: &str, start: usize, max_lines: usize, max_chars: usize) -> String {
    let Ok(p) = safe_path(project, rel) else { return "Ruta no permitida".into() };
    let content = if crate::documents::is_document(&p) { crate::documents::extract(&p) } else { std::fs::read_to_string(&p).map_err(anyhow::Error::from) };
    match content {
        Ok(t) => {
            let total = t.lines().count();
            let start = start.max(1);
            let body: Vec<String> = t.lines().enumerate().skip(start - 1).take(max_lines).map(|(i, l)| format!("{:>5} {l}", i + 1)).collect();
            let mut out = truncate(&body.join("\n"), max_chars);
            if start - 1 + max_lines < total {
                out.push_str(&format!("\n…(líneas {}-{} de {total}; pide más con start_line)", start, start - 1 + body.len()));
            }
            out
        }
        Err(e) => format!("No se pudo leer {rel}: {e}"),
    }
}

pub fn tool_search(project: &Project, pattern: &str, under: &str, ext: &str) -> String {
    let re = match regex::RegexBuilder::new(pattern).case_insensitive(true).build() {
        Ok(r) => r,
        Err(_) => regex::RegexBuilder::new(&regex::escape(pattern)).case_insensitive(true).build().unwrap(),
    };
    let Ok(base) = safe_path(project, under) else { return "Ruta no permitida".into() };
    let files = project_tree(&base, 4000);
    let mut out = Vec::new();
    for f in files {
        if !ext.is_empty() && !f.ends_with(ext.trim_start_matches('*')) {
            continue;
        }
        let Ok(t) = std::fs::read_to_string(base.join(&f)) else { continue };
        for (i, line) in t.lines().enumerate() {
            if re.is_match(line) {
                let shown: String = line.trim().chars().take(200).collect();
                let rel = if under.is_empty() { f.clone() } else { format!("{}/{}", under.trim_end_matches('/'), f) };
                out.push(format!("{rel}:{}: {shown}", i + 1));
                if out.len() >= 80 {
                    out.push("…(más resultados; afina la búsqueda)".into());
                    return out.join("\n");
                }
            }
        }
    }
    if out.is_empty() { "Sin resultados".into() } else { out.join("\n") }
}

/// Escribe en disco con copia de seguridad en <data>/backups.
pub fn write_with_backup(project: &Project, rel: &str, content: &str, backups: &Path) -> anyhow::Result<()> {
    let p = safe_path(project, rel)?;
    if p.exists() {
        let stamp = chrono::Local::now().format("%Y%m%d-%H%M%S");
        let b = backups.join(&project.id).join(format!("{stamp}_{}", rel.replace(['/', '\\'], "__")));
        std::fs::create_dir_all(b.parent().unwrap())?;
        std::fs::copy(&p, b)?;
    }
    if let Some(parent) = p.parent() {
        std::fs::create_dir_all(parent)?;
    }
    std::fs::write(p, content)?;
    Ok(())
}
