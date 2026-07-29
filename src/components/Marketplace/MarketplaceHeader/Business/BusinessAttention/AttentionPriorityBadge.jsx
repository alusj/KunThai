import { useI18n, t } from "../../../../../i18n";

const PRIORITY_STYLES = {
  high: "bg-red-50 text-red-700",
  medium: "bg-amber-50 text-amber-700",
  low: "bg-gray-100 text-gray-600",
};

const PRIORITY_KEYS = { high: "prHigh", medium: "prMedium", low: "prLow" };

export default function AttentionPriorityBadge({ priority }) {
  useI18n();
  return (
    <span
      className={`rounded-full px-2.5 py-1 text-xs font-black capitalize ${PRIORITY_STYLES[priority]}`}
    >
      {PRIORITY_KEYS[priority] ? t(`urmall.biz.attn.${PRIORITY_KEYS[priority]}`) : priority}
    </span>
  );
}
