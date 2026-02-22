import { useCallback, useEffect, useState } from "react";
import { useServerSettings } from "../../hooks/useServerSettings";

const MAX_LENGTH = 10000;

export function AgentContextSettings() {
  const { settings, isLoading, error, updateSetting } = useServerSettings();
  const [instructions, setInstructions] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    if (settings) {
      setInstructions(settings.globalInstructions ?? "");
    }
  }, [settings]);

  const handleSave = useCallback(async () => {
    setIsSaving(true);
    setSaveError(null);
    try {
      await updateSetting(
        "globalInstructions",
        instructions.trim() || undefined,
      );
      setHasChanges(false);
    } catch (err) {
      setSaveError(
        err instanceof Error ? err.message : "Failed to save instructions",
      );
    } finally {
      setIsSaving(false);
    }
  }, [instructions, updateSetting]);

  if (isLoading) {
    return (
      <section className="settings-section">
        <h2>Agent Context</h2>
        <p className="settings-section-description">Loading...</p>
      </section>
    );
  }

  const serverValue = settings?.globalInstructions ?? "";

  return (
    <section className="settings-section">
      <h2>Agent Context</h2>
      <p className="settings-section-description">
        Instructions included in every session's system prompt. Use this for
        coding conventions, project context, or paths to reference files.
      </p>

      <div className="settings-group">
        <div
          className="settings-item"
          style={{ flexDirection: "column", alignItems: "stretch" }}
        >
          <div className="settings-item-info">
            <strong>Global Instructions</strong>
            <p>
              Appended to the system prompt for Claude. Prepended to the first
              message for other providers.
            </p>
          </div>
          <textarea
            className="settings-textarea"
            value={instructions}
            onChange={(e) => {
              const value = e.target.value.slice(0, MAX_LENGTH);
              setInstructions(value);
              setHasChanges(value !== serverValue);
              setSaveError(null);
            }}
            placeholder={
              "Use TypeScript strict mode. Prefer functional patterns.\n\nProject context: ~/code/dotfiles/projects/README.md"
            }
            rows={10}
          />
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginTop: "var(--space-2)",
            }}
          >
            <span className="settings-hint">
              {instructions.length.toLocaleString()}/
              {MAX_LENGTH.toLocaleString()} characters
            </span>
            <button
              type="button"
              className="settings-button"
              disabled={!hasChanges || isSaving}
              onClick={handleSave}
            >
              {isSaving ? "Saving..." : "Save"}
            </button>
          </div>
          {(saveError || error) && (
            <p className="settings-warning">{saveError || error}</p>
          )}
        </div>
      </div>
    </section>
  );
}
