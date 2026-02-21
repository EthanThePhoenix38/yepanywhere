import { useEffect, useState } from "react";
import { useSchemaValidationContext } from "../../contexts/SchemaValidationContext";
import { useDeveloperMode } from "../../hooks/useDeveloperMode";
import { useReloadNotifications } from "../../hooks/useReloadNotifications";
import { useSchemaValidation } from "../../hooks/useSchemaValidation";
import { useServerSettings } from "../../hooks/useServerSettings";

export function DevelopmentSettings() {
  const {
    isManualReloadMode,
    pendingReloads,
    connected,
    reloadBackend,
    unsafeToRestart,
    workerActivity,
  } = useReloadNotifications();
  const { settings: validationSettings, setEnabled: setValidationEnabled } =
    useSchemaValidation();
  const { holdModeEnabled, setHoldModeEnabled } = useDeveloperMode();
  const { ignoredTools, clearIgnoredTools } = useSchemaValidationContext();
  const { settings: serverSettings, updateSetting: updateServerSetting } =
    useServerSettings();

  const [restarting, setRestarting] = useState(false);
  // When SSE reconnects after restart, re-enable the button
  useEffect(() => {
    if (restarting && connected) {
      setRestarting(false);
    }
  }, [restarting, connected]);

  const handleRestartServer = async () => {
    setRestarting(true);
    await reloadBackend();
  };

  // Only render in manual reload mode (dev mode)
  if (!isManualReloadMode) {
    return null;
  }

  return (
    <section className="settings-section">
      <h2>Development</h2>

      <div className="settings-group">
        <div className="settings-item">
          <div className="settings-item-info">
            <strong>Schema Validation</strong>
            <p>
              Validate tool results against expected schemas. Shows toast
              notifications and logs errors to console.
            </p>
          </div>
          <label className="toggle-switch">
            <input
              type="checkbox"
              checked={validationSettings.enabled}
              onChange={(e) => setValidationEnabled(e.target.checked)}
            />
            <span className="toggle-slider" />
          </label>
        </div>
        {ignoredTools.length > 0 && (
          <div className="settings-item">
            <div className="settings-item-info">
              <strong>Ignored Tools</strong>
              <p>
                Tools with validation errors you chose to ignore. They will not
                show toast notifications.
              </p>
              <div className="ignored-tools-list">
                {ignoredTools.map((tool) => (
                  <span key={tool} className="ignored-tool-badge">
                    {tool}
                  </span>
                ))}
              </div>
            </div>
            <button
              type="button"
              className="settings-button settings-button-secondary"
              onClick={clearIgnoredTools}
            >
              Clear Ignored
            </button>
          </div>
        )}
        <div className="settings-item">
          <div className="settings-item-info">
            <strong>Hold Mode</strong>
            <p>
              Show hold/resume option in the mode selector. Pauses execution at
              the next yield point (experimental).
            </p>
          </div>
          <label className="toggle-switch">
            <input
              type="checkbox"
              checked={holdModeEnabled}
              onChange={(e) => setHoldModeEnabled(e.target.checked)}
            />
            <span className="toggle-slider" />
          </label>
        </div>
        <div className="settings-item">
          <div className="settings-item-info">
            <strong>Service Worker</strong>
            <p>
              Enable service worker for push notifications. Disabling can help
              with page reload issues during development. Requires restart.
            </p>
          </div>
          <label className="toggle-switch">
            <input
              type="checkbox"
              checked={serverSettings?.serviceWorkerEnabled ?? true}
              onChange={(e) =>
                updateServerSetting("serviceWorkerEnabled", e.target.checked)
              }
            />
            <span className="toggle-slider" />
          </label>
        </div>
        <div className="settings-item">
          <div className="settings-item-info">
            <strong>Persist Remote Sessions To Disk</strong>
            <p>
              Store remote SRP resume sessions in{" "}
              <code>remote-sessions.json</code> so relay reconnect survives
              server restarts. Disabled by default for security.
            </p>
          </div>
          <label className="toggle-switch">
            <input
              type="checkbox"
              checked={serverSettings?.persistRemoteSessionsToDisk ?? false}
              onChange={(e) =>
                updateServerSetting(
                  "persistRemoteSessionsToDisk",
                  e.target.checked,
                )
              }
            />
            <span className="toggle-slider" />
          </label>
        </div>
      </div>

      <div className="settings-group">
        <div className="settings-item">
          <div className="settings-item-info">
            <strong>Restart Server</strong>
            <p>
              Restart the backend server to pick up code changes.
              {pendingReloads.backend && (
                <span className="settings-pending"> (changes pending)</span>
              )}
            </p>
            {unsafeToRestart && (
              <p className="settings-warning">
                {workerActivity.activeWorkers} active session
                {workerActivity.activeWorkers !== 1 ? "s" : ""} will be
                interrupted
              </p>
            )}
          </div>
          <button
            type="button"
            className={`settings-button ${unsafeToRestart ? "settings-button-danger" : ""}`}
            onClick={handleRestartServer}
            disabled={restarting}
          >
            {restarting
              ? "Restarting..."
              : unsafeToRestart
                ? "Restart Anyway"
                : "Restart Server"}
          </button>
        </div>
      </div>
    </section>
  );
}
