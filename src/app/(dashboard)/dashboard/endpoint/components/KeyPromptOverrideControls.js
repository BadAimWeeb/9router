"use client";

// Per-API-key custom system prompt override on the Endpoint page.
// Null (default) follows the global customPrompt settings; an object
// { enabled, prompt } replaces the global pair for requests made with this key.
import { useState } from "react";
import PropTypes from "prop-types";

export default function KeyPromptOverrideControls({ apiKey, onChange }) {
  const override = apiKey.customPromptOverride || null;
  // Keyed remount: when the key's override changes externally, React resets the
  // local draft from the new props without a setState-in-effect round trip.
  const [form, setForm] = useState(() => ({
    enabled: override?.enabled === true,
    prompt: override?.prompt || "",
    editing: false,
  }));

  const enabled = form.enabled;
  const prompt = form.prompt;
  const editing = form.editing;

  const patch = (partial) => setForm((prev) => ({ ...prev, ...partial }));

  const save = (next) => onChange(next);

  const toggleEnabled = (checked) => {
    patch({ enabled: checked });
    save({ enabled: checked, prompt });
  };

  const commitPrompt = () => {
    patch({ editing: false });
    save({ enabled, prompt });
  };

  const clearOverride = () => {
    patch({ enabled: false, prompt: "", editing: false });
    save(null);
  };

  const modeLabel = override
    ? (override.enabled ? "Custom (on)" : "Custom (off)")
    : "Follow global settings";

  return (
    <div className="mt-2" data-testid="key-prompt-override">
      <div className="flex items-center gap-2 text-xs flex-wrap">
        <span className="text-text-muted">System prompt:</span>
        <span className={override ? "text-primary font-medium" : "text-text-muted"}>{modeLabel}</span>
        <button
          type="button"
          onClick={() => setEditing((v) => !v)}
          className="px-2 py-0.5 rounded-lg border border-border text-xs hover:border-primary/50 cursor-pointer"
          aria-expanded={editing}
        >
          {editing ? "Close" : "Edit"}
        </button>
        {override && (
          <button
            type="button"
            onClick={clearOverride}
            className="px-2 py-0.5 rounded-lg border border-border text-xs text-text-muted hover:border-primary/50 cursor-pointer"
          >
            Reset to global
          </button>
        )}
      </div>
      {editing && (
        <div className="mt-2 pl-4 border-l-2 border-border">
          <label className="flex items-center gap-2 text-xs">
            <input
              type="checkbox"
              checked={enabled}
              onChange={(e) => toggleEnabled(e.target.checked)}
              className="accent-primary"
            />
            Inject this prompt instead of the global custom prompt
          </label>
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onBlur={commitPrompt}
            rows={4}
            maxLength={20000}
            placeholder="System prompt injected into every request made with this key…"
            className="w-full mt-2 px-2 py-1.5 text-xs border border-border rounded-lg bg-background focus:outline-none focus:border-primary font-mono"
          />
          <p className="text-[11px] text-text-muted mt-1">
            Saved on blur. Applies to chat requests made with this key; overrides the global
            custom prompt when enabled.
          </p>
        </div>
      )}
    </div>
  );
}

KeyPromptOverrideControls.propTypes = {
  apiKey: PropTypes.shape({
    id: PropTypes.string.isRequired,
    name: PropTypes.string,
    customPromptOverride: PropTypes.shape({
      enabled: PropTypes.bool.isRequired,
      prompt: PropTypes.string.isRequired,
    }),
  }).isRequired,
  onChange: PropTypes.func.isRequired,
};
