"use client";

// Per-API-key quota-view mode on the Endpoint page for /api/quota.
// "full" shows real connection names/emails; "anonymized" replaces them with
// stable one-way labels and, when possible, aggregates same-provider
// connections into provider-level totals.
import PropTypes from "prop-types";
import { QUOTA_ACCESS_ANONYMIZED, QUOTA_ACCESS_FULL } from "@/shared/utils/quotaAccess";

export default function QuotaAccessControls({ apiKey, onChange }) {
  const mode = apiKey.quotaAccess || QUOTA_ACCESS_FULL;

  return (
    <div className="mt-2" data-testid="key-quota-access">
      <div className="flex items-center gap-2 text-xs">
        <span className="text-text-muted">Quota view (via /api/quota):</span>
        <select
          value={mode}
          onChange={(e) => onChange(e.target.value)}
          className="rounded-xl border border-black/10 bg-bg-primary px-2 py-0.5 text-xs dark:border-white/10"
          title="What this key sees when calling GET /api/quota"
        >
          <option value={QUOTA_ACCESS_FULL}>Full</option>
          <option value={QUOTA_ACCESS_ANONYMIZED}>Anonymized</option>
        </select>
      </div>
    </div>
  );
}

QuotaAccessControls.propTypes = {
  apiKey: PropTypes.shape({
    id: PropTypes.string.isRequired,
    name: PropTypes.string,
    quotaAccess: PropTypes.oneOf([QUOTA_ACCESS_FULL, QUOTA_ACCESS_ANONYMIZED]),
  }).isRequired,
  onChange: PropTypes.func.isRequired,
};
