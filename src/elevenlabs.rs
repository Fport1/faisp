//! ElevenLabs: tus voces, texto a voz, efectos de sonido y música, como herramientas de los agentes.
//! API REST oficial (cabecera xi-api-key). Los audios se guardan como .mp3; para Minecraft (.ogg)
//! el agente puede convertirlos con la herramienta convertir_medio del Modpack Launcher.
use serde_json::{json, Value};
use std::time::Duration;

const BASE: &str = "https://api.elevenlabs.io";

pub fn tool_specs() -> Vec<Value> {
    vec![
        json!({"name":"elevenlabs_voces","description":"Lista las voces de la cuenta de ElevenLabs del usuario (nombre, voice_id, tipo). Úsalo antes de generar voz para elegir la voz correcta.","input_schema":{"type":"object","properties":{"buscar":{"type":"string","description":"Filtro por nombre (opcional)"}},"additionalProperties":false}}),
        json!({"name":"elevenlabs_voz","description":"Convierte texto en voz con una voz de ElevenLabs y guarda un .mp3. 'archivo' es la ruta relativa al proyecto (p. ej. assets/sounds/narrador/intro.mp3).","input_schema":{"type":"object","properties":{"texto":{"type":"string"},"voice_id":{"type":"string"},"archivo":{"type":"string"},"model_id":{"type":"string","description":"Opcional; por defecto eleven_multilingual_v2"}},"required":["texto","voice_id","archivo"],"additionalProperties":false}}),
        json!({"name":"elevenlabs_efecto","description":"Genera un efecto de sonido a partir de una descripción (0.5–30 s) y lo guarda como .mp3.","input_schema":{"type":"object","properties":{"descripcion":{"type":"string"},"segundos":{"type":"number"},"bucle":{"type":"boolean"},"archivo":{"type":"string"}},"required":["descripcion","archivo"],"additionalProperties":false}}),
        json!({"name":"elevenlabs_musica","description":"Compone música a partir de una descripción (3–600 s) y la guarda como .mp3.","input_schema":{"type":"object","properties":{"descripcion":{"type":"string"},"segundos":{"type":"number"},"instrumental":{"type":"boolean"},"archivo":{"type":"string"}},"required":["descripcion","archivo"],"additionalProperties":false}}),
    ]
}

pub async fn list_voices(http: &reqwest::Client, key: &str, search: &str) -> anyhow::Result<String> {
    let mut out = Vec::new();
    let mut token: Option<String> = None;
    for _ in 0..5 {
        let mut rb = http.get(format!("{BASE}/v2/voices")).header("xi-api-key", key).query(&[("page_size", "100")]);
        if !search.is_empty() {
            rb = rb.query(&[("search", search)]);
        }
        if let Some(t) = &token {
            rb = rb.query(&[("next_page_token", t.as_str())]);
        }
        let v: Value = rb.send().await?.error_for_status()?.json().await?;
        for voice in v["voices"].as_array().cloned().unwrap_or_default() {
            out.push(format!("- {} — voice_id: {} — {}", voice["name"].as_str().unwrap_or("?"), voice["voice_id"].as_str().unwrap_or("?"), voice["category"].as_str().unwrap_or("")));
        }
        if !v["has_more"].as_bool().unwrap_or(false) {
            break;
        }
        token = v["next_page_token"].as_str().map(String::from);
    }
    Ok(if out.is_empty() { "No hay voces (o la búsqueda no encontró ninguna).".into() } else { out.join("\n") })
}

async fn audio(rb: reqwest::RequestBuilder) -> anyhow::Result<Vec<u8>> {
    let r = rb.timeout(Duration::from_secs(300)).send().await?;
    if !r.status().is_success() {
        let s = r.status();
        anyhow::bail!("ElevenLabs {s}: {}", r.text().await.unwrap_or_default().chars().take(300).collect::<String>());
    }
    Ok(r.bytes().await?.to_vec())
}

pub async fn tts(http: &reqwest::Client, key: &str, voice_id: &str, text: &str, model: &str) -> anyhow::Result<Vec<u8>> {
    let model = if model.is_empty() { "eleven_multilingual_v2" } else { model };
    audio(http.post(format!("{BASE}/v1/text-to-speech/{voice_id}")).query(&[("output_format", "mp3_44100_128")]).header("xi-api-key", key).json(&json!({"text": text, "model_id": model}))).await
}

pub async fn sound(http: &reqwest::Client, key: &str, prompt: &str, secs: Option<f64>, looped: bool) -> anyhow::Result<Vec<u8>> {
    let mut body = json!({"text": prompt, "loop": looped});
    if let Some(s) = secs {
        body["duration_seconds"] = json!(s.clamp(0.5, 30.0));
    }
    audio(http.post(format!("{BASE}/v1/sound-generation")).query(&[("output_format", "mp3_44100_128")]).header("xi-api-key", key).json(&body)).await
}

pub async fn music(http: &reqwest::Client, key: &str, prompt: &str, secs: Option<f64>, instrumental: bool) -> anyhow::Result<Vec<u8>> {
    let mut body = json!({"prompt": prompt, "force_instrumental": instrumental});
    if let Some(s) = secs {
        body["music_length_ms"] = json!((s.clamp(3.0, 600.0) * 1000.0) as u64);
    }
    audio(http.post(format!("{BASE}/v1/music")).header("xi-api-key", key).json(&body)).await
}
