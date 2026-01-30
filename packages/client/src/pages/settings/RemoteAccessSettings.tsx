import { useNavigate } from "react-router-dom";
import { RemoteAccessSetup } from "../../components/RemoteAccessSetup";
import { useOptionalRemoteConnection } from "../../contexts/RemoteConnectionContext";
import { getHostById } from "../../lib/hostStorage";

export function RemoteAccessSettings() {
  const navigate = useNavigate();
  const remoteConnection = useOptionalRemoteConnection();

  // Handle switching hosts - disconnect and go to host picker
  const handleSwitchHost = () => {
    remoteConnection?.disconnect();
    navigate("/login");
  };

  // When connected via relay, show connection info and logout
  if (remoteConnection) {
    // Get current host display name from hostStorage
    const currentHost = remoteConnection.currentHostId
      ? getHostById(remoteConnection.currentHostId)
      : null;
    const displayName =
      currentHost?.displayName ||
      remoteConnection.storedUsername ||
      "Remote server";

    return (
      <section className="settings-section">
        <h2>Remote Access</h2>
        <p className="settings-section-description">
          You are connected to a remote server via relay.
        </p>
        <div className="settings-group">
          <div className="settings-item">
            <div className="settings-item-info">
              <strong>Current Host</strong>
              <p>{displayName}</p>
            </div>
            <button
              type="button"
              className="settings-button"
              onClick={handleSwitchHost}
            >
              Switch Host
            </button>
          </div>
          <div className="settings-item">
            <div className="settings-item-info">
              <strong>Logout</strong>
              <p>Disconnect from the remote server</p>
            </div>
            <button
              type="button"
              className="settings-button settings-button-danger"
              onClick={() => remoteConnection.disconnect()}
            >
              Logout
            </button>
          </div>
        </div>
      </section>
    );
  }

  // Server-side: show relay configuration
  return (
    <section className="settings-section">
      <RemoteAccessSetup
        title="Remote Access"
        description="Access your yepanywhere server from anywhere through an encrypted relay connection."
      />
    </section>
  );
}
