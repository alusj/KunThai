import { useI18n, t } from "../../../../../i18n";

const STATUS_LABEL_KEYS = {
  active: "stActive",
  completed: "stDone",
  "needs-reply": "stReply",
  new: "stNew",
  warning: "stWarning",
};

const STATUS_STYLES = {
  active: "bg-blue-50 text-blue-700",
  completed: "bg-emerald-50 text-emerald-700",
  "needs-reply": "bg-red-50 text-red-700",
  new: "bg-blue-50 text-blue-700",
  warning: "bg-amber-50 text-amber-700",
};

export default function ActivityStatusBadge({ status, onDone }) {
  useI18n();
  if (status === "completed" && onDone) {
    return (
      <button
        type="button"
        onClick={onDone}
        className="kt-pressable rounded-full bg-emerald-50 px-3 py-1 text-xs font-black text-emerald-700 transition hover:bg-emerald-100"
      >
        {t("urmall.biz.actv.done")}
      </button>
    );
  }

  return (
    <span className={`rounded-full px-2.5 py-1 text-xs font-black ${STATUS_STYLES[status]}`}>
      {STATUS_LABEL_KEYS[status] ? t(`urmall.biz.actv.${STATUS_LABEL_KEYS[status]}`) : status}
    </span>
  );
}
