interface Props {
  serverStatus: string;
  port: number;
  onRestart: () => void;
}

export function Sidebar({ serverStatus, port, onRestart }: Props) {
  const statusColor =
    serverStatus === "running"
      ? "var(--success)"
      : serverStatus === "error"
        ? "var(--error)"
        : "var(--warning)";

  return (
    <div
      style={{
        width: 200,
        background: "var(--bg-secondary)",
        borderRight: "1px solid var(--border)",
        display: "flex",
        flexDirection: "column",
        padding: 16,
      }}
    >
      {/* Drag region for title bar */}
      <div data-tauri-drag-region style={{ height: 32, flexShrink: 0 }} />

      {/* Server status */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          marginBottom: 8,
        }}
      >
        <div
          style={{
            width: 8,
            height: 8,
            borderRadius: "50%",
            background: statusColor,
          }}
        />
        <span style={{ fontSize: 13, color: "var(--text-secondary)" }}>
          {serverStatus === "running"
            ? `Running on :${port}`
            : serverStatus === "error"
              ? "Server error"
              : "Starting..."}
        </span>
      </div>

      <button
        className="btn-secondary"
        onClick={onRestart}
        style={{
          fontSize: 13,
          padding: "6px 12px",
          marginBottom: 16,
        }}
      >
        Restart Server
      </button>

      <div style={{ flex: 1 }} />

      <div
        style={{
          fontSize: 11,
          color: "var(--text-secondary)",
          textAlign: "center",
        }}
      >
        Yep Anywhere v0.1.0
      </div>
    </div>
  );
}
