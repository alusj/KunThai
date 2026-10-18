import { useI18n, t } from "../../../../../i18n";
import AttentionIcon from "./AttentionIcon";
import AttentionPriorityBadge from "./AttentionPriorityBadge";
import { uiText as translateUi } from "../../../../../i18n/index.js";
import { notificationDisplayText } from "../../../../../Backend/services/notificationText";
import ExpandableText from "../../../../shared/ExpandableText";

export default function AttentionItem({ item, onAction }) {
  useI18n();
  return (
    <article className={`rounded-xl border p-4 shadow-sm transition ${item.read ? "border-gray-200 bg-white" : "border-emerald-200 bg-emerald-50/90"}`}>
      <div className="flex gap-3">
        <AttentionIcon type={item.type} priority={item.priority} />

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              {(() => {
                const text = notificationDisplayText(item.title, item.description);
                return (
                  <>
                    <h4 className="break-words font-black text-gray-950">{translateUi(text.title)}</h4>
                    {text.body ? <ExpandableText text={translateUi(text.body)} className="mt-1 text-sm font-medium leading-5 text-gray-500" /> : null}
                  </>
                );
              })()}
            </div>
            <AttentionPriorityBadge priority={item.priority} />
          </div>

          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-sm font-bold text-gray-500">
              <span>{t(item.count === 1 ? "urmall.biz.stats.itemsOne" : "urmall.biz.stats.itemsMany", { count: item.count })}</span>
              <span className="h-1 w-1 rounded-full bg-gray-300" />
              <span>{item.dueLabel}</span>
            </div>

            <button
              type="button"
              className="rounded-lg border border-gray-200 px-3 py-2 text-sm font-black text-gray-800 transition hover:bg-gray-50"
              onClick={() => onAction?.(item)}
            >
              {translateUi(item.actionLabel)}
            </button>
          </div>
        </div>
      </div>
    </article>
  );
}
