import { useEffect, useState } from "react";
import { Button, Modal } from "@/shared/components";

export default function OpenRouterUpstreamProvider({ modelId, onClose, onSave }) {
  const url = `/api/providers/openrouter/upstream-provider?${new URLSearchParams({ model: modelId })}`;
  const [settings, setSettings] = useState(null);
  const [selected, setSelected] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try {
        const response = await fetch(url, { signal: controller.signal, cache: "no-store" });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Could not load the provider setting.");
        if (controller.signal.aborted) return;
        setSettings(data);
        setSelected(data.slug ?? "");
      } catch (error) {
        if (!controller.signal.aborted) setError(`${error.message || "Could not load the provider setting."} Reopen to try again.`);
      }
    }
    void load();
    return () => controller.abort();
  }, [url]);

  async function save() {
    setSaving(true);
    setError("");
    try {
      const response = await fetch(url, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug: selected || null }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not save the provider setting.");
      onSave(data.slug);
    } catch (error) {
      setError(error.message || "Could not save the provider setting.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal isOpen title="Model upstream provider" onClose={() => { if (!saving) onClose(); }}>
      <div className="flex min-w-0 flex-col gap-3">
        <p className="break-all text-sm">{modelId}</p>
        {error && <p role="alert" className="text-xs text-red-500">{error}</p>}
        {!settings ? (!error && <p role="status" className="text-xs text-text-muted">Loading OpenRouter endpoints…</p>) : (
          <>
            <label className="flex flex-col gap-1">
              <span>Default upstream provider</span>
              <select
                className="min-w-0 w-full rounded-md border border-border bg-background px-2 py-1"
                value={selected}
                disabled={saving}
                onChange={(event) => setSelected(event.target.value)}
              >
                <option value="">Automatic (OpenRouter chooses)</option>
                {settings.slug && !settings.providers.some(({ slug }) => slug === settings.slug) && (
                  <option value={settings.slug}>{settings.slug} (not listed)</option>
                )}
                {settings.providers.map(({ slug, name }) => (
                  <option key={slug} value={slug}>{name === slug ? slug : `${name} (${slug})`}</option>
                ))}
              </select>
            </label>
            <p className="text-xs text-text-muted">{settings.warning || (!settings.providers.length && "OpenRouter lists no endpoints for this model.") || "A [provider] tag on a request overrides this default."}</p>
            <Button onClick={save} loading={saving} disabled={selected === (settings.slug ?? "")}>
              Save default
            </Button>
          </>
        )}
        <Button variant="ghost" onClick={onClose} disabled={saving}>Cancel</Button>
      </div>
    </Modal>
  );
}
