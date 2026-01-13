import { useBrowserNotifications } from "../hooks/useBrowserNotifications";

/**
 * Toggle component for browser notification permission.
 * Allows desktop users to enable notifications without full push subscription.
 */
export function BrowserNotificationToggle() {
  const {
    isSupported,
    isEnabled,
    isDenied,
    isRequesting,
    requestPermission,
    showNotification,
  } = useBrowserNotifications();

  // Not supported in this browser
  if (!isSupported) {
    return (
      <div className="settings-item">
        <div className="settings-item-info">
          <strong>Desktop Notifications</strong>
          <p>Notifications are not supported in this browser.</p>
        </div>
      </div>
    );
  }

  // Permission denied - user must change in browser settings
  if (isDenied) {
    return (
      <div className="settings-item">
        <div className="settings-item-info">
          <strong>Desktop Notifications</strong>
          <p className="settings-warning">
            Notifications are blocked. Enable them in your browser settings to
            receive desktop alerts.
          </p>
        </div>
      </div>
    );
  }

  // Permission granted
  if (isEnabled) {
    const handleTest = () => {
      showNotification("Test Notification", {
        body: "Desktop notifications are working!",
        icon: "/icon-192.png",
      });
    };

    return (
      <>
        <div className="settings-item">
          <div className="settings-item-info">
            <strong>Desktop Notifications</strong>
            <p>
              Enabled. You'll receive notifications when sessions need attention
              (while the tab is open).
            </p>
          </div>
          <span className="settings-badge settings-badge-success">Enabled</span>
        </div>
        <div className="settings-item">
          <div className="settings-item-info">
            <strong>Test Desktop Notification</strong>
            <p>Send a test notification to verify it's working.</p>
          </div>
          <button
            type="button"
            className="settings-button"
            onClick={handleTest}
          >
            Send Test
          </button>
        </div>
      </>
    );
  }

  // Permission not yet requested (default state)
  return (
    <div className="settings-item">
      <div className="settings-item-info">
        <strong>Desktop Notifications</strong>
        <p>
          Get notified when sessions need your attention. Works while the tab is
          open in the background.
        </p>
      </div>
      <button
        type="button"
        className="settings-button"
        onClick={requestPermission}
        disabled={isRequesting}
      >
        {isRequesting ? "Requesting..." : "Enable"}
      </button>
    </div>
  );
}
