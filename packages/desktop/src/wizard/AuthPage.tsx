import { useEffect, useRef, useState } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";
import { spawnPty, writePty, onPtyOutput, onPtyExit } from "../tauri";

interface Props {
  agents: string[];
  onNext: () => void;
}

export function AuthPage({ agents, onNext }: Props) {
  const termRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const [started, setStarted] = useState(false);
  const [exited, setExited] = useState(false);

  useEffect(() => {
    if (!termRef.current) return;

    const term = new Terminal({
      theme: {
        background: "#0a0a0a",
        foreground: "#e5e5e5",
        cursor: "#e5e5e5",
      },
      fontSize: 13,
      fontFamily: "Menlo, Monaco, 'Courier New', monospace",
      cursorBlink: true,
    });
    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.open(termRef.current);
    fitAddon.fit();
    terminalRef.current = term;

    // Forward keystrokes to PTY
    term.onData((data) => {
      writePty(data).catch(() => {});
    });

    // Listen for PTY output
    const unlistenOutput = onPtyOutput((data) => {
      term.write(data);
    });

    const unlistenExit = onPtyExit(() => {
      setExited(true);
      term.writeln("\r\n[Process exited]");
    });

    // Resize handler
    const resizeObserver = new ResizeObserver(() => fitAddon.fit());
    resizeObserver.observe(termRef.current);

    return () => {
      unlistenOutput.then((fn) => fn());
      unlistenExit.then((fn) => fn());
      resizeObserver.disconnect();
      term.dispose();
    };
  }, []);

  const startAuth = async () => {
    setStarted(true);
    try {
      // claude login uses the installed binary
      await spawnPty("claude", ["login"]);
    } catch (e) {
      terminalRef.current?.writeln(`\r\nError: ${e}`);
    }
  };

  const hasClaude = agents.includes("claude");

  return (
    <div style={{ width: "100%", maxWidth: 500 }}>
      <h2 style={{ fontSize: 22, fontWeight: 600, marginBottom: 8 }}>
        Sign in to your agents
      </h2>
      <p
        style={{
          color: "var(--text-secondary)",
          fontSize: 14,
          marginBottom: 16,
        }}
      >
        {hasClaude
          ? "Click the button below, then press Enter in the terminal to open your browser and sign in."
          : "No agents require authentication. You can skip this step."}
      </p>

      {hasClaude && (
        <>
          <div
            ref={termRef}
            style={{
              height: 250,
              borderRadius: 8,
              overflow: "hidden",
              border: "1px solid var(--border)",
              marginBottom: 16,
            }}
          />

          {!started && (
            <button
              className="btn-primary"
              onClick={startAuth}
              style={{ width: "100%", marginBottom: 12 }}
            >
              Start Sign In
            </button>
          )}
        </>
      )}

      <div style={{ display: "flex", gap: 12 }}>
        <button
          className="btn-secondary"
          onClick={onNext}
          style={{ flex: 1 }}
        >
          Skip
        </button>
        <button
          className="btn-primary"
          onClick={onNext}
          disabled={hasClaude && started && !exited}
          style={{ flex: 1 }}
        >
          {exited || !hasClaude ? "Continue" : "Waiting..."}
        </button>
      </div>
    </div>
  );
}
