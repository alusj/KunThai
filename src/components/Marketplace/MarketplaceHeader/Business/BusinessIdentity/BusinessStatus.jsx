// src/components/Marketplace/MarketplaceHeader/Business/BusinessIdentity/BusinessStatus.jsx

/**
 * BusinessStatus
 * --------------
 * Displays the current status of the business.
 * Easy to extend: open, closed, suspended, verified.
 */

import { useI18n, t } from "../../../../../i18n";

export default function BusinessStatus({ status = "open" }) {
  useI18n();
  const statusMap = {
    open: {
      labelKey: "urmall.biz.id.open",
      color: "bg-green-100 text-green-700",
    },
    closed: {
      labelKey: "urmall.biz.id.closed",
      color: "bg-red-100 text-red-700",
    },
    pending: {
      labelKey: "urmall.biz.id.pending",
      color: "bg-yellow-100 text-yellow-700",
    },
  };

  const current = statusMap[status] || statusMap.open;

  return (
    <span
      className={`px-3 py-1 rounded-full text-xs font-medium ${current.color}`}
    >
      {t(current.labelKey)}
    </span>
  );
}
