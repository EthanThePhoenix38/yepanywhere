/**
 * HostOfflineModal - Shows when auto-resume fails because host is unreachable.
 *
 * Displays a user-friendly error when the remote host cannot be reached during
 * session resumption, with options to retry or go to the login page.
 */

import type {
  AutoResumeError,
  AutoResumeErrorReason,
} from "../contexts/RemoteConnectionContext";
import { Modal } from "./ui/Modal";

interface HostOfflineModalProps {
  error: AutoResumeError;
  onRetry: () => void;
  onGoToLogin: () => void;
}

function getErrorTitle(reason: AutoResumeErrorReason): string {
  switch (reason) {
    case "server_offline":
      return "Host Offline";
    case "unknown_username":
      return "Host Not Found";
    case "relay_timeout":
      return "Connection Timeout";
    case "relay_unreachable":
      return "Relay Unreachable";
    case "direct_unreachable":
      return "Host Unreachable";
    case "resume_incompatible":
      return "Server Update Required";
    default:
      return "Connection Failed";
  }
}

function getErrorMessage(error: AutoResumeError): string {
  const { reason, mode, relayUsername } = error;

  switch (reason) {
    case "server_offline":
      return relayUsername
        ? `The host "${relayUsername}" is not connected to the relay. The server may be offline or have closed its connection.`
        : "The host is not connected to the relay.";

    case "unknown_username":
      return relayUsername
        ? `No host found with username "${relayUsername}" on the relay. The username may have changed or the server may not be registered.`
        : "No host found with that username on the relay.";

    case "relay_timeout":
      return relayUsername
        ? `Timed out waiting for host "${relayUsername}". The server may be offline or experiencing high latency.`
        : "Timed out waiting for the host.";

    case "relay_unreachable":
      return "Could not connect to the relay server. Check your internet connection and try again.";

    case "direct_unreachable":
      return mode === "direct"
        ? "Could not connect to the server. Make sure the server is running and accessible."
        : "Could not establish a connection to the host.";

    case "resume_incompatible":
      return "The server needs to be updated for improved session resume security. Until then, you'll need to log in again after refreshing or reconnecting.";

    default:
      return "An unexpected error occurred while trying to reconnect.";
  }
}

export function HostOfflineModal({
  error,
  onRetry,
  onGoToLogin,
}: HostOfflineModalProps) {
  const title = getErrorTitle(error.reason);
  const message = getErrorMessage(error);

  return (
    <Modal title={title} onClose={onGoToLogin}>
      <div className="host-offline-modal-content">
        <p className="host-offline-message">{message}</p>

        {error.relayUsername && (
          <p className="host-offline-detail">
            <strong>Username:</strong> {error.relayUsername}
          </p>
        )}

        <p className="host-offline-hint">
          {error.reason === "resume_incompatible"
            ? "Run `npm update -g yepanywhere`, restart the server, then reconnect."
            : error.mode === "relay"
              ? "Make sure your server is running and has relay enabled."
              : "Make sure your server is running and accessible."}
        </p>

        <div className="host-offline-actions">
          <button type="button" className="btn-secondary" onClick={onGoToLogin}>
            Go to Login
          </button>
          <button type="button" className="btn-primary" onClick={onRetry}>
            Retry
          </button>
        </div>
      </div>
    </Modal>
  );
}
