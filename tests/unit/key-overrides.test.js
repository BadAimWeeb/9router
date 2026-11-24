// Per-key token-saver off switch and custom system prompt override.
// Real SQLite adapter over a temp DATA_DIR; repo-level CRUD + backup round-trip.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

let tempDir;
const originalDataDir = process.env.DATA_DIR;

async function boot() {
  delete global._dbAdapter;
  vi.resetModules();
  const db = await import("@/lib/db/index.js");
  const { getAdapter } = await import("@/lib/db/driver.js");
  await getAdapter();
  return db;
}

beforeEach(() => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "9router-key-overrides-"));
  process.env.DATA_DIR = tempDir;
});

afterEach(() => {
  if (originalDataDir === undefined) delete process.env.DATA_DIR;
  else process.env.DATA_DIR = originalDataDir;
  fs.rmSync(tempDir, { recursive: true, force: true });
});

describe("per-key token saver + prompt override", () => {
  it("new keys default to inherit/global and update accepts both overrides", async () => {
    const db = await boot();
    const key = await db.createApiKey("test", "machine");
    expect(key.tokenSaverOverride).toBe("inherit");
    expect(key.customPromptOverride).toBeNull();

    const updated = await db.updateApiKey(key.id, {
      tokenSaverOverride: "off",
      customPromptOverride: { enabled: true, prompt: "Be terse." },
    });
    expect(updated.tokenSaverOverride).toBe("off");
    expect(updated.customPromptOverride).toEqual({ enabled: true, prompt: "Be terse." });

    // Round-trip through a fresh read.
    const reread = await db.getApiKeyById(key.id);
    expect(reread.tokenSaverOverride).toBe("off");
    expect(reread.customPromptOverride).toEqual({ enabled: true, prompt: "Be terse." });

    // Reset both.
    const reset = await db.updateApiKey(key.id, {
      tokenSaverOverride: "inherit",
      customPromptOverride: null,
    });
    expect(reset.tokenSaverOverride).toBe("inherit");
    expect(reset.customPromptOverride).toBeNull();
  });

  it("rejects malformed tokenSaverOverride and customPromptOverride", async () => {
    const db = await boot();
    const key = await db.createApiKey("test", "machine");
    await expect(db.updateApiKey(key.id, { tokenSaverOverride: "always" })).rejects.toThrow(/tokenSaverOverride/);
    await expect(db.updateApiKey(key.id, { customPromptOverride: { enabled: "yes", prompt: "" } })).rejects.toThrow(/customPromptOverride/);
    await expect(db.updateApiKey(key.id, { customPromptOverride: { enabled: true, prompt: "x".repeat(20001) } })).rejects.toThrow(/20000/);
    // Unchanged after failed updates.
    expect((await db.getApiKeyById(key.id)).tokenSaverOverride).toBe("inherit");
  });

  it("backup export/import carries both overrides", async () => {
    const db = await boot();
    const key = await db.createApiKey("test", "machine");
    await db.updateApiKey(key.id, {
      tokenSaverOverride: "off",
      customPromptOverride: { enabled: true, prompt: "Override prompt" },
    });

    const payload = await db.exportDb();
    const exported = payload.apiKeys.find((k) => k.id === key.id);
    expect(exported.tokenSaverOverride).toBe("off");
    expect(exported.customPromptOverride).toEqual({ enabled: true, prompt: "Override prompt" });

    // Import into a fresh DB.
    fs.rmSync(path.join(tempDir, "db"), { recursive: true, force: true });
    delete global._dbAdapter;
    vi.resetModules();
    const db2 = await import("@/lib/db/index.js");
    const { getAdapter } = await import("@/lib/db/driver.js");
    await getAdapter();
    await db2.importDb(payload);
    const restored = await db2.getApiKeyById(key.id);
    expect(restored.tokenSaverOverride).toBe("off");
    expect(restored.customPromptOverride).toEqual({ enabled: true, prompt: "Override prompt" });
  });
});
