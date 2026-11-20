import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { createServer } from "node:http";
import { registerHooks } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";

// Resolve Next.js aliases under plain Node; run the real chat handler and executor.
const hooks = registerHooks({
  resolve(specifier, context, nextResolve) {
    // Next's bundler exposes this CommonJS package's exports as named imports.
    if (specifier === "node-machine-id") {
      const { url } = nextResolve(specifier, context);
      const source = `import pkg from ${JSON.stringify(url)}; export const { machineIdSync } = pkg;`;
      return { url: `data:text/javascript,${encodeURIComponent(source)}`, shortCircuit: true };
    }
    const path = specifier === "@/models" ? "src/models/index.js"
      : specifier.startsWith("@/") ? `src/${specifier.slice(2)}`
      : specifier.startsWith("open-sse/") ? specifier : null;
    if (!path) return nextResolve(specifier, context);
    return nextResolve(new URL(`../${path.endsWith(".js") ? path : `${path}.js`}`, import.meta.url).href, context);
  },
});
const dataDir = mkdtempSync(join(tmpdir(), "9router-openrouter-"));
const oldDataDir = process.env.DATA_DIR;
process.env.DATA_DIR = dataDir;
after(() => {
  hooks.deregister();
  if (oldDataDir === undefined) delete process.env.DATA_DIR;
  else process.env.DATA_DIR = oldDataDir;
  rmSync(dataDir, { recursive: true, force: true });
});

const { createApiKey, updateApiKey, createProviderConnection, createProxyPool } = await import("../src/lib/localDb.js");
const { handleChat } = await import("../src/sse/handlers/chat.js");
const { PUT: saveProviderDefault } = await import("../src/app/api/providers/openrouter/upstream-provider/route.js");
const { PROVIDER_MODELS } = await import("../open-sse/config/providerModels.js");
const plainModel = "test/without-default:free";
const configuredModel = "test/with-default:free";
const slug = "google-vertex/us-east5";
const configuredSlug = "deepinfra";
PROVIDER_MODELS.openrouter.push({ id: configuredModel, defaultUpstreamProvider: configuredSlug });

const requests = [];
const relay = createServer(async (req, res) => {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  requests.push({ headers: req.headers, body: JSON.parse(Buffer.concat(chunks)) });
  res.writeHead(200, { "content-type": "application/json" });
  res.end(JSON.stringify({
    id: "test-completion", object: "chat.completion",
    choices: [{ index: 0, message: { role: "assistant", content: "hello" }, finish_reason: "stop" }],
  }));
});
after(() => { relay.close(); relay.closeAllConnections(); });
await new Promise((resolve, reject) => relay.listen(0, "127.0.0.1", resolve).once("error", reject));
const pool = await createProxyPool({ name: "test relay", type: "vercel", proxyUrl: `http://127.0.0.1:${relay.address().port}` });
await createProviderConnection({ provider: "openrouter", authType: "apikey", name: "test", apiKey: "test-key", providerSpecificData: { proxyPoolId: pool.id } });
const { id, key } = await createApiKey("test", "test-machine");
await updateApiKey(id, { access: { restricted: true, allow: [`openrouter/${plainModel}`, `openrouter/${configuredModel}`] } });

async function assertRouting(model, tag, expectedSlug) {
  const count = requests.length;
  const response = await handleChat(new Request("http://9router.test/v1/chat/completions", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: `openrouter/${model}${tag ? `[${tag}]` : ""}`,
      messages: [{ role: "user", content: "hello" }],
      stream: false,
    }),
  }));
  const result = await response.json();
  assert.equal(response.status, 200, JSON.stringify(result));
  assert.equal(requests.length, count + 1);
  const { headers, body } = requests[count];
  assert.equal(headers["x-relay-target"], "https://openrouter.ai");
  assert.equal(headers["x-relay-path"], "/api/v1/chat/completions");
  assert.equal(body.model, model);
  if (expectedSlug) assert.deepEqual(body.provider, { only: [expectedSlug] });
  else assert.equal(Object.hasOwn(body, "provider"), false);
}

for (const [name, model, tag, expectedSlug] of [
  ["tag only", plainModel, slug, slug],
  ["default only", configuredModel, null, configuredSlug],
  ["tag wins over default", configuredModel, slug, slug],
  ["neither omits provider", plainModel, null, null],
]) {
  test(name, () => assertRouting(model, tag, expectedSlug));
}

test("dashboard defaults override only their model and Automatic masks the registry default", async () => {
  async function save(value, status = 200) {
    const response = await saveProviderDefault(new Request(
      `http://9router.test/api/providers/openrouter/upstream-provider?${new URLSearchParams({ model: configuredModel })}`,
      { method: "PUT", body: JSON.stringify({ slug: value }) },
    ));
    assert.equal(response.status, status, await response.text());
  }

  await save("google-ai-studio");
  await save(["invalid"], 400);
  await assertRouting(configuredModel, null, "google-ai-studio");
  await assertRouting(configuredModel, slug, slug);
  await assertRouting(plainModel, null, null);
  await save(null);
  await assertRouting(configuredModel, null, null);
});
