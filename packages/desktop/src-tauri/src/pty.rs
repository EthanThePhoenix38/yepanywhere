use portable_pty::{native_pty_system, CommandBuilder, PtySize};
use serde::Serialize;
use std::io::{Read, Write};
use std::sync::{Mutex, PoisonError};
use tauri::{AppHandle, Emitter, Manager};

use crate::config;

pub struct PtyState {
    writer: Mutex<Option<Box<dyn Write + Send>>>,
    alive: Mutex<bool>,
}

impl PtyState {
    pub fn new() -> Self {
        Self {
            writer: Mutex::new(None),
            alive: Mutex::new(false),
        }
    }
}

fn lock_err<T>(e: PoisonError<T>) -> String {
    e.to_string()
}

#[derive(Clone, Serialize)]
struct PtyOutput {
    data: String,
}

#[tauri::command]
pub async fn spawn_pty(app: AppHandle, command: String, args: Vec<String>) -> Result<(), String> {
    let pty_system = native_pty_system();

    let pair = pty_system
        .openpty(PtySize {
            rows: 24,
            cols: 80,
            pixel_width: 0,
            pixel_height: 0,
        })
        .map_err(|e| format!("Failed to open PTY: {e}"))?;

    let mut cmd = CommandBuilder::new(&command);
    for arg in &args {
        cmd.arg(arg);
    }

    // Add our bin dirs to PATH so claude/codex are found
    let data_dir = config::data_dir();
    let node_bin = data_dir.join("node_modules").join(".bin");
    let bin_dir = config::bin_dir();
    let current_path = std::env::var("PATH").unwrap_or_default();
    let new_path = format!(
        "{}:{}:{}",
        node_bin.display(),
        bin_dir.display(),
        current_path
    );
    cmd.env("PATH", new_path);

    let _child = pair
        .slave
        .spawn_command(cmd)
        .map_err(|e| format!("Failed to spawn command: {e}"))?;

    // Store writer for sending input
    let writer = pair
        .master
        .take_writer()
        .map_err(|e| format!("Failed to get PTY writer: {e}"))?;

    let state = app.state::<PtyState>();
    *state.writer.lock().map_err(lock_err)? = Some(writer);
    *state.alive.lock().map_err(lock_err)? = true;

    // Read PTY output in background and emit events
    let mut reader = pair
        .master
        .try_clone_reader()
        .map_err(|e| format!("Failed to get PTY reader: {e}"))?;

    let app_clone = app.clone();
    std::thread::spawn(move || {
        let mut buf = [0u8; 4096];
        loop {
            match reader.read(&mut buf) {
                Ok(0) => break,
                Ok(n) => {
                    let data = String::from_utf8_lossy(&buf[..n]).to_string();
                    let _ = app_clone.emit("pty-output", PtyOutput { data });
                }
                Err(_) => break,
            }
        }
        let state = app_clone.state::<PtyState>();
        if let Ok(mut alive) = state.alive.lock() {
            *alive = false;
        }
        let _ = app_clone.emit("pty-exit", ());
    });

    Ok(())
}

#[tauri::command]
pub async fn write_pty(app: AppHandle, data: String) -> Result<(), String> {
    let state = app.state::<PtyState>();
    let mut writer_lock = state.writer.lock().map_err(lock_err)?;

    if let Some(ref mut writer) = *writer_lock {
        writer
            .write_all(data.as_bytes())
            .map_err(|e| format!("Failed to write to PTY: {e}"))?;
        writer.flush().map_err(|e| format!("Failed to flush PTY: {e}"))?;
    } else {
        return Err("No PTY session active".to_string());
    }

    Ok(())
}

#[tauri::command]
pub async fn kill_pty(app: AppHandle) -> Result<(), String> {
    let state = app.state::<PtyState>();
    *state.writer.lock().map_err(lock_err)? = None;
    *state.alive.lock().map_err(lock_err)? = false;
    Ok(())
}
