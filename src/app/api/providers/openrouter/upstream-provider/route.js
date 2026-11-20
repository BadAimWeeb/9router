import { getSettings, updateSettings } from "@/lib/localDb";
import { getModelMeta, getModelUpstreamId } from "open-sse/config/providerModels.js";
import { stripThinkingSuffix } from "open-sse/translator/concerns/thinkingUnified.js";
import { proxyAwareFetch } from "open-sse/utils/proxyFetch.js";

const MODEL_ID = /^[a-z0-9][a-z0-9_.-]*\/[a-z0-9][a-z0-9_.-]*(?::[a-z0-9-]+)*$/i;
const PROVIDER_SLUG = /^[a-z0-9-]+(?:\/[a-z0-9-]+)*$/;

function getModel(request) {
  const model = new URL(request.url).searchParams.get("model");
  return model && model.length <= 256 && MODEL_ID.test(model) ? model : null;
}

function invalidModel() {
  return Response.json({ error: "Enter an OpenRouter model ID in author/model format." }, { status: 400 });
}

export async function GET(request) {
  const model = getModel(request);
  if (!model) return invalidModel();

  const defaults = (await getSettings()).openrouterProviderDefaults || {};
  const slug = Object.hasOwn(defaults, model) ? defaults[model] : getModelMeta("openrouter", model)?.defaultUpstreamProvider ?? null;
  const upstreamId = stripThinkingSuffix(getModelUpstreamId("openrouter", model));
  const path = upstreamId.split("/").map(encodeURIComponent).join("/");
  try {
    const response = await proxyAwareFetch(`https://openrouter.ai/api/v1/models/${path}/endpoints`, {
      signal: AbortSignal.timeout(8000),
      redirect: "error",
    });
    if (!response.ok) throw new Error(`OpenRouter returned ${response.status}`);
    const { data } = await response.json();
    const providers = new Map();
    for (const endpoint of data.endpoints) {
      const tag = endpoint?.tag;
      if (typeof tag === "string" && tag.length <= 256 && PROVIDER_SLUG.test(tag)) {
        providers.set(tag, typeof endpoint.provider_name === "string" && endpoint.provider_name || tag);
      }
    }
    return Response.json({ slug, providers: [...providers].map(([slug, name]) => ({ slug, name })) });
  } catch {
    return Response.json({ slug, providers: [], warning: "Could not load endpoints from OpenRouter. You can still select Automatic." });
  }
}

export async function PUT(request) {
  const model = getModel(request);
  if (!model) return invalidModel();
  const payload = await request.json().catch(() => null);
  const slug = payload?.slug;
  if (slug !== null && !(typeof slug === "string" && slug.length <= 256 && PROVIDER_SLUG.test(slug))) {
    return Response.json({ error: "Select a valid OpenRouter endpoint or Automatic." }, { status: 400 });
  }

  await updateSettings((settings) => {
    const defaults = { ...settings.openrouterProviderDefaults };
    // A null entry masks a source-configured default on this model.
    if (slug === null && !getModelMeta("openrouter", model)?.defaultUpstreamProvider) delete defaults[model];
    else defaults[model] = slug;
    return { openrouterProviderDefaults: defaults };
  });
  return Response.json({ slug });
}
