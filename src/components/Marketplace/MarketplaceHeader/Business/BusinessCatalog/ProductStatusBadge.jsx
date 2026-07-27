import { useI18n, t } from "../../../../../i18n";

const STATUS_LABEL_KEYS = {
  active: "statusActive",
  draft: "statusDraft",
  "low-stock": "statusLowStock",
  "out-of-stock": "statusOutStock",
  "pending-review": "statusPendingReview",
  paused: "statusPaused",
};

const STATUS_STYLES = {
  active: "bg-emerald-50 text-emerald-700",
  draft: "bg-gray-100 text-gray-600",
  "low-stock": "bg-amber-50 text-amber-700",
  "out-of-stock": "bg-red-50 text-red-700",
  "pending-review": "bg-blue-50 text-blue-700",
  paused: "bg-gray-100 text-gray-600",
};

export default function ProductStatusBadge({ status }) {
  useI18n();
  return (
    <span className={`rounded-full px-2.5 py-1 text-xs font-black ${STATUS_STYLES[status]}`}>
      {STATUS_LABEL_KEYS[status] ? t(`urmall.biz.cat.${STATUS_LABEL_KEYS[status]}`) : status}
    </span>
  );
}
