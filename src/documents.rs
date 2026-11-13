//! Lectura de documentos para los agentes: PDF, Word, Excel/hojas de cálculo, PowerPoint,
//! OpenDocument y Google Docs/Sheets/Slides compartidos por enlace (se exportan y se leen igual).
use regex::Regex;
use std::io::Read;
use std::path::Path;
use std::sync::OnceLock;

pub const DOC_EXT: &[&str] = &["pdf", "docx", "xlsx", "xlsm", "xls", "ods", "pptx", "odt", "odp", "csv", "gdoc", "gsheet", "gslides"];

pub fn is_document(path: &Path) -> bool {
    path.extension().map(|e| DOC_EXT.contains(&e.to_string_lossy().to_lowercase().as_str())).unwrap_or(false)
}

fn decode_entities(s: &str) -> String {
    static R: OnceLock<Regex> = OnceLock::new();
    let r = R.get_or_init(|| Regex::new(r"&(#x?[0-9a-fA-F]+|amp|lt|gt|quot|apos);").unwrap());
    r.replace_all(s, |c: &regex::Captures| {
        let e = &c[1];
        match e {
            "amp" => "&".into(),
            "lt" => "<".into(),
            "gt" => ">".into(),
            "quot" => "\"".into(),
            "apos" => "'".into(),
            _ => {
                let n = if let Some(h) = e.strip_prefix("#x").or_else(|| e.strip_prefix("#X")) { u32::from_str_radix(h, 16).ok() } else { e[1..].parse().ok() };
                n.and_then(char::from_u32).map(|c| c.to_string()).unwrap_or_default()
            }
        }
    })
    .to_string()
}

/// Texto de un XML de Office: los textos (w:t / a:t / text:*) con saltos de párrafo.
fn xml_text(xml: &str, text_tag: &str, para_end: &str) -> String {
    let re = Regex::new(&format!(r"<{t}(?:\s[^>]*)?>([^<]*)</{t}>|</{p}>|<w:tab/>|<w:br/>|<a:br/>", t = regex::escape(text_tag), p = regex::escape(para_end))).unwrap();
    let mut out = String::new();
    for c in re.captures_iter(xml) {
        match c.get(1) {
            Some(t) => out.push_str(&decode_entities(t.as_str())),
            None => {
                let m = c.get(0).unwrap().as_str();
                out.push(if m.contains("tab") { '\t' } else { '\n' });
            }
        }
    }
    let mut cleaned = String::new();
    for line in out.lines() {
        let l = line.trim_end();
        if !(l.is_empty() && cleaned.ends_with("\n\n")) {
            cleaned.push_str(l);
            cleaned.push('\n');
        }
    }
    cleaned.trim().to_string()
}

fn zip_file(path: &Path, name: &str) -> anyhow::Result<String> {
    let mut z = zip::ZipArchive::new(std::fs::File::open(path)?)?;
    // Algunas herramientas guardan las rutas internas con \ en vez de /
    let real = z.file_names().filter_map(|n| n.ok().map(|c| c.to_string())).find(|n| n.replace('\\', "/") == name).ok_or_else(|| anyhow::anyhow!("Falta {name} dentro del archivo"))?;
    let mut f = z.by_name(&real)?;
    let mut s = String::new();
    f.read_to_string(&mut s)?;
    Ok(s)
}

fn pptx_text(path: &Path) -> anyhow::Result<String> {
    let mut z = zip::ZipArchive::new(std::fs::File::open(path)?)?;
    let mut slides: Vec<(u32, String)> = Vec::new();
    let names: Vec<String> = z.file_names().filter_map(|n| n.ok().map(|c| c.to_string())).collect();
    for n in names {
        if let Some(num) = n.replace('\\', "/").strip_prefix("ppt/slides/slide").and_then(|r| r.strip_suffix(".xml")).and_then(|r| r.parse::<u32>().ok()) {
            let mut s = String::new();
            z.by_name(&n)?.read_to_string(&mut s)?;
            slides.push((num, xml_text(&s, "a:t", "a:p")));
        }
    }
    slides.sort_by_key(|s| s.0);
    Ok(slides.into_iter().map(|(n, t)| format!("--- Diapositiva {n} ---\n{t}")).collect::<Vec<_>>().join("\n\n"))
}

fn sheets_text(path: &Path) -> anyhow::Result<String> {
    use calamine::{open_workbook_auto, Reader};
    let mut wb = open_workbook_auto(path)?;
    let mut out = String::new();
    for name in wb.sheet_names().to_owned() {
        let Ok(range) = wb.worksheet_range(&name) else { continue };
        out.push_str(&format!("--- Hoja «{name}» ({} filas × {} columnas) ---\n", range.height(), range.width()));
        for row in range.rows().take(2000) {
            let cells: Vec<String> = row.iter().map(|c| c.to_string().replace('\t', " ").replace('\n', " ")).collect();
            if cells.iter().any(|c| !c.is_empty()) {
                out.push_str(&cells.join("\t"));
                out.push('\n');
            }
        }
        if range.height() > 2000 {
            out.push_str("…(más filas)\n");
        }
        out.push('\n');
    }
    Ok(out)
}

/// Extrae el texto de un documento local.
pub fn extract(path: &Path) -> anyhow::Result<String> {
    let ext = path.extension().map(|e| e.to_string_lossy().to_lowercase()).unwrap_or_default();
    match ext.as_str() {
        "pdf" => {
            let t = pdf_extract::extract_text(path).map_err(|e| anyhow::anyhow!("No se pudo leer el PDF: {e}"))?;
            if t.trim().is_empty() {
                Ok("(El PDF no tiene texto seleccionable: probablemente es escaneado. Pásalo al agente Vídeo y audio para que Gemini lo lea como imagen.)".into())
            } else {
                Ok(t)
            }
        }
        "docx" => Ok(xml_text(&zip_file(path, "word/document.xml")?, "w:t", "w:p")),
        "odt" | "odp" => {
            let xml = zip_file(path, "content.xml")?;
            let re = Regex::new(r"</text:p>|</text:h>|<text:tab/>|<text:line-break/>").unwrap();
            let marked = re.replace_all(&xml, "\n");
            let strip = Regex::new(r"<[^>]+>").unwrap();
            Ok(decode_entities(&strip.replace_all(&marked, "")).trim().to_string())
        }
        "pptx" => pptx_text(path),
        "xlsx" | "xlsm" | "xls" | "ods" => sheets_text(path),
        "csv" => Ok(std::fs::read_to_string(path)?),
        "gdoc" | "gsheet" | "gslides" => {
            // Acceso directo de Google Drive para escritorio: solo contiene el enlace
            let t = std::fs::read_to_string(path).unwrap_or_default();
            let url = serde_json::from_str::<serde_json::Value>(&t).ok().and_then(|v| v["url"].as_str().map(String::from)).unwrap_or_default();
            Ok(format!("Es un acceso directo de Google Drive ({url}). Léelo con la herramienta leer_google_doc si está compartido con enlace, o con el conector de Google Drive."))
        }
        _ => Ok(std::fs::read_to_string(path)?),
    }
}

/// Descarga un Google Doc/Sheet/Slides compartido con enlace (exportándolo) y extrae su texto.
pub async fn google_export(http: &reqwest::Client, url: &str, tmp_dir: &Path) -> anyhow::Result<String> {
    let re = Regex::new(r"docs\.google\.com/(document|spreadsheets|presentation)/d/([A-Za-z0-9_-]+)").unwrap();
    let c = re.captures(url).ok_or_else(|| anyhow::anyhow!("No es un enlace de Google Docs, Sheets o Slides"))?;
    let (kind, id) = (c[1].to_string(), c[2].to_string());
    let (export, ext) = match kind.as_str() {
        "document" => (format!("https://docs.google.com/document/d/{id}/export?format=docx"), "docx"),
        "spreadsheets" => (format!("https://docs.google.com/spreadsheets/d/{id}/export?format=xlsx"), "xlsx"),
        _ => (format!("https://docs.google.com/presentation/d/{id}/export/pptx"), "pptx"),
    };
    let r = http.get(&export).send().await?;
    let ctype = r.headers().get("content-type").and_then(|v| v.to_str().ok()).unwrap_or("").to_string();
    if !r.status().is_success() || ctype.contains("text/html") {
        anyhow::bail!("No se pudo descargar: el documento no está compartido con «cualquiera con el enlace». Compártelo así o usa el conector de Google Drive.");
    }
    let bytes = r.bytes().await?;
    std::fs::create_dir_all(tmp_dir)?;
    let f = tmp_dir.join(format!("{id}.{ext}"));
    std::fs::write(&f, &bytes)?;
    let text = extract(&f);
    let _ = std::fs::remove_file(&f);
    text
}

pub fn google_tool_spec() -> serde_json::Value {
    serde_json::json!({"name":"leer_google_doc","description":"Lee un Google Docs, Sheets o Slides a partir de su enlace (debe estar compartido con «cualquiera con el enlace»).","input_schema":{"type":"object","properties":{"url":{"type":"string"}},"required":["url"],"additionalProperties":false}})
}
