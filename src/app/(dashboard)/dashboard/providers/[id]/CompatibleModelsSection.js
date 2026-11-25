"use client";

import { useState } from "react";
import PropTypes from "prop-types";
import { Button } from "@/shared/components";
import { getProviderCustomModelRows } from "@/shared/utils/providerCustomModels";
function CompatibleModelRow({ modelId, fullModel, copied, onCopy, onDeleteAlias, onTest, testStatus, isTesting, contextWindow, onEditContext }) {
  const borderColor = testStatus === "ok"
    ? "border-green-500/40"
    : testStatus === "error"
    ? "border-red-500/40"
    : "border-border";

  const iconColor = testStatus === "ok"
    ? "#22c55e"
    : testStatus === "error"
    ? "#ef4444"
    : undefined;

  return (
    <div className={`flex items-center gap-3 p-3 rounded-lg border ${borderColor} hover:bg-sidebar/50`}>
      <span
        className="material-symbols-outlined text-base text-text-muted"
        style={iconColor ? { color: iconColor } : undefined}
      >
        {testStatus === "ok" ? "check_circle" : testStatus === "error" ? "cancel" : "smart_toy"}
      </span>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{modelId}</p>
        <div className="flex items-center gap-1 mt-1">
          <code className="text-xs text-text-muted font-mono bg-sidebar px-1.5 py-0.5 rounded">{fullModel}</code>
          {contextWindow != null && (
            <span className="text-[11px] text-text-muted bg-sidebar px-1.5 py-0.5 rounded" title="Saved context window (manually editable)">
              {contextWindow >= 1000000 ? `${+(contextWindow / 1000000).toFixed(2)}M` : `${Math.round(contextWindow / 1000)}k`} ctx
            </span>
          )}
          <div className="relative group/btn">
            <button
              onClick={() => onCopy(fullModel, `model-${modelId}`)}
              className="p-0.5 hover:bg-sidebar rounded text-text-muted hover:text-primary"
            >
              <span className="material-symbols-outlined text-sm">
                {copied === `model-${modelId}` ? "check" : "content_copy"}
              </span>
            </button>
            <span className="pointer-events-none absolute top-5 left-1/2 -translate-x-1/2 text-[10px] text-text-muted whitespace-nowrap opacity-0 group-hover/btn:opacity-100 transition-opacity">
              {copied === `model-${modelId}` ? "Copied!" : "Copy"}
            </span>
          </div>
          {onEditContext && (
            <div className="relative group/btn">
              <button
                onClick={onEditContext}
                className="p-0.5 hover:bg-sidebar rounded text-text-muted hover:text-primary"
                title="Edit context size"
              >
                <span className="material-symbols-outlined text-sm">edit</span>
              </button>
            </div>
          )}
          {onTest && (
            <div className="relative group/btn">
              <button
                onClick={onTest}
                disabled={isTesting}
                className="p-0.5 hover:bg-sidebar rounded text-text-muted hover:text-primary transition-colors"
              >
                <span className="material-symbols-outlined text-sm" style={isTesting ? { animation: "spin 1s linear infinite" } : undefined}>
                  {isTesting ? "progress_activity" : "science"}
                </span>
              </button>
              <span className="pointer-events-none absolute top-5 left-1/2 -translate-x-1/2 text-[10px] text-text-muted whitespace-nowrap opacity-0 group-hover/btn:opacity-100 transition-opacity">
                {isTesting ? "Testing..." : "Test"}
              </span>
            </div>
          )}
        </div>
      </div>
      <button
        onClick={onDeleteAlias}
        className="p-1 hover:bg-red-50 rounded text-red-500"
        title="Remove model"
      >
        <span className="material-symbols-outlined text-sm">delete</span>
      </button>
    </div>
  );
}

export default function CompatibleModelsSection({ providerStorageAlias, providerDisplayAlias, modelAliases, customModels, copied, onCopy, onDeleteAlias, onAddCustomModel, onDeleteCustomModel, connections, isAnthropic }) {
  const [newModel, setNewModel] = useState("");
  const [adding, setAdding] = useState(false);
  const [importing, setImporting] = useState(false);
  const [testingModelId, setTestingModelId] = useState(null);
  const [modelTestResults, setModelTestResults] = useState({});

  const handleTestModel = async (modelId) => {
    if (testingModelId) return;
    setTestingModelId(modelId);
    try {
      const res = await fetch("/api/models/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: `${providerStorageAlias}/${modelId}` }),
      });
      const data = await res.json();
      setModelTestResults((prev) => ({ ...prev, [modelId]: data.ok ? "ok" : "error" }));
    } catch {
      setModelTestResults((prev) => ({ ...prev, [modelId]: "error" }));
    } finally {
      setTestingModelId(null);
    }
  };

  const allModels = getProviderCustomModelRows({
    customModels,
    modelAliases,
    providerAlias: providerStorageAlias,
    type: "llm",
  });

  // Full custom-model records by id, for the context-size editor (legacy alias
  // rows have no record and are not editable here).
  const customRecordById = new Map(
    (customModels || [])
      .filter((m) => m?.id && m.providerAlias === providerStorageAlias)
      .map((m) => [m.id, m])
  );

  const [editingModelId, setEditingModelId] = useState(null);
  const [editContextWindow, setEditContextWindow] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);

  const startEditContext = (modelId) => {
    const record = customRecordById.get(modelId);
    const current = Number(record?.caps?.contextWindow);
    setEditContextWindow(Number.isFinite(current) && current > 0 ? String(current) : "");
    setEditingModelId(modelId);
  };

  const commitEditContext = async () => {
    if (!editingModelId || savingEdit) return;
    const raw = Number(editContextWindow);
    const contextWindow = Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : null;
    // caps is replaced wholesale by the upsert, so send the full record minus
    // contextWindow when clearing; sending it with the new value when setting.
    const record = customRecordById.get(editingModelId);
    const caps = { ...(record?.caps || {}) };
    if (contextWindow) caps.contextWindow = contextWindow;
    else delete caps.contextWindow;
    setSavingEdit(true);
    try {
      await onEditCustomModel(editingModelId, caps);
      setEditingModelId(null);
    } catch (error) {
      console.log("Error updating model context:", error);
    } finally {
      setSavingEdit(false);
    }
  };

  const handleAdd = async () => {
    if (!newModel.trim() || adding) return;
    const modelId = newModel.trim();
    if (allModels.some((model) => model.id === modelId)) {
      alert("Model already exists for this provider.");
      return;
    }

    setAdding(true);
    try {
      await onAddCustomModel(modelId);
      setNewModel("");
    } catch (error) {
      console.log("Error adding model:", error);
    } finally {
      setAdding(false);
    }
  };

  const handleImport = async () => {
    if (importing) return;
    const activeConnection = connections.find((conn) => conn.isActive !== false);
    if (!activeConnection) return;

    setImporting(true);
    try {
      const res = await fetch(`/api/providers/${activeConnection.id}/models`);
      const data = await res.json();
      if (!res.ok) {
        alert(data.error || "Failed to import models");
        return;
      }
      const models = data.models || [];
      if (models.length === 0) {
        alert("No models returned from /models.");
        return;
      }
      let importedCount = 0;
      for (const model of models) {
        const modelId = model.id || model.name || model.model;
        if (!modelId) continue;
        if (allModels.some((entry) => entry.id === modelId)) continue;
        // Cache the node-reported context window so /v1/models announces it
        // without re-asking the node; editable per model afterwards.
        const contextLength = Number(model.contextLength);
        const caps = Number.isFinite(contextLength) && contextLength > 0 ? { contextWindow: Math.floor(contextLength) } : undefined;
        await onAddCustomModel(modelId, "llm", undefined, caps);
        importedCount += 1;
      }
      if (importedCount === 0) {
        alert("No new models were added.");
      }
    } catch (error) {
      console.log("Error importing models:", error);
    } finally {
      setImporting(false);
    }
  };

  const canImport = connections.some((conn) => conn.isActive !== false);

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-text-muted">
        Add {isAnthropic ? "Anthropic" : "OpenAI"}-compatible models manually or import them from the /models endpoint.
      </p>

      <div className="flex items-end gap-2 flex-wrap">
        <div className="flex-1 min-w-[240px]">
          <label htmlFor="new-compatible-model-input" className="text-xs text-text-muted mb-1 block">Model ID</label>
          <input
            id="new-compatible-model-input"
            type="text"
            value={newModel}
            onChange={(e) => setNewModel(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleAdd()}
            placeholder={isAnthropic ? "claude-3-opus-20240229" : "gpt-4o"}
            className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-background focus:outline-none focus:border-primary"
          />
        </div>
        <Button size="sm" icon="add" onClick={handleAdd} disabled={!newModel.trim() || adding}>
          {adding ? "Adding..." : "Add"}
        </Button>
        <Button size="sm" variant="secondary" icon="download" onClick={handleImport} disabled={!canImport || importing}>
          {importing ? "Importing..." : "Import from /models"}
        </Button>
      </div>

      {!canImport && (
        <p className="text-xs text-text-muted">
          Add a connection to enable importing models.
        </p>
      )}

      {allModels.length > 0 && (
        <div className="flex flex-col gap-3">
          {allModels.map(({ id, alias, source }) => {
            const record = customRecordById.get(id);
            const savedContext = Number(record?.caps?.contextWindow);
            return (
              <div key={`${source}-${providerStorageAlias}/${id}`} className="flex flex-col gap-1">
                <CompatibleModelRow
                  modelId={id}
                  fullModel={`${providerDisplayAlias}/${id}`}
                  copied={copied}
                  onCopy={onCopy}
                  onDeleteAlias={() => source === "custom" ? onDeleteCustomModel(id) : onDeleteAlias(alias)}
                  onTest={connections.length > 0 ? () => handleTestModel(id) : undefined}
                  testStatus={modelTestResults[id]}
                  isTesting={testingModelId === id}
                  contextWindow={Number.isFinite(savedContext) && savedContext > 0 ? savedContext : null}
                  onEditContext={source === "custom" ? () => startEditContext(id) : undefined}
                />
                {editingModelId === id && (
                  <div className="flex items-center gap-2 pl-3">
                    <label className="text-xs text-text-muted" htmlFor={`ctx-${id}`}>Context size (tokens)</label>
                    <input
                      id={`ctx-${id}`}
                      type="number"
                      min="1"
                      value={editContextWindow}
                      onChange={(e) => setEditContextWindow(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && commitEditContext()}
                      className="w-40 px-2 py-1 text-xs border border-border rounded-lg bg-background focus:outline-none focus:border-primary font-mono"
                    />
                    <button
                      type="button"
                      onClick={commitEditContext}
                      disabled={savingEdit}
                      className="px-2 py-1 rounded-lg text-xs font-medium bg-primary text-white cursor-pointer disabled:opacity-50"
                    >
                      {savingEdit ? "Saving…" : "Save"}
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditingModelId(null)}
                      className="px-2 py-1 rounded-lg text-xs border border-border cursor-pointer"
                    >
                      Cancel
                    </button>
                    <span className="text-[11px] text-text-muted">Empty clears the saved value.</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

CompatibleModelsSection.propTypes = {
  providerStorageAlias: PropTypes.string.isRequired,
  providerDisplayAlias: PropTypes.string.isRequired,
  modelAliases: PropTypes.object.isRequired,
  customModels: PropTypes.arrayOf(PropTypes.object),
  copied: PropTypes.string,
  onCopy: PropTypes.func.isRequired,
  onDeleteAlias: PropTypes.func.isRequired,
  onAddCustomModel: PropTypes.func.isRequired,
  onEditCustomModel: PropTypes.func.isRequired,
  onDeleteCustomModel: PropTypes.func.isRequired,
  connections: PropTypes.arrayOf(PropTypes.shape({
    id: PropTypes.string,
    isActive: PropTypes.bool,
  })).isRequired,
  isAnthropic: PropTypes.bool,
};
