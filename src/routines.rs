//! Rutinas: prompts que se ejecutan solos ("every:60" = cada 60 min, "daily:09:00", "manual").
use crate::orchestrator::{run_request, AppState, RunCtx};
use crate::store::{now, uid, Chat};
use chrono::{Local, Timelike};
use std::sync::Arc;
use std::time::Duration;

fn due(schedule: &str, last: Option<&str>) -> bool {
    let last = last.and_then(|l| chrono::DateTime::parse_from_rfc3339(l).ok()).map(|d| d.with_timezone(&Local));
    if let Some(m) = schedule.strip_prefix("every:") {
        let mins: i64 = m.trim().parse().unwrap_or(0);
        if mins <= 0 {
            return false;
        }
        return last.map(|l| (Local::now() - l).num_minutes() >= mins).unwrap_or(true);
    }
    if let Some(t) = schedule.strip_prefix("daily:") {
        let (h, m) = t.split_once(':').unwrap_or(("9", "0"));
        let (h, m): (u32, u32) = (h.trim().parse().unwrap_or(9), m.trim().parse().unwrap_or(0));
        let n = Local::now();
        let passed = n.hour() * 60 + n.minute() >= h * 60 + m;
        let ran_today = last.map(|l| l.date_naive() == n.date_naive()).unwrap_or(false);
        return passed && !ran_today;
    }
    false
}

pub fn has_active(st: &AppState) -> bool {
    st.db.lock().unwrap().routines.iter().any(|r| r.enabled && r.schedule != "manual")
}

pub async fn run_now(st: Arc<AppState>, id: &str) -> anyhow::Result<String> {
    let (routine, chat_id) = {
        let mut db = st.db.lock().unwrap();
        let ext_r = st.ext.read().unwrap().routines.iter().find(|r| r.id == id).cloned();
        if !db.routines.iter().any(|r| r.id == id) {
            if let Some(r) = ext_r {
                db.routines.push(r);
            }
        }
        let projects: Vec<String> = db.projects.iter().map(|p| p.id.clone()).collect();
        let r = db.routines.iter_mut().find(|r| r.id == id).ok_or_else(|| anyhow::anyhow!("Rutina no encontrada"))?;
        r.last_run = Some(now());
        let r = r.clone();
        let existing = r.chat_id.clone().filter(|c| db.chats.iter().any(|x| &x.id == c));
        let chat_id = match existing {
            Some(c) => c,
            None => {
                let pid = r.project_id.clone().filter(|p| projects.contains(p));
                let c = Chat { id: uid("c_"), project_id: pid, title: format!("⏱ {}", r.name), created_at: now(), updated_at: now(), routine_id: Some(r.id.clone()), ..Default::default() };
                let cid = c.id.clone();
                db.chats.push(c);
                if let Some(rr) = db.routines.iter_mut().find(|x| x.id == id) {
                    rr.chat_id = Some(cid.clone());
                }
                cid
            }
        };
        st.mark();
        (r, chat_id)
    };
    let (tx, _rx) = tokio::sync::mpsc::unbounded_channel();
    let st2 = st.clone();
    let cid = chat_id.clone();
    tokio::spawn(async move {
        let _ = run_request(st2, cid, routine.prompt.clone(), routine.agent_id.clone(), vec![], tx, RunCtx { mode: "auto".into(), effort: String::new() }).await;
    });
    Ok(chat_id)
}

pub fn spawn_scheduler(st: Arc<AppState>) {
    tokio::spawn(async move {
        let mut tick = tokio::time::interval(Duration::from_secs(30));
        loop {
            tick.tick().await;
            let due_ids: Vec<String> = {
                let db = st.db.lock().unwrap();
                db.routines.iter().filter(|r| r.enabled && due(&r.schedule, r.last_run.as_deref())).map(|r| r.id.clone()).collect()
            };
            for id in due_ids {
                let _ = run_now(st.clone(), &id).await;
            }
        }
    });
}
