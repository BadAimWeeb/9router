import { acquireBrowserContext, openPage, releaseBrowserContext } from "../../../open-sse/services/browserPool.js";
import { ZCODE_CONFIG } from "./config.js";

const CONTEXT_KEY = "zcode-captcha";

export class CaptchaManager {
  constructor() {
    this.cachedVerifyParam = null;
    this.pending = null;
    this.page = null;
    this.config = null;
    this.configFetchedAt = 0;
    this.cacheTimer = null;
  }

  async fetchConfig() {
    if (this.config && Date.now() - this.configFetchedAt < ZCODE_CONFIG.captchaConfigCacheTtlMs) return this.config;
    try {
      const response = await fetch(`https://zcode.z.ai/api/v1/client/configs?app_version=${ZCODE_CONFIG.appVersion}&platform=win32`);
      if (response.ok) {
        const payload = await response.json();
        if (payload?.data?.configs?.captcha) {
          this.config = payload.data.configs.captcha;
          this.configFetchedAt = Date.now();
          return this.config;
        }
      }
    } catch {
      // Upstream config is best-effort; the bundled defaults match ZCode.
    }
    return { enabled: true, prefix: "no8xfe", region: "sgp", sceneId: "11xygtvd" };
  }

  async openPage(headless) {
    await this.page?.close().catch(() => {});
    await releaseBrowserContext(CONTEXT_KEY).catch(() => {});
    const pooled = await acquireBrowserContext(CONTEXT_KEY, { headless });
    if (headless && !pooled.isStealth) {
      throw new Error("ZCode captcha requires Obscura or optional cloakbrowser stealth runtime");
    }
    this.page = await openPage(pooled);
    this.page.on("console", (message) => console.log(`[ZCode Captcha] ${message.text()}`));
    this.page.on("pageerror", (error) => console.error("[ZCode Captcha] page error:", error.message));
    this.page.on("requestfailed", (request) => console.warn("[ZCode Captcha] request failed:", request.url(), request.failure()?.errorText));
    await this.page.goto(
      `http://127.0.0.1:${ZCODE_CONFIG.captchaPort}/zcode/captcha.html${headless ? "" : "?mode=interactive"}`,
      { waitUntil: "domcontentloaded", timeout: 30000 },
    );
  }

  getVerifyParam() {
    if (this.cachedVerifyParam) return Promise.resolve(this.cachedVerifyParam);
    if (this.pending) return this.pending.promise;

    let resolve;
    let reject;
    const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
    const timer = setTimeout(() => {
      if (!this.pending || this.pending.promise !== promise) return;
      this.pending = null;
      reject(new Error("ZCode captcha verification timed out"));
    }, ZCODE_CONFIG.captchaHeadlessTimeoutMs + (ZCODE_CONFIG.headedFallback ? ZCODE_CONFIG.captchaInteractiveTimeoutMs : 0));
    timer.unref?.();
    this.pending = { promise, resolve, reject, timer, headed: false };
    if (ZCODE_CONFIG.headedFallback) {
      const fallbackTimer = setTimeout(() => {
        if (this.pending?.promise !== promise || this.pending.headed) return;
        this.needsInteractive().catch((error) => {
          if (this.pending?.promise !== promise) return;
          clearTimeout(timer);
          this.pending = null;
          reject(error);
        });
      }, ZCODE_CONFIG.captchaHeadlessTimeoutMs);
      fallbackTimer.unref?.();
    }
    this.openPage(true).catch((error) => {
      if (this.pending?.promise !== promise) return;
      clearTimeout(timer);
      this.pending = null;
      reject(error);
    });
    return promise;
  }

  async needsInteractive() {
    if (!this.pending || this.pending.headed || !ZCODE_CONFIG.headedFallback) return;
    this.pending.headed = true;
    await this.openPage(false);
  }

  submit(verifyParam) {
    if (typeof verifyParam !== "string" || !verifyParam.trim()) throw new Error("verifyParam is required");
    const value = verifyParam.trim();
    this.cachedVerifyParam = value;
    if (this.cacheTimer) clearTimeout(this.cacheTimer);
    this.cacheTimer = setTimeout(() => { this.cachedVerifyParam = null; }, ZCODE_CONFIG.captchaCacheTtlMs);
    this.cacheTimer.unref?.();
    const pending = this.pending;
    if (pending) {
      clearTimeout(pending.timer);
      this.pending = null;
      pending.resolve(value);
    }
  }

  invalidate() {
    this.cachedVerifyParam = null;
    if (this.cacheTimer) clearTimeout(this.cacheTimer);
    this.cacheTimer = null;
  }
}
