use std::sync::Mutex;
use tauri::{AppHandle, Manager};
use tokio::process::{Child, Command};

use crate::config;

pub struct ServerState {
    pub child: Mutex<Option<Child>>,
}

impl ServerState {
    pub fn new() -> Self {
        Self {
            child: Mutex::new(None),
        }
    }
}

/// Resolve the path to the bundled Bun sidecar binary.
fn bun_path(app: &AppHandle) -> Result<std::path::PathBuf, String> {
    app.path()
        .resource_dir()
        .map(|dir| {
            let triple = env!("TARGET_TRIPLE");
            let bin_name = if cfg!(windows) {
                format!("binaries/bun-{triple}.exe")
            } else {
                format!("binaries/bun-{triple}")
            };
            dir.join(bin_name)
        })
        .map_err(|e| format!("Could not resolve resource dir: {e}"))
}

/// Find the yep server entry point.
fn server_entry() -> Result<std::path::PathBuf, String> {
    let installed = config::data_dir()
        .join("node_modules")
        .join("yepanywhere")
        .join("dist")
        .join("index.js");
    if installed.exists() {
        return Ok(installed);
    }

    Err("Yep Anywhere server not found. Run setup first.".to_string())
}

#[tauri::command]
pub async fn start_server(app: AppHandle) -> Result<(), String> {
    let state = app.state::<ServerState>();

    {
        let child_lock = state.child.lock().map_err(|e| e.to_string())?;
        if child_lock.is_some() {
            return Err("Server is already running".to_string());
        }
    }

    let bun = bun_path(&app)?;
    let entry = server_entry()?;
    let cfg = config::load_config();
    let data_dir = config::data_dir();

    let child = Command::new(&bun)
        .arg("run")
        .arg(&entry)
        .env("NODE_ENV", "production")
        .env("PORT", cfg.port.to_string())
        .env("YEP_ANYWHERE_DATA_DIR", data_dir.to_string_lossy().as_ref())
        .kill_on_drop(true)
        .spawn()
        .map_err(|e| format!("Failed to start server: {e}"))?;

    let mut child_lock = state.child.lock().map_err(|e| e.to_string())?;
    *child_lock = Some(child);
    Ok(())
}

#[tauri::command]
pub async fn stop_server(app: AppHandle) -> Result<(), String> {
    let state = app.state::<ServerState>();

    // Take the child out of the mutex so we don't hold the lock across .await
    let child = {
        let mut child_lock = state.child.lock().map_err(|e| e.to_string())?;
        child_lock.take()
    };

    if let Some(mut child) = child {
        child.kill().await.map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub async fn get_server_status(app: AppHandle) -> Result<String, String> {
    let state = app.state::<ServerState>();
    let mut child_lock = state.child.lock().map_err(|e| e.to_string())?;

    match child_lock.as_mut() {
        None => Ok("stopped".to_string()),
        Some(child) => match child.try_wait() {
            Ok(Some(_status)) => {
                *child_lock = None;
                Ok("stopped".to_string())
            }
            Ok(None) => Ok("running".to_string()),
            Err(e) => Err(e.to_string()),
        },
    }
}
