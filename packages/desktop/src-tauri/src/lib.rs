mod config;
mod installer;
mod pty;
mod server;
mod tray;

use tauri::Manager;

#[tauri::command]
fn get_config() -> Result<config::AppConfig, String> {
    Ok(config::load_config())
}

#[tauri::command]
fn save_app_config(cfg: config::AppConfig) -> Result<(), String> {
    config::save_config(&cfg)
}

#[tauri::command]
fn get_data_dir() -> String {
    config::data_dir().to_string_lossy().to_string()
}

pub fn run() {
    let mut builder = tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_dialog::init());

    // Desktop-only plugins
    #[cfg(not(any(target_os = "android", target_os = "ios")))]
    {
        builder = builder
            .plugin(tauri_plugin_updater::Builder::new().build())
            .plugin(tauri_plugin_process::init())
            .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.show();
                    let _ = window.set_focus();
                }
            }))
            .plugin(tauri_plugin_autostart::init(
                tauri_plugin_autostart::MacosLauncher::LaunchAgent,
                None,
            ))
            .plugin(tauri_plugin_window_state::Builder::default().build());
    }

    builder
        .manage(server::ServerState::new())
        .manage(pty::PtyState::new())
        .invoke_handler(tauri::generate_handler![
            get_config,
            save_app_config,
            get_data_dir,
            server::start_server,
            server::stop_server,
            server::get_server_status,
            installer::install_yep_server,
            installer::install_claude,
            installer::install_codex,
            installer::check_agent_installed,
            pty::spawn_pty,
            pty::write_pty,
            pty::kill_pty,
        ])
        .setup(|app| {
            // Setup system tray
            tray::setup_tray(app.handle())?;

            // Show window after setup (avoids white flash)
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.show();
            }

            // Auto-start server if setup is complete
            let cfg = config::load_config();
            if cfg.setup_complete {
                let handle = app.handle().clone();
                tauri::async_runtime::spawn(async move {
                    let _ = server::start_server(handle).await;
                });
            }

            Ok(())
        })
        .on_window_event(|window, event| {
            // Close to tray instead of quitting
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                let _ = window.hide();
                api.prevent_close();
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
