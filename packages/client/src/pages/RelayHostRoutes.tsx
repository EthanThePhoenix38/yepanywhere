/**
 * RelayHostRoutes - Wrapper for relay host URL-based routing.
 *
 * Handles /remote/:relayUsername/* routes:
 * - Extracts relayUsername from URL
 * - Looks up saved host by username
 * - Initiates connection if host found with valid session
 * - Redirects to login if no saved session
 */

import { useEffect, useState } from "react";
import { Navigate, Route, Routes, useParams } from "react-router-dom";
import { FloatingActionButton } from "../components/FloatingActionButton";
import { HostOfflineModal } from "../components/HostOfflineModal";
import { InboxProvider } from "../contexts/InboxContext";
import {
  type AutoResumeError,
  useRemoteConnection,
} from "../contexts/RemoteConnectionContext";
import { SchemaValidationProvider } from "../contexts/SchemaValidationContext";
import { useNeedsAttentionBadge } from "../hooks/useNeedsAttentionBadge";
import { useSyncNotifyInAppSetting } from "../hooks/useNotifyInApp";
import { useRemoteActivityBusConnection } from "../hooks/useRemoteActivityBusConnection";
import { NavigationLayout } from "../layouts";
import { getHostByRelayUsername } from "../lib/hostStorage";
import { ActivityPage } from "./ActivityPage";
import { AgentsPage } from "./AgentsPage";
import { BeadsPage } from "./BeadsPage";
import { FilePage } from "./FilePage";
import { GlobalSessionsPage } from "./GlobalSessionsPage";
import { InboxPage } from "./InboxPage";
import { NewSessionPage } from "./NewSessionPage";
import { ProjectsPage } from "./ProjectsPage";
import { SessionPage } from "./SessionPage";
import { SettingsLayout } from "./settings";

/**
 * Content wrapper that sets up activity bus and other hooks.
 */
function RelayHostContent({ children }: { children: React.ReactNode }) {
  useRemoteActivityBusConnection();
  useSyncNotifyInAppSetting();
  useNeedsAttentionBadge();

  return (
    <>
      {children}
      <FloatingActionButton />
    </>
  );
}

/**
 * Inner routes component - renders the app routes once connected.
 */
function RelayHostInnerRoutes() {
  return (
    <InboxProvider>
      <SchemaValidationProvider>
        <RelayHostContent>
          <Routes>
            {/* Default to projects */}
            <Route index element={<Navigate to="projects" replace />} />

            {/* Main pages with NavigationLayout */}
            <Route element={<NavigationLayout />}>
              <Route path="projects" element={<ProjectsPage />} />
              <Route path="sessions" element={<GlobalSessionsPage />} />
              <Route path="agents" element={<AgentsPage />} />
              <Route path="tasks" element={<BeadsPage />} />
              <Route path="inbox" element={<InboxPage />} />
              <Route path="settings" element={<SettingsLayout />} />
              <Route path="settings/:category" element={<SettingsLayout />} />
              <Route path="new-session" element={<NewSessionPage />} />
              <Route
                path="projects/:projectId/sessions/:sessionId"
                element={<SessionPage />}
              />
            </Route>

            {/* Pages with custom layouts */}
            <Route path="projects/:projectId/file" element={<FilePage />} />
            <Route path="activity" element={<ActivityPage />} />

            {/* Catch-all - redirect to projects */}
            <Route path="*" element={<Navigate to="projects" replace />} />
          </Routes>
        </RelayHostContent>
      </SchemaValidationProvider>
    </InboxProvider>
  );
}

type ConnectionState =
  | "checking"
  | "connecting"
  | "connected"
  | "no_host"
  | "no_session"
  | "error";

/** Create an AutoResumeError from an exception */
function createAutoResumeError(
  err: unknown,
  relayUsername: string,
  relayUrl?: string,
): AutoResumeError {
  const message = err instanceof Error ? err.message : String(err);
  const lowerMessage = message.toLowerCase();

  // Determine the reason based on the error message
  let reason: AutoResumeError["reason"] = "other";
  if (lowerMessage.includes("server_offline")) {
    reason = "server_offline";
  } else if (lowerMessage.includes("unknown_username")) {
    reason = "unknown_username";
  } else if (
    lowerMessage.includes("timeout") ||
    lowerMessage.includes("timed out")
  ) {
    reason = "relay_timeout";
  } else if (
    lowerMessage.includes("failed to connect to relay") ||
    lowerMessage.includes("relay connection closed") ||
    lowerMessage.includes("relay connection error")
  ) {
    reason = "relay_unreachable";
  } else if (
    lowerMessage.includes("authentication failed") ||
    lowerMessage.includes("auth") ||
    lowerMessage.includes("session")
  ) {
    reason = "auth_failed";
  }

  return {
    reason,
    mode: "relay",
    relayUsername,
    serverUrl: relayUrl,
    message,
  };
}

/**
 * Main relay host routes component.
 *
 * Handles the connection flow based on URL username.
 */
export function RelayHostRoutes() {
  const { relayUsername } = useParams<{ relayUsername: string }>();
  const { connection, connectViaRelay, isAutoResuming, setCurrentHostId } =
    useRemoteConnection();

  const [state, setState] = useState<ConnectionState>("checking");
  const [error, setError] = useState<AutoResumeError | null>(null);

  // Attempt to connect when username changes
  useEffect(() => {
    if (!relayUsername) {
      setState("no_host");
      return;
    }

    // If already connected to this host, we're good
    if (connection) {
      setState("connected");
      return;
    }

    // If auto-resume is in progress, wait for it
    if (isAutoResuming) {
      setState("connecting");
      return;
    }

    // Look up saved host by relay username
    const host = getHostByRelayUsername(relayUsername);

    if (!host) {
      // No saved host - redirect to login with pre-filled username
      setState("no_host");
      return;
    }

    if (!host.session || !host.relayUrl) {
      // Host exists but no session - need to login
      setState("no_session");
      return;
    }

    // Attempt to connect using saved session
    setState("connecting");

    connectViaRelay({
      relayUrl: host.relayUrl,
      relayUsername: host.relayUsername ?? relayUsername,
      srpUsername: host.srpUsername,
      srpPassword: "", // Empty - use session resumption
      rememberMe: true,
      onStatusChange: () => {},
    })
      .then(() => {
        setCurrentHostId(host.id);
        setState("connected");
      })
      .catch((err) => {
        setError(
          createAutoResumeError(
            err,
            host.relayUsername ?? relayUsername,
            host.relayUrl,
          ),
        );
        setState("error");
      });
  }, [
    relayUsername,
    connection,
    connectViaRelay,
    isAutoResuming,
    setCurrentHostId,
  ]);

  // Handle different states
  switch (state) {
    case "checking":
    case "connecting":
      return (
        <div className="auto-resume-loading">
          <div className="loading-spinner" />
          <p>Connecting to {relayUsername}...</p>
        </div>
      );

    case "no_host":
    case "no_session":
      // Redirect to relay login with username pre-filled
      return (
        <Navigate
          to={`/login/relay?u=${encodeURIComponent(relayUsername ?? "")}`}
          replace
        />
      );

    case "error": {
      const defaultError: AutoResumeError = {
        reason: "other",
        mode: "relay",
        relayUsername: relayUsername ?? "",
        message: "Connection failed",
      };
      return (
        <HostOfflineModal
          error={error ?? defaultError}
          onRetry={() => {
            setState("connecting");
            setError(null);
            // Re-trigger the effect
            const host = getHostByRelayUsername(relayUsername ?? "");
            if (host?.relayUrl && host.relayUsername) {
              connectViaRelay({
                relayUrl: host.relayUrl,
                relayUsername: host.relayUsername,
                srpUsername: host.srpUsername,
                srpPassword: "",
                rememberMe: true,
                onStatusChange: () => {},
              })
                .then(() => {
                  setCurrentHostId(host.id);
                  setState("connected");
                })
                .catch((err) => {
                  setError(
                    createAutoResumeError(
                      err,
                      host.relayUsername ?? relayUsername ?? "",
                      host.relayUrl,
                    ),
                  );
                  setState("error");
                });
            } else {
              setState("no_session");
            }
          }}
          onGoToLogin={() => setState("no_session")}
        />
      );
    }

    case "connected":
      return <RelayHostInnerRoutes />;
  }
}
