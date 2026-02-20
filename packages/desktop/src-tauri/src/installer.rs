use serde::Serialize;
use std::fs;
use tauri::{AppHandle, Emitter, Manager};
use tokio::process::Command;

use crate::config;

#[derive(Clone, Serialize)]
struct InstallProgress {
    agent: String,
    status: String,
    message: String,
}

/// Resolve the bundled Bun binary path.
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

fn emit_progress(app: &AppHandle, agent: &str, status: &str, message: &str) {
    let _ = app.emit(
        "install-progress",
        InstallProgress {
            agent: agent.to_string(),
            status: status.to_string(),
            message: message.to_string(),
        },
    );
}

#[tauri::command]
pub async fn install_yep_server(app: AppHandle) -> Result<(), String> {
    let bun = bun_path(&app)?;
    let data_dir = config::data_dir();
    fs::create_dir_all(&data_dir).map_err(|e| e.to_string())?;

    emit_progress(&app, "yep", "installing", "Installing Yep Anywhere server...");

    let output = Command::new(&bun)
        .args(["install", "yepanywhere"])
        .current_dir(&data_dir)
        .output()
        .await
        .map_err(|e| format!("Failed to run bun install: {e}"))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        emit_progress(&app, "yep", "error", &format!("Install failed: {stderr}"));
        return Err(format!("bun install failed: {stderr}"));
    }

    emit_progress(&app, "yep", "done", "Yep Anywhere server installed");
    Ok(())
}

#[tauri::command]
pub async fn install_claude(app: AppHandle) -> Result<(), String> {
    let bun = bun_path(&app)?;
    let data_dir = config::data_dir();
    fs::create_dir_all(&data_dir).map_err(|e| e.to_string())?;

    emit_progress(&app, "claude", "installing", "Installing Claude Code...");

    let output = Command::new(&bun)
        .args(["install", "@anthropic-ai/claude-code"])
        .current_dir(&data_dir)
        .output()
        .await
        .map_err(|e| format!("Failed to run bun install: {e}"))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        emit_progress(
            &app,
            "claude",
            "error",
            &format!("Install failed: {stderr}"),
        );
        return Err(format!("bun install failed: {stderr}"));
    }

    emit_progress(&app, "claude", "done", "Claude Code installed");
    Ok(())
}

#[tauri::command]
pub async fn install_codex(app: AppHandle) -> Result<(), String> {
    let bin_dir = config::bin_dir();
    fs::create_dir_all(&bin_dir).map_err(|e| e.to_string())?;

    emit_progress(&app, "codex", "installing", "Downloading Codex CLI...");

    // Get latest release info from GitHub API
    let client = reqwest::Client::new();
    let resp = client
        .get("https://api.github.com/repos/openai/codex/releases/latest")
        .header("User-Agent", "yep-anywhere-desktop")
        .send()
        .await
        .map_err(|e| format!("Failed to fetch release info: {e}"))?;

    let release: serde_json::Value = resp
        .json()
        .await
        .map_err(|e| format!("Failed to parse release info: {e}"))?;

    // Find the right asset for this platform
    let asset_pattern = if cfg!(target_os = "macos") {
        if cfg!(target_arch = "aarch64") {
            "darwin-arm64"
        } else {
            "darwin-x64"
        }
    } else if cfg!(target_os = "windows") {
        "win32-x64"
    } else if cfg!(target_arch = "aarch64") {
        "linux-arm64"
    } else {
        "linux-x64"
    };

    let assets = release["assets"]
        .as_array()
        .ok_or("No assets in release")?;
    let asset = assets
        .iter()
        .find(|a| {
            a["name"]
                .as_str()
                .is_some_and(|n: &str| n.contains(asset_pattern))
        })
        .ok_or(format!("No asset found for platform: {asset_pattern}"))?;

    let download_url = asset["browser_download_url"]
        .as_str()
        .ok_or("No download URL")?;

    emit_progress(&app, "codex", "downloading", "Downloading...");

    let bytes = client
        .get(download_url)
        .send()
        .await
        .map_err(|e| format!("Download failed: {e}"))?
        .bytes()
        .await
        .map_err(|e| format!("Download failed: {e}"))?;

    let codex_bin = if cfg!(windows) {
        bin_dir.join("codex.exe")
    } else {
        bin_dir.join("codex")
    };

    // Codex releases are tar.gz archives — extract the binary
    // For now, write raw bytes and we'll handle extraction properly
    fs::write(&codex_bin, &bytes).map_err(|e| format!("Failed to write binary: {e}"))?;

    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        fs::set_permissions(&codex_bin, fs::Permissions::from_mode(0o755))
            .map_err(|e| format!("Failed to set permissions: {e}"))?;
    }

    emit_progress(&app, "codex", "done", "Codex CLI installed");
    Ok(())
}

#[tauri::command]
pub async fn check_agent_installed(agent: String) -> Result<bool, String> {
    match agent.as_str() {
        "claude" => {
            let path = config::data_dir()
                .join("node_modules")
                .join(".bin")
                .join("claude");
            Ok(path.exists())
        }
        "codex" => {
            let path = config::bin_dir().join(if cfg!(windows) {
                "codex.exe"
            } else {
                "codex"
            });
            Ok(path.exists())
        }
        "yep" => {
            let path = config::data_dir()
                .join("node_modules")
                .join("yepanywhere")
                .join("dist")
                .join("index.js");
            Ok(path.exists())
        }
        _ => Err(format!("Unknown agent: {agent}")),
    }
}
