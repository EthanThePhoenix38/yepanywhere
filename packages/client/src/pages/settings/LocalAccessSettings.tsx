import { useState } from "react";
import { FilterDropdown } from "../../components/FilterDropdown";
import { useOptionalAuth } from "../../contexts/AuthContext";
import { useOptionalRemoteConnection } from "../../contexts/RemoteConnectionContext";
import { useDeveloperMode } from "../../hooks/useDeveloperMode";
import { useNetworkBinding } from "../../hooks/useNetworkBinding";
import { useServerInfo } from "../../hooks/useServerInfo";

export function LocalAccessSettings() {
  const auth = useOptionalAuth();
  const remoteConnection = useOptionalRemoteConnection();
  const { relayDebugEnabled, setRelayDebugEnabled } = useDeveloperMode();
  const { serverInfo, loading: serverInfoLoading } = useServerInfo();
  const {
    binding,
    loading: bindingLoading,
    error: bindingError,
    applying,
    updateBinding,
  } = useNetworkBinding();

  // Network binding form state
  const [localhostPort, setLocalhostPort] = useState<string>("");
  const [networkEnabled, setNetworkEnabled] = useState(false);
  const [selectedInterface, setSelectedInterface] = useState<string>("");
  const [customIp, setCustomIp] = useState("");

  // Auth form state (merged into same form)
  const [requirePassword, setRequirePassword] = useState(false);
  const [authPassword, setAuthPassword] = useState("");
  const [authPasswordConfirm, setAuthPasswordConfirm] = useState("");

  // Form state
  const [formError, setFormError] = useState<string | null>(null);
  const [hasChanges, setHasChanges] = useState(false);
  const [isApplying, setIsApplying] = useState(false);

  // Initialize form from binding and auth state when it loads
  const [formInitialized, setFormInitialized] = useState(false);
  if (binding && auth && !formInitialized) {
    setLocalhostPort(String(binding.localhost.port));
    setNetworkEnabled(binding.network.enabled);
    setSelectedInterface(binding.network.host ?? "");
    setRequirePassword(auth.authEnabled);
    setFormInitialized(true);
  }

  // Track changes - includes auth changes
  const checkForChanges = (
    newPort: string,
    newNetworkEnabled: boolean,
    newInterface: string,
    newRequirePassword: boolean,
    newPassword: string,
  ) => {
    if (!binding || !auth) return false;
    const portChanged = newPort !== String(binding.localhost.port);
    const networkEnabledChanged = newNetworkEnabled !== binding.network.enabled;
    const interfaceChanged = newInterface !== (binding.network.host ?? "");
    const authChanged = newRequirePassword !== auth.authEnabled;
    const passwordEntered = newPassword.length > 0;
    return (
      portChanged ||
      networkEnabledChanged ||
      interfaceChanged ||
      authChanged ||
      passwordEntered
    );
  };

  const handleApplyChanges = async () => {
    if (!auth) return;
    setFormError(null);

    // Validate port
    const portNum = Number.parseInt(localhostPort, 10);
    if (Number.isNaN(portNum) || portNum < 1 || portNum > 65535) {
      setFormError("Port must be a number between 1 and 65535");
      return;
    }

    // Validate password if enabling or changing auth
    const enablingAuth = requirePassword && !auth.authEnabled;
    const changingPassword =
      requirePassword && auth.authEnabled && authPassword.length > 0;
    if (enablingAuth || changingPassword) {
      if (authPassword.length < 6) {
        setFormError("Password must be at least 6 characters");
        return;
      }
      if (authPassword !== authPasswordConfirm) {
        setFormError("Passwords do not match");
        return;
      }
    }

    const effectiveInterface =
      selectedInterface === "custom" ? customIp : selectedInterface;

    setIsApplying(true);
    try {
      // Apply network binding changes
      const result = await updateBinding({
        localhostPort: portNum,
        network: {
          enabled: networkEnabled,
          host: networkEnabled ? effectiveInterface : undefined,
        },
      });

      // Apply auth changes
      if (enablingAuth) {
        await auth.enableAuth(authPassword);
        setAuthPassword("");
        setAuthPasswordConfirm("");
      } else if (changingPassword) {
        await auth.changePassword(authPassword);
        setAuthPassword("");
        setAuthPasswordConfirm("");
      } else if (!requirePassword && auth.authEnabled) {
        await auth.disableAuth();
      }

      if (result.redirectUrl) {
        // Server changed port, redirect to new URL preserving current path
        const newUrl = new URL(result.redirectUrl);
        newUrl.pathname = window.location.pathname;
        newUrl.search = window.location.search;
        window.location.href = newUrl.toString();
      } else {
        setHasChanges(false);
      }
    } catch (err) {
      setFormError(
        err instanceof Error ? err.message : "Failed to apply changes",
      );
    } finally {
      setIsApplying(false);
    }
  };

  // Non-remote mode (cookie-based auth)
  if (auth) {
    // Show loading state until data is ready
    const isLoading =
      serverInfoLoading || bindingLoading || auth.isLoading || !formInitialized;

    if (isLoading) {
      return (
        <section className="settings-section">
          <h2>Local Access</h2>
          <p className="settings-section-description">Loading...</p>
        </section>
      );
    }

    // Show password fields when auth is enabled or being enabled
    const showPasswordFields = requirePassword;

    return (
      <section className="settings-section">
        <h2>Local Access</h2>
        <p className="settings-section-description">
          Control how this server is accessed on your local network.
        </p>

        {/* Current status */}
        <div className="settings-group">
          <div className="settings-item">
            <div className="settings-item-info">
              <strong>Status</strong>
              <p>
                {serverInfo ? (
                  (() => {
                    const networkHost = binding?.network.host;
                    const networkPort =
                      binding?.network.port ?? serverInfo.port;
                    const isAllInterfaces =
                      networkHost === "0.0.0.0" || networkHost === "::";
                    const samePort = networkPort === serverInfo.port;

                    // If bound to all interfaces on same port, just show that
                    if (
                      binding?.network.enabled &&
                      isAllInterfaces &&
                      samePort
                    ) {
                      return (
                        <>
                          Listening on{" "}
                          <code>
                            {networkHost}:{networkPort}
                          </code>
                        </>
                      );
                    }

                    // Otherwise show localhost, and optionally network
                    return (
                      <>
                        Listening on{" "}
                        <code>
                          {serverInfo.host}:{serverInfo.port}
                        </code>
                        {binding?.network.enabled && networkHost && (
                          <>
                            {" "}
                            and{" "}
                            <code>
                              {networkHost}:{networkPort}
                            </code>
                          </>
                        )}
                      </>
                    );
                  })()
                ) : (
                  "Unable to fetch server info"
                )}
              </p>
            </div>
            {serverInfo?.localhostOnly && !binding?.network.enabled && (
              <span className="settings-status-badge settings-status-detected">
                Local Only
              </span>
            )}
            {(serverInfo?.boundToAllInterfaces || binding?.network.enabled) &&
              !auth.authEnabled && (
                <span className="settings-status-badge settings-status-warning">
                  Network Exposed
                </span>
              )}
          </div>
        </div>

        {/* Network Configuration */}
        <form
          className="settings-group"
          onSubmit={(e) => {
            e.preventDefault();
            handleApplyChanges();
          }}
        >
          <div className="settings-item">
            <div className="settings-item-info">
              <strong>Listening Port</strong>
              <p>Port used for all network access</p>
            </div>
            {binding?.localhost.overriddenByCli ? (
              <span className="settings-value-readonly">
                {binding.localhost.port}{" "}
                <span className="settings-hint">(set via --port)</span>
              </span>
            ) : (
              <input
                type="number"
                className="settings-input-small"
                value={localhostPort}
                onChange={(e) => {
                  setLocalhostPort(e.target.value);
                  setHasChanges(
                    checkForChanges(
                      e.target.value,
                      networkEnabled,
                      selectedInterface,
                      requirePassword,
                      authPassword,
                    ),
                  );
                }}
                min={1}
                max={65535}
                autoComplete="off"
              />
            )}
          </div>

          <div className="settings-item">
            <div className="settings-item-info">
              <strong>Local Network Access</strong>
              <p>Allow access from other devices on your network</p>
            </div>
            {binding?.network.overriddenByCli ? (
              <span className="settings-value-readonly">
                {binding.network.host}:{binding.network.port}{" "}
                <span className="settings-hint">(set via --host)</span>
              </span>
            ) : (
              <label className="toggle-switch">
                <input
                  type="checkbox"
                  checked={networkEnabled}
                  onChange={(e) => {
                    setNetworkEnabled(e.target.checked);
                    setHasChanges(
                      checkForChanges(
                        localhostPort,
                        e.target.checked,
                        selectedInterface,
                        requirePassword,
                        authPassword,
                      ),
                    );
                  }}
                />
                <span className="toggle-slider" />
              </label>
            )}
          </div>

          {networkEnabled && !binding?.network.overriddenByCli && binding && (
            <div className="settings-item">
              <div className="settings-item-info">
                <strong>Interface</strong>
                <p>Select which network interface to bind to</p>
              </div>
              <FilterDropdown
                label="Interface"
                placeholder="Select interface..."
                multiSelect={false}
                align="right"
                options={[
                  ...binding.interfaces.map((iface) => ({
                    value: iface.address,
                    label: iface.displayName,
                  })),
                  { value: "0.0.0.0", label: "All interfaces (0.0.0.0)" },
                  { value: "custom", label: "Custom IP..." },
                ]}
                selected={selectedInterface ? [selectedInterface] : []}
                onChange={(values) => {
                  const newInterface = values[0] ?? "";
                  setSelectedInterface(newInterface);
                  setHasChanges(
                    checkForChanges(
                      localhostPort,
                      networkEnabled,
                      newInterface,
                      requirePassword,
                      authPassword,
                    ),
                  );
                }}
              />
            </div>
          )}

          {networkEnabled &&
            !binding?.network.overriddenByCli &&
            selectedInterface === "custom" && (
              <div className="settings-item">
                <div className="settings-item-info">
                  <strong>Custom IP</strong>
                  <p>Enter the IP address to bind to</p>
                </div>
                <input
                  type="text"
                  className="settings-input"
                  placeholder="192.168.1.100"
                  value={customIp}
                  onChange={(e) => setCustomIp(e.target.value)}
                />
              </div>
            )}

          {/* Require Password toggle */}
          {!auth.authDisabledByEnv && (
            <div className="settings-item">
              <div className="settings-item-info">
                <strong>Require Password</strong>
                <p>Require a password to access this server</p>
              </div>
              <label className="toggle-switch">
                <input
                  type="checkbox"
                  checked={requirePassword}
                  onChange={(e) => {
                    setRequirePassword(e.target.checked);
                    setHasChanges(
                      checkForChanges(
                        localhostPort,
                        networkEnabled,
                        selectedInterface,
                        e.target.checked,
                        authPassword,
                      ),
                    );
                  }}
                />
                <span className="toggle-slider" />
              </label>
            </div>
          )}

          {/* Password fields - shown when auth is on */}
          {showPasswordFields && (
            <>
              {/* Hidden username field to prevent Chrome from using port as username */}
              <input
                type="text"
                name="username"
                autoComplete="username"
                style={{
                  position: "absolute",
                  visibility: "hidden",
                  pointerEvents: "none",
                }}
                tabIndex={-1}
              />
              <div className="settings-item">
                <div className="settings-item-info">
                  <strong>Password</strong>
                  <p>
                    {auth.authEnabled
                      ? "Leave blank to keep current"
                      : "At least 6 characters"}
                  </p>
                </div>
                <input
                  type="password"
                  className="settings-input"
                  value={authPassword}
                  onChange={(e) => {
                    setAuthPassword(e.target.value);
                    setHasChanges(
                      checkForChanges(
                        localhostPort,
                        networkEnabled,
                        selectedInterface,
                        requirePassword,
                        e.target.value,
                      ),
                    );
                  }}
                  autoComplete="new-password"
                  placeholder={
                    auth.authEnabled ? "New password" : "Enter password"
                  }
                />
              </div>
              {authPassword.length > 0 && (
                <div className="settings-item">
                  <div className="settings-item-info">
                    <strong>Confirm Password</strong>
                  </div>
                  <input
                    type="password"
                    className="settings-input"
                    value={authPasswordConfirm}
                    onChange={(e) => setAuthPasswordConfirm(e.target.value)}
                    autoComplete="new-password"
                    placeholder="Confirm password"
                  />
                </div>
              )}
              {!auth.authEnabled && (
                <p className="form-hint">
                  If you forget your password, restart with{" "}
                  <code>--auth-disable</code> to bypass auth.
                </p>
              )}
            </>
          )}

          {auth.authDisabledByEnv && (
            <p className="form-warning">
              Authentication is bypassed by --auth-disable flag.
            </p>
          )}

          {/* Apply button - always visible */}
          <div className="settings-item">
            {formError && <p className="form-error">{formError}</p>}
            <button
              type="submit"
              className="settings-button"
              disabled={!hasChanges || isApplying || applying}
            >
              {isApplying || applying ? "Applying..." : "Apply Changes"}
            </button>
          </div>
        </form>

        {/* Logout - shown when auth is enabled */}
        {auth.authEnabled && auth.isAuthenticated && (
          <div className="settings-group">
            <div className="settings-item">
              <div className="settings-item-info">
                <strong>Logout</strong>
                <p>Sign out on this device</p>
              </div>
              <button
                type="button"
                className="settings-button settings-button-danger"
                onClick={auth.logout}
              >
                Logout
              </button>
            </div>
          </div>
        )}
      </section>
    );
  }

  // Remote mode (SRP auth)
  if (remoteConnection) {
    return (
      <section className="settings-section">
        <h2>Local Access</h2>
        <p className="settings-section-description">
          You are connected to a remote server via relay.
        </p>
        <div className="settings-group">
          <div className="settings-item">
            <div className="settings-item-info">
              <strong>Logout</strong>
              <p>Disconnect from the remote server.</p>
            </div>
            <button
              type="button"
              className="settings-button settings-button-danger"
              onClick={remoteConnection.disconnect}
            >
              Logout
            </button>
          </div>
          <div className="settings-item">
            <div className="settings-item-info">
              <strong>Relay Debug Logging</strong>
              <p>
                Log relay requests and responses to the browser console. Useful
                for debugging connection timeouts.
              </p>
            </div>
            <label className="toggle-switch">
              <input
                type="checkbox"
                checked={relayDebugEnabled}
                onChange={(e) => setRelayDebugEnabled(e.target.checked)}
              />
              <span className="toggle-slider" />
            </label>
          </div>
        </div>
      </section>
    );
  }

  // No auth context available
  return null;
}
