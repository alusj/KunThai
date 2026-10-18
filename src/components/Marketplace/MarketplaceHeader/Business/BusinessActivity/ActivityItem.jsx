import { useI18n, t } from "../../../../../i18n";
import ActivityIcon from "./ActivityIcon";
import ActivityStatusBadge from "./ActivityStatusBadge";
import { uiText as translateUi } from "../../../../../i18n/index.js";
import { notificationDisplayText } from "../../../../../Backend/services/notificationText";
import ExpandableText from "../../../../shared/ExpandableText";

// Activity buttons are stored in English ("View product"); show them in the
// seller's language.
const ACTION_LABEL_KEYS = {
  "view product": "urmall.biz.cat.viewProduct",
  "view insights": "sellerFix.viewInsights",
};

function actionLabelText(label) {
  const key = ACTION_LABEL_KEYS[String(label || "").trim().toLowerCase()];
  return key ? t(key) : translateUi(label);
}

export default function ActivityItem({ actionBusy = false, activity, dismissing = false, onAction, onDone }) {
  useI18n();
  function handleDone(event) {
    event.stopPropagation();
    onDone?.(activity);
  }

  function handleAction(event) {
    event.stopPropagation();
    onAction?.(activity);
  }

  return (
    <article className={`relative flex gap-3 border-t border-gray-100 py-4 first:border-t-0 first:pt-0 last:pb-0 ${dismissing ? "kt-notification-wipe-out" : ""}`}>
      <ActivityIcon type={activity.type} status={activity.status} />

      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            {(() => {
              const text = notificationDisplayText(activity.title, activity.description);
              return (
                <>
                  <p className="break-words font-black text-gray-950">{translateUi(text.title)}</p>
                  {text.body ? <ExpandableText text={translateUi(text.body)} className="mt-1 text-sm font-medium leading-5 text-gray-500" /> : null}
                </>
              );
            })()}
          </div>
          <ActivityStatusBadge status={activity.status} onDone={activity.dismissible === false ? null : handleDone} />
        </div>

        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2 text-xs font-black text-gray-400">
            <span>{activity.time}</span>
            {activity.meta ? (
              <>
                <span className="h-1 w-1 rounded-full bg-gray-300" />
                <span>{activity.meta}</span>
              </>
            ) : null}
          </div>

          {activity.actionLabel ? (
            <button
              type="button"
              className="rounded-lg border border-gray-200 px-3 py-2 text-xs font-black text-gray-800 hover:bg-gray-50"
              disabled={actionBusy}
              onClick={handleAction}
            >
              {actionBusy ? t("urmall.biz.actv.opening") : actionLabelText(activity.actionLabel)}
            </button>
          ) : null}
        </div>
      </div>
    </article>
  );
}
