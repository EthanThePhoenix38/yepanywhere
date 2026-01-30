/**
 * HostPickerPage - Saved hosts list and login mode selection.
 *
 * Shows:
 * - List of saved hosts with status indicators and quick connect
 * - "Add Host" section with relay/login/direct options
 */

import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { YepAnywhereLogo } from "../components/YepAnywhereLogo";
import { useRemoteConnection } from "../contexts/RemoteConnectionContext";
import { type SavedHost, loadSavedHosts, removeHost } from "../lib/hostStorage";

type HostStatus = "online" | "offline" | "checking" | "unknown";

interface HostStatusMap {
  [hostId: string]: HostStatus;
}

export function HostPickerPage() {
  const navigate = useNavigate();
  const { isAutoResuming, connectViaRelay, connect } = useRemoteConnection();
  const [hosts, setHosts] = useState<SavedHost[]>([]);
  const [hostStatuses, setHostStatuses] = useState<HostStatusMap>({});
  const [connectingHostId, setConnectingHostId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Load hosts on mount
  useEffect(() => {
    const data = loadSavedHosts();
    setHosts(data.hosts);
  }, []);

  // Check status for relay hosts
  useEffect(() => {
    const relayHosts = hosts.filter((h) => h.mode === "relay");
    if (relayHosts.length === 0) return;

    // Mark all as checking
    setHostStatuses((prev) => {
      const next = { ...prev };
      for (const host of relayHosts) {
        if (!next[host.id]) {
          next[host.id] = "checking";
        }
      }
      return next;
    });

    // Check each relay host status
    for (const host of relayHosts) {
      checkRelayHostStatus(host).then((status) => {
        setHostStatuses((prev) => ({ ...prev, [host.id]: status }));
      });
    }
  }, [hosts]);

  // Check if a relay host's server is online via the relay
  const checkRelayHostStatus = useCallback(
    async (host: SavedHost): Promise<HostStatus> => {
      if (!host.relayUrl || !host.relayUsername) return "unknown";

      try {
        // Open WebSocket to relay and send client_connect to check if server is paired
        const ws = new WebSocket(host.relayUrl);

        return new Promise((resolve) => {
          const timeout = setTimeout(() => {
            ws.close();
            resolve("offline");
          }, 5000);

          ws.onopen = () => {
            ws.send(
              JSON.stringify({
                type: "client_connect",
                username: host.relayUsername,
              }),
            );
          };

          ws.onmessage = (event) => {
            try {
              const msg = JSON.parse(event.data);
              clearTimeout(timeout);
              ws.close();

              if (msg.type === "client_connected") {
                resolve("online");
              } else if (
                msg.type === "client_error" &&
                msg.error === "server_offline"
              ) {
                resolve("offline");
              } else if (
                msg.type === "client_error" &&
                msg.error === "unknown_username"
              ) {
                resolve("offline");
              } else {
                resolve("unknown");
              }
            } catch {
              resolve("unknown");
            }
          };

          ws.onerror = () => {
            clearTimeout(timeout);
            resolve("offline");
          };

          ws.onclose = () => {
            clearTimeout(timeout);
          };
        });
      } catch {
        return "offline";
      }
    },
    [],
  );

  // Connect to a saved host
  const handleConnectHost = useCallback(
    async (host: SavedHost) => {
      setConnectingHostId(host.id);
      setError(null);

      try {
        if (host.mode === "relay") {
          if (!host.relayUrl || !host.relayUsername) {
            throw new Error("Missing relay configuration");
          }

          // If host has a session, try to use it for auto-resume
          // Otherwise, navigate to relay login pre-filled
          if (host.session) {
            await connectViaRelay({
              relayUrl: host.relayUrl,
              relayUsername: host.relayUsername,
              srpUsername: host.srpUsername,
              srpPassword: "", // Ignored when session is provided
              rememberMe: true,
              onStatusChange: () => {},
              session: host.session,
            });
            // Success - RemoteApp will redirect to /projects
          } else {
            // No session - go to relay login pre-filled
            navigate(
              `/login/relay?u=${encodeURIComponent(host.relayUsername)}`,
            );
          }
        } else {
          // Direct mode
          if (!host.wsUrl) {
            throw new Error("Missing WebSocket URL");
          }

          if (host.session) {
            await connect(host.wsUrl, host.srpUsername, "", true);
            // Success - RemoteApp will redirect to /projects
          } else {
            // No session - go to direct login pre-filled
            navigate("/login/direct");
          }
        }
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Connection failed";
        // If session resumption failed, redirect to login page
        if (
          message.includes("Authentication failed") ||
          message.includes("invalid")
        ) {
          if (host.mode === "relay" && host.relayUsername) {
            navigate(
              `/login/relay?u=${encodeURIComponent(host.relayUsername)}`,
            );
          } else {
            navigate("/login/direct");
          }
        } else {
          setError(message);
        }
      } finally {
        setConnectingHostId(null);
      }
    },
    [connectViaRelay, connect, navigate],
  );

  // Delete a host
  const handleDeleteHost = useCallback(
    (hostId: string, e: React.MouseEvent) => {
      e.stopPropagation();
      if (confirm("Remove this saved host?")) {
        removeHost(hostId);
        setHosts((prev) => prev.filter((h) => h.id !== hostId));
      }
    },
    [],
  );

  // Format last connected time
  const formatLastConnected = (isoString?: string): string => {
    if (!isoString) return "";
    try {
      const date = new Date(isoString);
      const now = new Date();
      const diffMs = now.getTime() - date.getTime();
      const diffMins = Math.floor(diffMs / 60000);
      const diffHours = Math.floor(diffMs / 3600000);
      const diffDays = Math.floor(diffMs / 86400000);

      if (diffMins < 1) return "just now";
      if (diffMins < 60) return `${diffMins}m ago`;
      if (diffHours < 24) return `${diffHours}h ago`;
      if (diffDays < 7) return `${diffDays}d ago`;
      return date.toLocaleDateString();
    } catch {
      return "";
    }
  };

  // If auto-resume is in progress, show a loading screen
  if (isAutoResuming) {
    return (
      <div className="login-page">
        <div className="login-container">
          <div className="login-logo">
            <YepAnywhereLogo />
          </div>
          <p className="login-subtitle">Reconnecting...</p>
          <div className="login-loading" data-testid="auto-resume-loading">
            <div className="login-spinner" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="login-page">
      <div className="login-container">
        <div className="login-logo">
          <YepAnywhereLogo />
        </div>

        {hosts.length > 0 && (
          <>
            <p className="login-subtitle">Saved Hosts</p>

            <div className="host-picker-list" data-testid="saved-hosts-list">
              {hosts.map((host) => {
                const status = hostStatuses[host.id] ?? "unknown";
                const isConnecting = connectingHostId === host.id;

                return (
                  <button
                    key={host.id}
                    type="button"
                    className="host-picker-item"
                    onClick={() => handleConnectHost(host)}
                    disabled={isConnecting}
                    data-testid={`host-item-${host.id}`}
                  >
                    <div className="host-picker-item-main">
                      <span
                        className={`host-picker-status host-picker-status-${status}`}
                        title={status}
                      />
                      <span className="host-picker-name">
                        {host.displayName}
                      </span>
                      <span className="host-picker-mode">{host.mode}</span>
                    </div>
                    <div className="host-picker-item-meta">
                      {host.lastConnected && (
                        <span className="host-picker-last-connected">
                          {formatLastConnected(host.lastConnected)}
                        </span>
                      )}
                      <button
                        type="button"
                        className="host-picker-delete"
                        onClick={(e) => handleDeleteHost(host.id, e)}
                        title="Remove host"
                        data-testid={`delete-host-${host.id}`}
                      >
                        &times;
                      </button>
                    </div>
                    {isConnecting && (
                      <div className="host-picker-connecting">
                        <div className="login-spinner" />
                      </div>
                    )}
                  </button>
                );
              })}
            </div>

            {error && (
              <div className="login-error" data-testid="host-picker-error">
                {error}
              </div>
            )}

            <p className="login-subtitle host-picker-add-title">Add New Host</p>
          </>
        )}

        {hosts.length === 0 && (
          <p className="login-subtitle">How would you like to connect?</p>
        )}

        <div className="login-mode-options">
          <button
            type="button"
            className="login-mode-option"
            onClick={() => navigate("/login/relay")}
            data-testid="relay-mode-button"
          >
            <span className="login-mode-option-title">Connect via Relay</span>
            <span className="login-mode-option-desc">
              Use a relay server to connect from anywhere. No port forwarding
              needed.
            </span>
          </button>

          <button
            type="button"
            className="login-mode-option login-mode-option-secondary"
            onClick={() => navigate("/login/direct")}
            data-testid="direct-mode-button"
          >
            <span className="login-mode-option-title">Direct Connection</span>
            <span className="login-mode-option-desc">
              Connect directly via WebSocket URL. For LAN or Tailscale.
            </span>
          </button>
        </div>

        <p className="login-hint">
          {hosts.length > 0
            ? "Select a saved host above or add a new one."
            : 'Most users should choose "Connect via Relay" for the easiest setup.'}
        </p>
      </div>
    </div>
  );
}
