import { useEffect, useRef } from "react";
import { BellRing, ChevronRight, X } from "lucide-react";

import { campaignContentFromRow } from "../../../Backend/services/campaigns/campaignModel";
import {
  archiveCampaignInboxItem,
  recordCampaignClick,
  recordCampaignRead,
  recordCampaignSeenInInbox,
} from "../../../Backend/services/campaigns/campaignDeliveryService";
import { useCampaignInbox } from "../../../Backend/hooks/useCampaignInbox";
import { mapSurfacePlatformNotification } from "../../../Backend/services/surfaceNotificationModels";
import { openUnifiedNotification } from "../../../Backend/services/unifiedNotificationService";
import { formatRelativeTime } from "../../../Backend/services/explore/time";
import { t as i18nText } from "../../../i18n/index";
import { uiText as translateUi, useI18n as useUiLocale } from "../../../i18n/index.js";

export default function CampaignInboxSection({ inbox, title = "KunThai updates", tone = "emerald", onNavigate, className = "" }) {
  useUiLocale();
  const { items, setItems } = useCampaignInbox(inbox);
  const seenRef = useRef(new Set());

  // Listing a campaign in an open inbox counts as it being seen.
  useEffect(() => {
    items.forEach((item) => {
      if (item.seen_at || seenRef.current.has(item.id)) return;
      seenRef.current.add(item.id);
      recordCampaignSeenInInbox(item).catch(() => {});
    });
  }, [items]);

  if (!items.length) return null;

  const accent = tone === "blue" ? "text-blue-700 bg-blue-50" : "text-emerald-700 bg-emerald-50";

  function markLocally(id, patch) {
    setItems((current) => current.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  }

  function open(item) {
    if (item.action_target) {
      if (!openUnifiedNotification(mapSurfacePlatformNotification(item))) return;
      recordCampaignClick(item, { cta: true }).catch(() => {});
      onNavigate?.();
    } else {
      recordCampaignRead(item).catch(() => {});
    }
    markLocally(item.id, { status: "read" });
  }

  function remove(item) {
    archiveCampaignInboxItem(item).catch(() => {});
    setItems((current) => current.filter((entry) => entry.id !== item.id));
  }

  return (
    <section aria-label={translateUi(title)} className={`space-y-3 ${className}`}>
      <p className="text-xs font-black uppercase tracking-wide text-gray-500">{translateUi(title)}</p>
      {items.map((item) => {
        const content = campaignContentFromRow(item);
        const unread = item.status === "unread";
        return (
          <article
            key={item.id}
            className={`rounded-2xl border p-4 shadow-sm ${unread ? "border-emerald-100 bg-white" : "border-gray-100 bg-white/80"}`}
          >
            <div className="flex items-start gap-3">
              <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-2xl ${accent}`}>
                <BellRing size={18} aria-hidden="true" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  {unread ? <span className="h-2 w-2 rounded-full bg-emerald-600" aria-label={i18nText("ui.literals.k07b032b56f7a")} /> : null}
                  {content.badge ? <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-black text-amber-800">{content.badge}</span> : null}
                  <span className="text-[11px] font-bold text-gray-400">{formatRelativeTime(item.created_at)}</span>
                </div>
                <h3 className="mt-1 break-words text-sm font-black text-gray-950">{content.title}</h3>
                <p className="mt-1 whitespace-pre-line break-words text-sm font-semibold leading-6 text-gray-600">{content.body}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {content.hasAction || unread ? (
                  <button
                    type="button"
                    onClick={() => open(item)}
                    className="inline-flex min-h-10 items-center gap-1 rounded-xl bg-gray-950 px-3 text-xs font-black text-white hover:bg-gray-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gray-950"
                  >
                    {content.hasAction ? content.actionLabel : i18nText("ui.literals.kc1ee860bc3a9")}
                    {content.hasAction ? <ChevronRight size={14} /> : null}
                  </button>
                  ) : null}
                  {content.hasAction && unread ? (
                    <button
                      type="button"
                      onClick={() => {
                        recordCampaignRead(item).catch(() => {});
                        markLocally(item.id, { status: "read" });
                      }}
                      className="min-h-10 rounded-xl border border-gray-200 bg-white px-3 text-xs font-black text-gray-700 hover:bg-gray-50"
                    >
                      {i18nText("ui.literals.kc1ee860bc3a9")}
                    </button>
                  ) : null}
                </div>
              </div>
              <button
                type="button"
                onClick={() => remove(item)}
                aria-label={i18nText("ui.literals.ka2d40d3386fc", { value0: content.title })}
                className="grid h-9 w-9 shrink-0 place-items-center rounded-xl text-gray-400 hover:bg-gray-100 hover:text-gray-700"
              >
                <X size={16} />
              </button>
            </div>
          </article>
        );
      })}
    </section>
  );
}
