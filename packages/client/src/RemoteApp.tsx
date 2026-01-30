/**
 * RemoteApp - Wrapper for remote client mode.
 *
 * This replaces the regular App wrapper for the remote (static) client.
 * Key differences:
 * - No AuthProvider (SRP handles authentication)
 * - Shows login pages when not connected (handled via routing)
 * - Uses RemoteConnectionProvider for connection state
 */

import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { FloatingActionButton } from "./components/FloatingActionButton";
import { HostOfflineModal } from "./components/HostOfflineModal";
import { InboxProvider } from "./contexts/InboxContext";
import {
  RemoteConnectionProvider,
  useRemoteConnection,
} from "./contexts/RemoteConnectionContext";
import { SchemaValidationProvider } from "./contexts/SchemaValidationContext";
import { ToastProvider } from "./contexts/ToastContext";
import { useNeedsAttentionBadge } from "./hooks/useNeedsAttentionBadge";
import { useSyncNotifyInAppSetting } from "./hooks/useNotifyInApp";
import { useRemoteActivityBusConnection } from "./hooks/useRemoteActivityBusConnection";

interface Props {
  children: ReactNode;
}

/** Routes that don't require authentication */
const LOGIN_ROUTES = [
  "/login",
  "/login/direct",
  "/login/relay",
  "/direct",
  "/relay",
];

/** Routes that handle their own connection logic */
const SELF_MANAGED_ROUTES = ["/remote/"];

/**
 * Inner content that requires connection.
 * Only rendered when we have an active SecureConnection.
 */
function RemoteAppContent({ children }: Props) {
  // Manage activity bus connection (via SecureConnection subscribeActivity)
  useRemoteActivityBusConnection();

  // Sync notifyInApp setting to service worker on app startup and SW restarts
  useSyncNotifyInAppSetting();

  // Update tab title with needs-attention badge count (uses InboxContext)
  useNeedsAttentionBadge();

  return (
    <>
      {children}
      <FloatingActionButton />
    </>
  );
}

/**
 * Gate component that controls access based on connection state.
 *
 * - If auto-resuming: show loading (don't redirect yet)
 * - If auto-resume failed with host offline: show modal with retry option
 * - If not connected and on a login route: render children (login pages)
 * - If not connected and not on a login route: redirect to /login
 * - If connected and on a login route: redirect to /projects
 * - If connected and not on a login route: render children (app)
 */
function ConnectionGate({ children }: Props) {
  const {
    connection,
    isAutoResuming,
    autoResumeError,
    clearAutoResumeError,
    retryAutoResume,
  } = useRemoteConnection();
  const location = useLocation();
  const isLoginRoute = LOGIN_ROUTES.some(
    (route) =>
      location.pathname === route || location.pathname.startsWith(`${route}/`),
  );
  const isSelfManagedRoute = SELF_MANAGED_ROUTES.some((route) =>
    location.pathname.startsWith(route),
  );

  // Self-managed routes (like /remote/:username/*) handle their own connection logic
  // Let them through without interference
  if (isSelfManagedRoute) {
    return <>{children}</>;
  }

  // During auto-resume, don't redirect - show loading state
  // This preserves the current URL so we stay on the same page after successful resume
  if (isAutoResuming) {
    return (
      <div className="auto-resume-loading">
        <div className="loading-spinner" />
        <p>Reconnecting...</p>
      </div>
    );
  }

  // Not connected (and not auto-resuming)
  if (!connection) {
    // If auto-resume failed with a connection error, show the modal
    if (autoResumeError) {
      return (
        <HostOfflineModal
          error={autoResumeError}
          onRetry={retryAutoResume}
          onGoToLogin={clearAutoResumeError}
        />
      );
    }

    // If not on a login route, redirect to /login
    if (!isLoginRoute) {
      return <Navigate to="/login" replace />;
    }
    // On a login route - render children (login pages)
    return <>{children}</>;
  }

  // Connected - redirect away from login routes
  if (isLoginRoute) {
    return <Navigate to="/projects" replace />;
  }

  // Connected and on an app route - show the app with providers
  return (
    <InboxProvider>
      <SchemaValidationProvider>
        <RemoteAppContent>{children}</RemoteAppContent>
      </SchemaValidationProvider>
    </InboxProvider>
  );
}

/**
 * RemoteApp wrapper for remote client mode.
 *
 * Provides:
 * - ToastProvider (always available)
 * - RemoteConnectionProvider for connection management
 * - Connection gate that controls routing
 */
export function RemoteApp({ children }: Props) {
  return (
    <ToastProvider>
      <RemoteConnectionProvider>
        <ConnectionGate>{children}</ConnectionGate>
      </RemoteConnectionProvider>
    </ToastProvider>
  );
}
