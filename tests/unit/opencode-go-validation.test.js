import { afterEach, expect, it, vi } from "vitest";

vi.mock("@/models", () => ({ getProviderNodeById: vi.fn() }));
vi.mock("next/server", () => ({ NextResponse: { json: (body, init = {}) => Response.json(body, init) } }));
const { POST } = await import("../../src/app/api/providers/validate/route.js");
afterEach(() => vi.unstubAllGlobals());

it("sends stable key-isolated session IDs and still rejects invalid Go keys", async () => {
  const fetchMock = vi.fn(async (_url, options) => {
    expect(options.headers["x-opencode-session"]).toMatch(/^validate-[a-f0-9]{16}$/);
    expect(options.headers["x-opencode-session"]).not.toContain("secret");
    return new Response("", { status: options.headers.Authorization === "Bearer secret-b" ? 401 : 200 });
  });
  vi.stubGlobal("fetch", fetchMock);
  for (const key of ["secret-a", "secret-a", "secret-b"]) {
    const response = await POST(new Request("http://localhost/api/providers/validate", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ provider: "opencode-go", apiKey: key }),
    }));
    expect((await response.json()).valid).toBe(key !== "secret-b");
  }
  const sessions = fetchMock.mock.calls.map(([, options]) => options.headers["x-opencode-session"]);
  expect(sessions[0]).toBe(sessions[1]);
  expect(sessions[0]).not.toBe(sessions[2]);
});
