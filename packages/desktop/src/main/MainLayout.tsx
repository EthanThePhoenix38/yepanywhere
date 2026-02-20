import { useEffect, useState } from "react";
import { getServerStatus, startServer, stopServer, type AppConfig } from "../tauri";
import { Sidebar } from "./Sidebar";

interface Props {
  config: AppConfig;
  onConfigChange: (config: AppConfig) => void;
}

export function MainLayout({ config }: Props) {
  const [serverStatus, setServerStatus] = useState<string>("checking");

  useEffect(() => {
    const check = () => {
      getServerStatus()
        .then(setServerStatus)
        .catch(() => setServerStatus("error"));
    };
    check();
    const interval = setInterval(check, 3000);
    return () => clearInterval(interval);
  }, []);

  const handleRestart = async () => {
    setServerStatus("restarting");
    try {
      await stopServer();
      await startServer();
      setServerStatus("running");
    } catch {
      setServerStatus("error");
    }
  };

  return (
    <div style={{ height: "100vh", display: "flex" }}>
      <Sidebar
        serverStatus={serverStatus}
        port={config.port}
        onRestart={handleRestart}
      />
      <div style={{ flex: 1, position: "relative" }}>
        {/* Title bar drag region */}
        <div
          data-tauri-drag-region
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            height: 32,
            zIndex: 10,
          }}
        />
        {serverStatus === "running" ? (
          <iframe
            src={`http://localhost:${config.port}`}
            style={{
              width: "100%",
              height: "100%",
              border: "none",
              background: "#0a0a0a",
            }}
            title="Yep Anywhere"
          />
        ) : (
          <div
            style={{
              height: "100%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "var(--text-secondary)",
            }}
          >
            {serverStatus === "restarting"
              ? "Restarting server..."
              : serverStatus === "error"
                ? "Server error. Try restarting."
                : "Starting server..."}
          </div>
        )}
      </div>
    </div>
  );
}
