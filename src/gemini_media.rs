//! Análisis de vídeo, audio e imágenes con Gemini (API nativa de Google), como herramienta para
//! los agentes. Archivos pequeños van en línea (base64); los grandes se suben con el File API.
use base64::Engine;
use serde_json::{json, Value};
use std::path::Path;
use std::time::Duration;

const API: &str = "https://generativelanguage.googleapis.com";
const INLINE_MAX: u64 = 18 * 1024 * 1024;

pub fn mime_for(path: &Path) -> Option<&'static str> {
    let ext = path.extension()?.to_string_lossy().to_lowercase();
    Some(match ext.as_str() {
        "mp4" => "video/mp4",
        "mov" => "video/quicktime",
        "webm" => "video/webm",
        "mkv" => "video/x-matroska",
        "avi" => "video/x-msvideo",
        "mpeg" | "mpg" => "video/mpeg",
        "3gp" => "video/3gpp",
        "mp3" => "audio/mp3",
        "wav" => "audio/wav",
        "ogg" | "oga" => "audio/ogg",
        "flac" => "audio/flac",
        "m4a" => "audio/mp4",
        "aac" => "audio/aac",
        "aiff" => "audio/aiff",
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "webp" => "image/webp",
        "gif" => "image/gif",
        "pdf" => "application/pdf",
        _ => return None,
    })
}

pub fn tool_spec() -> Value {
    json!({"name":"analizar_medio_gemini","description":"Gemini mira y escucha un archivo de vídeo, audio o imagen y responde a tu pregunta sobre él (transcribir, describir escenas, encontrar momentos con su minuto, analizar el sonido…). 'ruta' es relativa al proyecto o la ruta completa de un archivo que el usuario adjuntó.","input_schema":{"type":"object","properties":{"ruta":{"type":"string"},"pregunta":{"type":"string"}},"required":["ruta","pregunta"],"additionalProperties":false}})
}

async fn upload(http: &reqwest::Client, key: &str, path: &Path, mime: &str) -> anyhow::Result<(String, String)> {
    let bytes = tokio::fs::read(path).await?;
    let name = path.file_name().map(|n| n.to_string_lossy().to_string()).unwrap_or_default();
    let start = http
        .post(format!("{API}/upload/v1beta/files"))
        .header("x-goog-api-key", key)
        .header("X-Goog-Upload-Protocol", "resumable")
        .header("X-Goog-Upload-Command", "start")
        .header("X-Goog-Upload-Header-Content-Length", bytes.len().to_string())
        .header("X-Goog-Upload-Header-Content-Type", mime)
        .json(&json!({"file": {"display_name": name}}))
        .send()
        .await?;
    if !start.status().is_success() {
        anyhow::bail!("Gemini (subida) {}: {}", start.status(), start.text().await.unwrap_or_default().chars().take(300).collect::<String>());
    }
    let url = start.headers().get("x-goog-upload-url").and_then(|v| v.to_str().ok()).ok_or_else(|| anyhow::anyhow!("Gemini no devolvió la URL de subida"))?.to_string();
    let v: Value = http
        .post(url)
        .header("X-Goog-Upload-Command", "upload, finalize")
        .header("X-Goog-Upload-Offset", "0")
        .timeout(Duration::from_secs(900))
        .body(bytes)
        .send()
        .await?
        .json()
        .await?;
    let file_name = v["file"]["name"].as_str().ok_or_else(|| anyhow::anyhow!("Subida fallida: {v}"))?.to_string();
    let uri = v["file"]["uri"].as_str().unwrap_or("").to_string();
    // Los vídeos se procesan antes de poder usarse
    for _ in 0..120 {
        let f: Value = http.get(format!("{API}/v1beta/{file_name}")).header("x-goog-api-key", key).send().await?.json().await?;
        match f["state"].as_str().unwrap_or("ACTIVE") {
            "ACTIVE" => return Ok((uri, file_name)),
            "FAILED" => anyhow::bail!("Gemini no pudo procesar el archivo"),
            _ => tokio::time::sleep(Duration::from_secs(3)).await,
        }
    }
    anyhow::bail!("Gemini tardó demasiado en procesar el archivo")
}

/// Devuelve (texto, tokens_entrada, tokens_salida)
pub async fn analyze(http: &reqwest::Client, key: &str, model: &str, path: &Path, question: &str) -> anyhow::Result<(String, u64, u64)> {
    let mime = mime_for(path).ok_or_else(|| anyhow::anyhow!("Formato no soportado: {}", path.display()))?;
    let size = std::fs::metadata(path)?.len();
    let (media_part, uploaded) = if size <= INLINE_MAX {
        let data = base64::engine::general_purpose::STANDARD.encode(tokio::fs::read(path).await?);
        (json!({"inline_data": {"mime_type": mime, "data": data}}), None)
    } else {
        let (uri, name) = upload(http, key, path, mime).await?;
        (json!({"file_data": {"mime_type": mime, "file_uri": uri}}), Some(name))
    };
    let body = json!({"contents": [{"role": "user", "parts": [media_part, {"text": question}]}]});
    // Si Gemini está saturado (503) o limita (429), reintenta y prueba otros modelos
    let models = [model, "gemini-3.5-flash", "gemini-flash-latest", "gemini-3.5-flash-lite"];
    let mut status = reqwest::StatusCode::SERVICE_UNAVAILABLE;
    let mut v = Value::Null;
    'outer: for m in models {
        for wait in [0u64, 3, 8] {
            if wait > 0 {
                tokio::time::sleep(Duration::from_secs(wait)).await;
            }
            let r = http.post(format!("{API}/v1beta/models/{m}:generateContent")).header("x-goog-api-key", key).timeout(Duration::from_secs(600)).json(&body).send().await?;
            status = r.status();
            v = r.json().await.unwrap_or(Value::Null);
            if status.is_success() {
                break 'outer;
            }
            if !(status.as_u16() == 503 || status.as_u16() == 429 || status.as_u16() == 500) {
                break 'outer;
            }
        }
    }
    if let Some(name) = uploaded {
        let _ = http.delete(format!("{API}/v1beta/{name}")).header("x-goog-api-key", key).send().await;
    }
    if !status.is_success() {
        anyhow::bail!("Gemini {status}: {}", v["error"]["message"].as_str().unwrap_or("error"));
    }
    let text = v["candidates"][0]["content"]["parts"].as_array().map(|ps| ps.iter().filter_map(|p| p["text"].as_str()).collect::<Vec<_>>().join("")).unwrap_or_default();
    let u = &v["usageMetadata"];
    Ok((text, u["promptTokenCount"].as_u64().unwrap_or(0), u["candidatesTokenCount"].as_u64().unwrap_or(0)))
}
