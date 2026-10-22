// Per-API-key quota visibility for /api/quota: "full" shows real connection
// names/emails, "anonymized" replaces them with stable short hashes.
// Shared constants. Used by the apiKeysRepo, the /api/keys routes and the
// Endpoint page, and by /api/quota.

export const QUOTA_ACCESS_FULL = "full";
export const QUOTA_ACCESS_ANONYMIZED = "anonymized";
export const QUOTA_ACCESS_MODES = [QUOTA_ACCESS_FULL, QUOTA_ACCESS_ANONYMIZED];

// Default/full for anything arrival without a known value (legacy rows, bad
// backups, tampered PUT bodies) — safest and backward-compatible.
export function normalizeQuotaAccess(value) {
  return value === QUOTA_ACCESS_ANONYMIZED ? QUOTA_ACCESS_ANONYMIZED : QUOTA_ACCESS_FULL;
}

// Stable one-way label for a connection in anonymized mode. Salt makes the
// mapping different per 9router instance so ids can't be cross-indexed.
export function anonymizeConnectionLabel(connection, machineId) {
  if (!connection) return "conn-?";
  const input = `${connection.id || connection.name || "?"}`;
  let h = 0;
  const salted = `${machineId || "9r"}:${input}`;
  for (let i = 0; i < salted.length; i++) {
    h = (h * 31 + salted.charCodeAt(i)) >>> 0;
  }
  return `conn-${h.toString(36)}`;
}
