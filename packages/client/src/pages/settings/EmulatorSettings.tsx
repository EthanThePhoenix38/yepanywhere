import {
  EMULATOR_FPS_OPTIONS,
  EMULATOR_WIDTH_OPTIONS,
  type EmulatorQuality,
  getQualityLabel,
  useEmulatorSettings,
} from "../../hooks/useEmulatorSettings";
import { useEmulators } from "../../hooks/useEmulators";

const QUALITY_OPTIONS: EmulatorQuality[] = ["high", "medium", "low"];

/**
 * Settings section for Android emulator bridge.
 * Shows discovered emulators and stream quality configuration.
 */
export function EmulatorSettings() {
  const { emulators, loading, error, startEmulator, stopEmulator } =
    useEmulators();
  const { maxFps, setMaxFps, maxWidth, setMaxWidth, quality, setQuality } =
    useEmulatorSettings();

  return (
    <section className="settings-section">
      <h2>Android Emulator</h2>
      <p className="settings-description">
        Stream and control Android emulators from your phone via WebRTC.
      </p>

      <div className="settings-group">
        <h3>Stream Quality</h3>
        <p className="settings-description">
          Changes take effect on the next connection.
        </p>

        <div className="settings-item">
          <div className="settings-item-info">
            <strong>Frame Rate</strong>
            <p>Higher frame rates increase CPU and bandwidth usage.</p>
          </div>
          <div className="font-size-selector">
            {EMULATOR_FPS_OPTIONS.map((fps) => (
              <button
                key={fps}
                type="button"
                className={`font-size-option ${maxFps === fps ? "active" : ""}`}
                onClick={() => setMaxFps(fps)}
              >
                {fps} fps
              </button>
            ))}
          </div>
        </div>

        <div className="settings-item">
          <div className="settings-item-info">
            <strong>Resolution</strong>
            <p>Maximum stream width in pixels (height scales proportionally).</p>
          </div>
          <div className="font-size-selector">
            {EMULATOR_WIDTH_OPTIONS.map((w) => (
              <button
                key={w}
                type="button"
                className={`font-size-option ${maxWidth === w ? "active" : ""}`}
                onClick={() => setMaxWidth(w)}
              >
                {w}p
              </button>
            ))}
          </div>
        </div>

        <div className="settings-item">
          <div className="settings-item-info">
            <strong>Quality</strong>
            <p>
              High uses ~4 Mbps, Medium ~2.8 Mbps, Low ~1.5 Mbps at 720p/30fps.
            </p>
          </div>
          <div className="font-size-selector">
            {QUALITY_OPTIONS.map((q) => (
              <button
                key={q}
                type="button"
                className={`font-size-option ${quality === q ? "active" : ""}`}
                onClick={() => setQuality(q)}
              >
                {getQualityLabel(q)}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="settings-group">
        <h3>Discovered Emulators</h3>

        {loading && <p className="settings-muted">Loading...</p>}
        {error && <p className="settings-error">{error}</p>}

        {!loading && emulators.length === 0 && (
          <p className="settings-muted">
            No emulators found. Ensure ADB is on your PATH and emulators are
            available.
          </p>
        )}

        {emulators.map((emu) => (
          <div key={emu.id} className="settings-item">
            <div className="settings-item-info">
              <span className="settings-item-label">{emu.avd}</span>
              <span className="settings-item-description">
                {emu.id} &mdash; {emu.state}
              </span>
            </div>
            <div className="settings-item-action">
              {emu.state === "running" ? (
                <button
                  type="button"
                  className="settings-btn settings-btn-secondary"
                  onClick={() => stopEmulator(emu.id)}
                >
                  Stop
                </button>
              ) : (
                <button
                  type="button"
                  className="settings-btn settings-btn-secondary"
                  onClick={() => startEmulator(emu.id)}
                >
                  Start
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
