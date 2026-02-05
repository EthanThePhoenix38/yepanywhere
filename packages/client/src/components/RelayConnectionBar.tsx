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
  const { connection, isConnecting, isAutoResuming, error, autoResumeError } =
    useRemoteConnection();
  const location = useLocation();
  const activityBusState = useActivityBusState();

  // Don't show on login routes
  const isLoginRoute = LOGIN_ROUTES.some(
    (route) =>
      location.pathname === route || location.pathname.startsWith(`${route}/`),
  );
  if (isLoginRoute) {
    return null;
  }

  // Determine connection state
  // Check both RemoteConnectionContext state AND ActivityBus state.
  // ActivityBus knows the true connection state because it receives events.
  // This handles the case where SecureConnection.forceReconnect() succeeds
  // but React state hasn't been updated yet.
  let status: "connected" | "connecting" | "disconnected";
  if (connection || activityBusState.connected) {
    status = "connected";
  } else if (isConnecting || isAutoResuming) {
    status = "connecting";
  } else {
    status = "disconnected";
  }

  // Also show disconnected state if there's an error
  if (error || autoResumeError) {
    status = "disconnected";
  }

  return <div className={`relay-connection-bar relay-connection-${status}`} />;
}
