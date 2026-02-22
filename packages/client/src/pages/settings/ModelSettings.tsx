import {
  EFFORT_LEVEL_OPTIONS,
  MODEL_OPTIONS,
  useModelSettings,
} from "../../hooks/useModelSettings";

export function ModelSettings() {
  const { model, setModel, effortLevel, setEffortLevel } = useModelSettings();

  return (
    <section className="settings-section">
      <h2>Model</h2>
      <div className="settings-group">
        <div className="settings-item">
          <div className="settings-item-info">
            <strong>Model</strong>
            <p>Select which Claude model to use for new sessions.</p>
          </div>
          <div className="font-size-selector">
            {MODEL_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                className={`font-size-option ${model === opt.value ? "active" : ""}`}
                onClick={() => setModel(opt.value)}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
        <div className="settings-item">
          <div className="settings-item-info">
            <strong>Effort Level</strong>
            <p>
              Controls how much effort Claude puts into responses when thinking
              is enabled. Higher levels use more tokens.
            </p>
          </div>
          <div className="font-size-selector">
            {EFFORT_LEVEL_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                className={`font-size-option ${effortLevel === opt.value ? "active" : ""}`}
                onClick={() => setEffortLevel(opt.value)}
                title={opt.description}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
