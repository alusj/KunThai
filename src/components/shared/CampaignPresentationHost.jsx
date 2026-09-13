import { BellRing, ChevronRight, Clock3, ShieldAlert, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import supabase from "../../Backend/lib/supabaseClient";
import { mapSurfacePlatformNotification } from "../../Backend/services/surfaceNotificationModels";
import { openUnifiedNotification } from "../../Backend/services/unifiedNotificationService";
import AppPortal from "./AppPortal";

const TEMPORARY_PRESENTATIONS = new Set([
  "floating", "floating_inbox", "banner", "bottom_sheet", "modal", "fullscreen", "urgent", "critical",
]);
const REQUIRED_CATEGORIES = new Set(["account", "payment", "safety", "security", "emergency"]);
const CLOSE_MS = 360;

function pageMatches(row, currentPage) {
  const paths = row.display_config?.targetPaths || [];
  if (!paths.length || paths.includes("all")) return true;
  if (currentPage === "marketplace") return paths.some((path) => path.startsWith("urmall."));
  if (currentPage === "transport") return paths.some((path) => path.startsWith("urride.") || path.startsWith("nearby_area."));
  return paths.some((path) => path.startsWith("explore.") || path.startsWith("platform."));
}

function frequencyAllows(row, userId) {
  const behaviour = row.display_config?.behaviour || {};
  const frequency = behaviour.frequency || "once";
  const sessionKey = `kuntai-campaign-presented:${userId}:${row.id}`;
  if (["once_per_session", "every_open", "until_action"].includes(frequency)) {
    return frequency !== "until_action" || !row.actioned_at ? !sessionStorage.getItem(sessionKey) : false;
  }
  if (["daily", "custom"].includes(frequency)) {
    const hours = frequency === "daily" ? 24 : Math.max(1, Number(behaviour.frequencyHours || 24));
    const last = new Date(row.last_presented_at || 0).getTime();
    return !last || Date.now() - last >= hours * 3_600_000;
  }
  return Number(row.presentation_count || 0) === 0;
}

function rowRank(row) {
  const order = { critical: 8, urgent: 7, fullscreen: 6, modal: 5, bottom_sheet: 4, floating_inbox: 3, floating: 2, banner: 1 };
  return order[row.presentation] || 0;
}

function presentationPosition(type) {
  if (["fullscreen", "critical"].includes(type)) return "inset-0 p-0";
  if (["modal", "urgent"].includes(type)) return "inset-0 items-center justify-center p-4";
  if (type === "bottom_sheet") return "inset-0 items-end justify-center p-0 sm:p-4";
  return "inset-x-0 top-[calc(env(safe-area-inset-top)+0.75rem)] items-start justify-center px-3 sm:top-5";
}

function cardSize(type) {
  if (["fullscreen", "critical"].includes(type)) return "h-full w-full rounded-none sm:grid sm:place-items-center";
  if (["modal", "urgent"].includes(type)) return "w-full max-w-lg rounded-[32px]";
  if (type === "bottom_sheet") return "w-full max-w-2xl rounded-t-[34px] sm:rounded-[34px]";
  return "w-full max-w-md rounded-[28px]";
}

function snoozeDate(option) {
  const date = new Date();
  if (option === "1h") date.setHours(date.getHours() + 1);
  else { date.setDate(date.getDate() + 1); date.setHours(8, 0, 0, 0); }
  return date.toISOString();
}

export default function CampaignPresentationHost({ currentPage = "explore", userId = "" }) {
  const [item, setItem] = useState(null);
  const [leaving, setLeaving] = useState(false);
  const activeIdRef = useRef("");
  const closeTimerRef = useRef(null);

  const load = useCallback(async () => {
    if (!userId || activeIdRef.current) return;
    const [{ data: rows, error }, { data: preferences }] = await Promise.all([
      supabase.from("platform_notifications").select("*").eq("user_id", userId).eq("status", "unread").order("created_at", { ascending: false }).limit(50),
      supabase.from("user_notification_preferences").select("in_app_enabled,floating_enabled").eq("user_id", userId).maybeSingle(),
    ]);
    if (error) return;
    const now = Date.now();
    const next = (rows || [])
      .filter((row) => row.campaign_id && TEMPORARY_PRESENTATIONS.has(row.presentation))
      .filter((row) => !row.expires_at || new Date(row.expires_at).getTime() > now)
      .filter((row) => !row.snoozed_until || new Date(row.snoozed_until).getTime() <= now)
      .filter((row) => pageMatches(row, currentPage) && frequencyAllows(row, userId))
      .filter((row) => preferences?.in_app_enabled !== false || REQUIRED_CATEGORIES.has(row.category))
      .filter((row) => preferences?.floating_enabled !== false || ["urgent", "critical"].includes(row.priority) || REQUIRED_CATEGORIES.has(row.category))
      .sort((first, second) => rowRank(second) - rowRank(first) || new Date(second.created_at) - new Date(first.created_at))[0];
    if (!next) return;

    activeIdRef.current = next.id;
    sessionStorage.setItem(`kuntai-campaign-presented:${userId}:${next.id}`, "1");
    setItem(next);
    const at = new Date().toISOString();
    await supabase.from("platform_notifications").update({
      displayed_at: next.displayed_at || at,
      seen_at: next.seen_at || at,
      last_presented_at: at,
      presentation_count: Number(next.presentation_count || 0) + 1,
    }).eq("id", next.id).eq("user_id", userId);
  }, [currentPage, userId]);

  useEffect(() => {
    activeIdRef.current = "";
    setItem(null);
    setLeaving(false);
    load().catch(() => {});
  }, [load]);

  useEffect(() => {
    if (!userId) return undefined;
    const channel = supabase.channel(`campaign-presentations-${userId}-${crypto.randomUUID()}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "platform_notifications", filter: `user_id=eq.${userId}` }, () => load().catch(() => {}))
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [load, userId]);

  useEffect(() => () => { if (closeTimerRef.current) window.clearTimeout(closeTimerRef.current); }, []);

  const config = item?.display_config || {};
  const behaviour = config.behaviour || {};
  const presentationConfig = config.presentation || {};
  const canDismiss = behaviour.canDismiss !== false;
  const hasAction = Boolean(item?.action_target || config.action?.enabled);
  const actionLabel = item?.action_data?.actionLabel || config.action?.label || "View";
  const opening = presentationConfig.openingAnimation || "premium_fade";
  const closing = presentationConfig.closingAnimation || "soft_fade";
  const media = config.media || {};
  const mapped = useMemo(() => item ? mapSurfacePlatformNotification(item) : null, [item]);

  function finishClose() {
    setItem(null);
    setLeaving(false);
    activeIdRef.current = "";
    window.setTimeout(() => load().catch(() => {}), 0);
  }

  function animateClose() {
    setLeaving(true);
    closeTimerRef.current = window.setTimeout(finishClose, CLOSE_MS);
  }

  async function dismiss() {
    if (!item?.id || !canDismiss) return;
    const id = item.id;
    animateClose();
    await supabase.from("platform_notifications").update({ status: "archived", dismissed_at: new Date().toISOString() }).eq("id", id).eq("user_id", userId);
  }

  async function snooze() {
    if (!item?.id || !["1h", "tomorrow"].includes(behaviour.snooze)) return;
    const id = item.id;
    animateClose();
    await supabase.from("platform_notifications").update({ snoozed_until: snoozeDate(behaviour.snooze) }).eq("id", id).eq("user_id", userId);
  }

  function openAction() {
    if (!item?.id || !mapped || !openUnifiedNotification(mapped)) return;
    const id = item.id;
    const at = new Date().toISOString();
    animateClose();
    supabase.from("platform_notifications").update({ status: "read", read_at: at, seen_at: at, clicked_at: at, cta_clicked_at: at, actioned_at: at }).eq("id", id).eq("user_id", userId).then(() => {});
  }

  function openDetails() {
    if (!item?.id) return;
    const id = item.id;
    const at = new Date().toISOString();
    animateClose();
    window.dispatchEvent(new CustomEvent("kuntai-open-notification-center"));
    supabase.from("platform_notifications").update({ status: "read", read_at: at, seen_at: at, clicked_at: at }).eq("id", id).eq("user_id", userId).then(() => {});
  }

  if (!item) return null;
  const presentation = item.presentation || "floating";
  const highImpact = ["urgent", "critical"].includes(presentation) || ["urgent", "critical"].includes(item.priority);
  const directAction = behaviour.clickBehaviour === "direct" && hasAction;
  const animationClass = leaving ? `campaign-notification-exit--${closing}` : `campaign-notification-enter--${opening}`;
  const content = (
    <article className={`${animationClass} ${cardSize(presentation)} pointer-events-auto overflow-hidden border border-white/70 ${highImpact ? "bg-rose-950 text-white" : "bg-white/95 text-slate-950"} shadow-[0_30px_100px_rgba(15,23,42,0.35)] ring-1 ring-slate-950/10 backdrop-blur-2xl`}>
      <div className={["fullscreen", "critical"].includes(presentation) ? "mx-auto flex h-full w-full max-w-3xl flex-col justify-center p-6 sm:p-10" : "p-4 sm:p-5"}>
        <div className="flex items-start gap-3">
          <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-2xl ${highImpact ? "bg-white/15 text-rose-100" : "bg-emerald-100 text-emerald-700"}`}>
            {highImpact ? <ShieldAlert size={21} /> : <BellRing size={20} />}
          </span>
          <div className="min-w-0 flex-1">
            <p className={`text-[10px] font-black uppercase tracking-[0.18em] ${highImpact ? "text-rose-200" : "text-emerald-700"}`}>{highImpact ? "Important KunThai notice" : "KunThai update"}</p>
            <h2 className={`mt-1 font-black leading-tight ${["fullscreen", "critical"].includes(presentation) ? "text-3xl sm:text-5xl" : "text-base sm:text-lg"}`}>{item.title}</h2>
          </div>
          {canDismiss ? <button type="button" onClick={dismiss} aria-label="Dismiss notification" className={`grid h-9 w-9 shrink-0 place-items-center rounded-2xl ${highImpact ? "bg-white/10 text-white" : "bg-slate-100 text-slate-500"}`}><X size={18} /></button> : null}
        </div>
        {media.kind !== "none" && media.url ? <img src={media.url} alt="" className={`mt-4 w-full rounded-3xl object-cover ${["fullscreen", "critical"].includes(presentation) ? "max-h-72" : "max-h-48"}`} /> : null}
        <p className={`mt-4 font-semibold leading-6 ${["fullscreen", "critical"].includes(presentation) ? "text-lg sm:text-xl" : "text-sm"} ${highImpact ? "text-rose-50" : "text-slate-600"}`}>{item.body}</p>
        <div className="mt-5 flex flex-wrap items-center gap-2">
          <button type="button" onClick={directAction ? openAction : openDetails} className={`inline-flex h-11 items-center gap-2 rounded-2xl px-4 text-sm font-black ${highImpact ? "bg-white text-rose-950" : "bg-emerald-700 text-white"}`}>{directAction ? actionLabel : "View details"}<ChevronRight size={16} /></button>
          {["1h", "tomorrow"].includes(behaviour.snooze) ? <button type="button" onClick={snooze} className={`inline-flex h-11 items-center gap-2 rounded-2xl px-4 text-sm font-black ${highImpact ? "bg-white/10 text-white" : "bg-slate-100 text-slate-700"}`}><Clock3 size={16} />Snooze {behaviour.snooze === "1h" ? "1 hour" : "until tomorrow"}</button> : null}
        </div>
      </div>
    </article>
  );

  return (
    <AppPortal>
      <div className={`pointer-events-none fixed z-[1290] flex ${presentationPosition(presentation)}`} role={highImpact ? "alertdialog" : "dialog"} aria-modal={["bottom_sheet", "modal", "fullscreen", "urgent", "critical"].includes(presentation) ? "true" : undefined} aria-label={item.title}>
        {["bottom_sheet", "modal", "fullscreen", "urgent", "critical"].includes(presentation) ? <button type="button" aria-label="Close notification" onClick={canDismiss ? dismiss : undefined} className="pointer-events-auto absolute inset-0 bg-slate-950/55 backdrop-blur-sm" /> : null}
        <div className="relative z-10 contents">{content}</div>
      </div>
    </AppPortal>
  );
}
