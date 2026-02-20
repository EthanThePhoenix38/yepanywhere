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
        Custom instructions appended to the system prompt for all sessions,
        across all providers. Use this for personal context, coding conventions,
        or paths to reference files the agent should consult.
      </p>

      <div className="settings-group">
        <div
          className="settings-item"
          style={{ flexDirection: "column", alignItems: "stretch" }}
        >
          <div className="settings-item-info">
            <strong>Global Instructions</strong>
            <p>
              These instructions are included in every new session. For Claude,
              they are appended to the system prompt. For other providers, they
              are prepended to the first message.
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
            placeholder={`Example:\n\nMy name is Kyle. I'm a software engineer working on multiple projects.\n\nFor cross-project context and how my projects relate, see ~/code/dotfiles/projects/README.md\n\nPersonal goals and career context: ~/notes/about-me.md\n\nCoding conventions:\n- Always use TypeScript strict mode\n- Prefer functional patterns over classes\n- Run tests before committing`}
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
