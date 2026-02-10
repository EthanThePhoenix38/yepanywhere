/**
 * RelayConnectionBar - A thin colored bar at the top of the screen
 * showing relay connection status.
 *
 * Colors:
 * - Green: connected
 * - Orange (pulsing): connecting/reconnecting
 * - Red: disconnected/error
 */

import { useLocation } from "react-router-dom";
import { useRemoteConnection } from "../contexts/RemoteConnectionContext";
import { useActivityBusState } from "../hooks/useActivityBusState";

/** Routes where we don't show the connection bar */
const LOGIN_ROUTES = ["/login", "/login/direct", "/login/relay"];

export function RelayConnectionBar() {
  const { isConnecting, isAutoResuming, error, autoResumeError } =
    useRemoteConnection();
  const location = useLocation();
  const { connectionState } = useActivityBusState();

  // Don't show on login routes
  const isLoginRoute = LOGIN_ROUTES.some(
    (route) =>
      location.pathname === route || location.pathname.startsWith(`${route}/`),
  );
  if (isLoginRoute) {
    return null;
  }

  // Derive status from ConnectionManager state
  let status: "connected" | "connecting" | "disconnected";
  if (connectionState === "connected") {
    status = "connected";
  } else if (
    connectionState === "reconnecting" ||
    isConnecting ||
    isAutoResuming
  ) {
    status = "connecting";
  } else {
    status = "disconnected";
  }

  // Override with error state
  if (error || autoResumeError) {
    status = "disconnected";
  }

  return <div className={`relay-connection-bar relay-connection-${status}`} />;
}
