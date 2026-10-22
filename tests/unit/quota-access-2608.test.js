import { describe, it, expect } from "vitest";

import {
  anonymizeConnectionLabel,
  normalizeQuotaAccess,
  QUOTA_ACCESS_FULL,
  QUOTA_ACCESS_ANONYMIZED,
} from "@/shared/utils/quotaAccess";

describe("quota access utils", () => {
  it("normalizeQuotaAccess defaults unknown values to full", () => {
    expect(normalizeQuotaAccess(null)).toBe(QUOTA_ACCESS_FULL);
    expect(normalizeQuotaAccess(undefined)).toBe(QUOTA_ACCESS_FULL);
    expect(normalizeQuotaAccess("bogus")).toBe(QUOTA_ACCESS_FULL);
    expect(normalizeQuotaAccess(QUOTA_ACCESS_ANONYMIZED)).toBe(QUOTA_ACCESS_ANONYMIZED);
    expect(normalizeQuotaAccess(QUOTA_ACCESS_FULL)).toBe(QUOTA_ACCESS_FULL);
  });

  it("anonymizeConnectionLabel returns a stable one-way label", () => {
    const c1 = { id: "abc123", name: "Personal Claude", email: "me@example.com" };
    const c2 = { id: "xyz789", name: "Work Codex", email: "work@example.com" };
    const a = anonymizeConnectionLabel(c1, "salt-1");
    const b = anonymizeConnectionLabel(c2, "salt-1");
    const c = anonymizeConnectionLabel(c1, "salt-2");
    expect(a).toMatch(/^conn-[0-9a-z]+$/);
    expect(a).not.toBe(b);
    expect(a).not.toContain("Personal");
    expect(a).not.toContain("Claude");
    // stable
    expect(anonymizeConnectionLabel(c1, "salt-1")).toBe(a);
    // different salt / different machine → different label
    expect(c).not.toBe(a);
  });

  it("anonymizeConnectionLabel tolerates missing fields", () => {
    expect(anonymizeConnectionLabel(null, "s")).toBe("conn-?");
    expect(anonymizeConnectionLabel({}, "s")).toMatch(/^conn-[0-9a-z]+$/);
  });
});
