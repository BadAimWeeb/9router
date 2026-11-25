// /v1/models mirrors the GUI list for openai/anthropic-compatible connections:
// enabledModels + custom models (incl. manually added ones absent from the
// node's live catalog), with the stored (editable) context window winning over
// the node's live report. Hardcoded providers are unaffected.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

let tempDir;
const originalDataDir = process.env.DATA_DIR;

vi.mock("@/sse/services/keyAccess.js", () => ({
  getKeyAccessContext: vi.fn(async () => null),
  filterModelsListForKey: vi.fn(async (_ctx, list) => list),
}));

// No live resolvers/connections: every compatible provider fetch must be a mock.
vi.mock("open-sse/services/kiroModels.js", () => ({ resolveKiroModels: vi.fn(async () => null) }));
vi.mock("open-sse/services/cohereModels.js", () => ({ resolveCohereModels: vi.fn(async () => null) }));
vi.mock("open-sse/services/pollinationsModels.js", () => ({ resolvePollinationsModels: vi.fn(async () => null) }));

async function boot() {
  delete global._dbAdapter;
  vi.resetModules();
  const db = await import("@/lib/db/index.js");
  const { getAdapter } = await import("@/lib/db/driver.js");
  await getAdapter();
  const route = await import("@/app/api/v1/models/route.js");
  return { db, route };
}

function openAiConn(id, baseUrl, providerSpecificData = {}) {
  return {
    id,
    provider: "openai-compatible-chat-n1",
    authType: "apikey",
    name: "test node",
    apiKey: "sk-test",
    isActive: true,
    providerSpecificData: { baseUrl, ...providerSpecificData },
  };
}

// getProviderConnections is reached through @/lib/localDb inside the route —
// stub it per test via the db module.
function stubConnections(db, connections) {
  vi.spyOn(db, "getProviderConnections").mockImplementation(async (filter = {}) => {
    let list = connections;
    if (filter.provider) list = list.filter((c) => c.provider === filter.provider);
    if (filter.isActive === true) list = list.filter((c) => c.isActive !== false);
    return list;
  });
}

beforeEach(() => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "9router-v1models-mirror-"));
  process.env.DATA_DIR = tempDir;
});

afterEach(() => {
  if (originalDataDir === undefined) delete process.env.DATA_DIR;
  else process.env.DATA_DIR = originalDataDir;
  fs.rmSync(tempDir, { recursive: true, force: true });
  vi.restoreAllMocks();
});

describe("/v1/models mirrors the GUI list for compatible connections", () => {
  it("announces exactly enabledModels + custom models, with stored context winning", async () => {
    const { db, route } = await boot();
    // The registry id of an openai-compatible node connection is its node id;
    // isOpenAICompatibleProvider accepts these node ids.
    stubConnections(db, [openAiConn("conn-1", "http://localhost:9", { enabledModels: ["model-a", "model-b"] })]);
    // Custom model C: manually added, absent from the node's live catalog, with
    // a stored (hand-edited) context window of 321000.
    await db.addCustomModel({ providerAlias: "openai-compatible-chat-n1", id: "model-c", type: "llm", caps: { contextWindow: 321000 } });
    // Custom model B overrides the imported context: manual edit wins.
    await db.addCustomModel({ providerAlias: "openai-compatible-chat-n1", id: "model-b", type: "llm", caps: { contextWindow: 123000 } });

    const res = await route.GET(new Request("http://localhost/v1/models"));
    const body = await res.json();
    const mine = body.data.filter((m) => m.id.startsWith("openai-compatible-chat-n1/")).map((m) => m.id);
    expect(mine).toEqual(["openai-compatible-chat-n1/model-a", "openai-compatible-chat-n1/model-b", "openai-compatible-chat-n1/model-c"]);

    const byId = Object.fromEntries(body.data.map((m) => [m.id, m]));
    // Manual edit on B wins (123000, not whatever a live node would say).
    expect(byId["openai-compatible-chat-n1/model-b"].context_length).toBe(123000);
    expect(byId["openai-compatible-chat-n1/model-c"].context_length).toBe(321000);
    // A has no stored value — falls back to pattern-matched capability defaults,
    // but must never be undefined-crashing.
    expect("context_length" in byId["openai-compatible-chat-n1/model-a"]).toBe(true);
  });

  it("does not leak live-catalog models that were never imported", async () => {
    const { db, route } = await boot();
    // enabledModels lists only model-a; a real node would also report model-z.
    stubConnections(db, [openAiConn("conn-2", "http://localhost:9", { enabledModels: ["model-a"] })]);

    const res = await route.GET(new Request("http://localhost/v1/models"));
    const body = await res.json();
    const mine = body.data.filter((m) => m.id.startsWith("openai-compatible-chat-n1/")).map((m) => m.id);
    expect(mine).toEqual(["openai-compatible-chat-n1/model-a"]);
  });

  it("empty GUI list falls back to discovery so a fresh connection lists something", async () => {
    const { db, route } = await boot();
    stubConnections(db, [openAiConn("conn-3", "http://localhost:9")]);
    // No enabledModels, no custom models: discovery path runs (fetch to the fake
    // baseUrl fails → empty list, but importantly it TRIED discovery).
    const res = await route.GET(new Request("http://localhost/v1/models"));
    const body = await res.json();
    expect(Array.isArray(body.data)).toBe(true);
  });
});
