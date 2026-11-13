//! Plugins, skills y conectores.
//!
//! <datos>/plugins/<id>/plugin.json → { id, name, version, description, author, agents:[], connectors:[], routines:[] }
//! <datos>/plugins/<id>/skills/*.md → skills del plugin
//! <datos>/skills/*.md              → skills del usuario
//!
//! Skill = .md con frontmatter (name, description, agents, keywords). Solo se inyecta cuando
//! encaja con el agente y la tarea, así no se paga por instrucciones que no se usan.
use crate::store::{Agent, Routine, SkillDirCfg};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::path::{Path, PathBuf};

#[derive(Serialize, Clone, Default)]
#[serde(rename_all = "camelCase")]
pub struct Skill {
    pub id: String,
    pub name: String,
    pub description: String,
    pub agents: Vec<String>,
    pub keywords: Vec<String>,
    pub body: String,
    pub source: String,
    pub file: String,
}

#[derive(Serialize, Deserialize, Clone, Default)]
#[serde(default, rename_all = "camelCase")]
pub struct Connector {
    pub id: String,
    pub name: String,
    #[serde(rename = "type")]
    pub kind: String, // "folder" | "file" | "http"
    pub description: String,
    pub path: String,
    pub url: String,
    pub extensions: String,
    pub keywords: String,
    pub headers: std::collections::BTreeMap<String, String>,
    #[serde(skip_deserializing)]
    pub plugin: String,
    #[serde(skip)]
    pub base_dir: PathBuf,
}

#[derive(Serialize, Clone, Default)]
#[serde(rename_all = "camelCase")]
pub struct PluginInfo {
    pub id: String,
    pub name: String,
    pub version: String,
    pub description: String,
    pub author: String,
    pub agents: usize,
    pub skills: usize,
    pub connectors: usize,
    pub routines: usize,
    pub error: Option<String>,
}

#[derive(Default, Clone, Serialize)]
pub struct Extensions {
    pub plugins: Vec<PluginInfo>,
    pub skills: Vec<Skill>,
    pub connectors: Vec<Connector>,
    pub agents: Vec<Agent>,
    pub routines: Vec<Routine>,
}

fn split_list(s: &str) -> Vec<String> {
    s.split(',').map(|x| x.trim().to_lowercase()).filter(|x| !x.is_empty()).collect()
}

fn parse_frontmatter(src: &str) -> (Vec<(String, String)>, String) {
    let src = src.trim_start_matches('\u{feff}');
    if let Some(rest) = src.strip_prefix("---") {
        if let Some(end) = rest.find("\n---") {
            let head = &rest[..end];
            let body = rest[end + 4..].trim_start_matches(['\r', '\n']).trim().to_string();
            let meta = head
                .lines()
                .filter_map(|l| l.split_once(':').map(|(k, v)| (k.trim().to_string(), v.trim().to_string())))
                .collect();
            return (meta, body);
        }
    }
    (vec![], src.to_string())
}

fn read_skills(dir: &Path, source: &str) -> Vec<Skill> {
    let Ok(rd) = std::fs::read_dir(dir) else { return vec![] };
    rd.flatten()
        .filter(|e| e.path().extension().map(|x| x == "md").unwrap_or(false))
        .filter_map(|e| {
            let txt = std::fs::read_to_string(e.path()).ok()?;
            let (meta, body) = parse_frontmatter(&txt);
            let get = |k: &str| meta.iter().find(|(a, _)| a == k).map(|(_, v)| v.clone()).unwrap_or_default();
            let stem = e.path().file_stem()?.to_string_lossy().to_string();
            let name = if get("name").is_empty() { stem } else { get("name") };
            Some(Skill {
                id: if source.is_empty() { name.clone() } else { format!("{source}/{name}") },
                description: get("description"),
                agents: split_list(&get("agents")),
                keywords: split_list(&get("keywords")),
                body,
                source: if source.is_empty() { "usuario".into() } else { source.into() },
                file: e.path().to_string_lossy().to_string(),
                name,
            })
        })
        .collect()
}

/// Skills en formato Claude: <carpeta>/<skill>/SKILL.md
fn read_claude_skills(dir: &SkillDirCfg) -> Vec<Skill> {
    let Ok(rd) = std::fs::read_dir(&dir.path) else { return vec![] };
    let source = if dir.label.is_empty() { "externa".to_string() } else { dir.label.clone() };
    rd.flatten()
        .filter_map(|e| {
            let f = e.path().join("SKILL.md");
            let txt = std::fs::read_to_string(&f).ok()?;
            let (meta, body) = parse_frontmatter(&txt);
            let get = |k: &str| meta.iter().find(|(a, _)| a == k).map(|(_, v)| v.trim_matches(&[34 as char, 39 as char][..]).to_string()).unwrap_or_default();
            let folder = e.file_name().to_string_lossy().to_string();
            let name = if get("name").is_empty() { folder.clone() } else { get("name") };
            let mut keywords = split_list(&get("keywords"));
            if keywords.is_empty() {
                keywords = name.split(|c: char| c == 39 as char || c == 45 as char || c == 95 as char).filter(|w| w.chars().count() > 3).map(|w| w.to_lowercase()).collect();
            }
            Some(Skill {
                id: format!("{}/{}", source.to_lowercase().replace(32 as char, "-"), name),
                description: get("description").chars().take(300).collect(),
                agents: dir.agents.clone(),
                keywords,
                body: crate::context::truncate(&body, 6000),
                source: source.clone(),
                file: f.to_string_lossy().to_string(),
                name,
            })
        })
        .collect()
}

pub fn load(data: &Path, extra: &[SkillDirCfg]) -> Extensions {
    let plugins_dir = data.join("plugins");
    let skills_dir = data.join("skills");
    let _ = std::fs::create_dir_all(&plugins_dir);
    let _ = std::fs::create_dir_all(&skills_dir);
    let mut ext = Extensions { skills: read_skills(&skills_dir, ""), ..Default::default() };
    for d in extra {
        ext.skills.extend(read_claude_skills(d));
    }
    let Ok(rd) = std::fs::read_dir(&plugins_dir) else { return ext };
    for e in rd.flatten() {
        let base = e.path();
        let manifest = base.join("plugin.json");
        if !manifest.exists() {
            continue;
        }
        let dir_name = e.file_name().to_string_lossy().to_string();
        let parsed: Result<Value, _> = std::fs::read_to_string(&manifest).map_err(|e| e.to_string()).and_then(|t| serde_json::from_str(&t).map_err(|e| e.to_string()));
        let m = match parsed {
            Ok(v) => v,
            Err(err) => {
                ext.plugins.push(PluginInfo { id: dir_name.clone(), name: dir_name, error: Some(err), ..Default::default() });
                continue;
            }
        };
        let s = |k: &str| m.get(k).and_then(|v| v.as_str()).unwrap_or("").to_string();
        let id = if s("id").is_empty() { dir_name.clone() } else { s("id") };
        let skills = read_skills(&base.join("skills"), &id);
        let agents: Vec<Agent> = m.get("agents").and_then(|v| serde_json::from_value(v.clone()).ok()).unwrap_or_default();
        let connectors: Vec<Connector> = m.get("connectors").and_then(|v| serde_json::from_value(v.clone()).ok()).unwrap_or_default();
        let routines: Vec<Routine> = m.get("routines").and_then(|v| serde_json::from_value(v.clone()).ok()).unwrap_or_default();
        ext.plugins.push(PluginInfo {
            id: id.clone(),
            name: if s("name").is_empty() { id.clone() } else { s("name") },
            version: s("version"),
            description: s("description"),
            author: s("author"),
            agents: agents.len(),
            skills: skills.len(),
            connectors: connectors.len(),
            routines: routines.len(),
            error: None,
        });
        ext.skills.extend(skills);
        ext.agents.extend(agents.into_iter().map(|mut a| {
            a.plugin = Some(id.clone());
            a
        }));
        ext.connectors.extend(connectors.into_iter().map(|mut c| {
            if c.id.is_empty() {
                c.id = c.name.clone();
            }
            c.plugin = id.clone();
            c.base_dir = base.clone();
            c
        }));
        ext.routines.extend(routines.into_iter().map(|mut r| {
            r.plugin = Some(id.clone());
            if r.id.is_empty() {
                r.id = format!("{id}/{}", r.name);
            }
            r
        }));
    }
    ext
}

impl Extensions {
    pub fn pick_skills(&self, agent_id: &str, task: &str, explicit: &[String]) -> Vec<Skill> {
        let t = task.to_lowercase();
        self.skills
            .iter()
            .filter(|s| {
                if explicit.iter().any(|e| *e == s.id || *e == s.name) {
                    return true;
                }
                if !s.agents.is_empty() && !s.agents.iter().any(|a| a == agent_id) {
                    return false;
                }
                s.keywords.iter().any(|k| t.contains(k.as_str()))
            })
            .take(4)
            .cloned()
            .collect()
    }

    pub fn pick_connectors(&self, task: &str, explicit: &[String]) -> Vec<Connector> {
        let t = task.to_lowercase();
        self.connectors
            .iter()
            .filter(|c| explicit.contains(&c.id) || split_list(&c.keywords).iter().any(|k| t.contains(k.as_str())))
            .take(3)
            .cloned()
            .collect()
    }
}

pub async fn run_connector(http: &reqwest::Client, c: &Connector, max_chars: usize) -> String {
    let res: anyhow::Result<String> = async {
        match c.kind.as_str() {
            "http" => {
                let mut rq = http.get(&c.url);
                for (k, v) in &c.headers {
                    rq = rq.header(k, v);
                }
                Ok(rq.send().await?.text().await?)
            }
            "file" => Ok(std::fs::read_to_string(c.base_dir.join(&c.path))?),
            "folder" => {
                let dir = c.base_dir.join(&c.path);
                let exts = split_list(if c.extensions.is_empty() { ".md,.txt,.json" } else { &c.extensions });
                let mut out = String::new();
                let mut entries: Vec<_> = std::fs::read_dir(&dir)?.flatten().collect();
                entries.sort_by_key(|e| e.file_name());
                for e in entries {
                    let n = e.file_name().to_string_lossy().to_lowercase();
                    if !exts.iter().any(|x| n.ends_with(x.as_str())) {
                        continue;
                    }
                    if let Ok(t) = std::fs::read_to_string(e.path()) {
                        out.push_str(&format!("\n### {}\n{}\n", e.file_name().to_string_lossy(), t));
                    }
                    if out.len() > max_chars {
                        break;
                    }
                }
                Ok(out)
            }
            other => Ok(format!("(tipo de conector no soportado: {other})")),
        }
    }
    .await;
    match res {
        Ok(t) => crate::context::truncate(&t, max_chars),
        Err(e) => format!("(error en conector {}: {e})", c.id),
    }
}
