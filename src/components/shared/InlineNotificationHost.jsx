import { BellRing, ChevronRight, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import supabase from "../../Backend/lib/supabaseClient";
import { openUnifiedNotification } from "../../Backend/services/unifiedNotificationService";
import AppPortal from "./AppPortal";

const ALWAYS_AVAILABLE_CATEGORIES = new Set(["account", "payment", "safety", "security"]);

function mapRow(row) {
  return {
    ...row,
    rawId: row.id,
    source: row.sector === "platform" || row.sector === "all" ? "system" : row.sector || "system",
    actionTarget: row.action_target || "",
  };
}

export default function InlineNotificationHost({ bottomTabsHidden = false, userId = "" }) {
  const [item, setItem] = useState(null);

  const load = useCallback(async () => {
    if (!userId) {
      setItem(null);
      return;
    }

    const [{ data: rows }, { data: preferences }] = await Promise.all([
      supabase
        .from("platform_notifications")
        .select("*")
        .eq("user_id", userId)
        .eq("status", "unread")
        .eq("presentation", "inline")
        .order("created_at", { ascending: false })
        .limit(10),
      supabase
        .from("user_notification_preferences")
        .select("in_app_enabled")
        .eq("user_id", userId)
        .maybeSingle(),
    ]);

    const now = Date.now();
    const next = (rows || []).find((row) => {
      const active = !row.expires_at || new Date(row.expires_at).getTime() > now;
      const allowed = preferences?.in_app_enabled !== false || ALWAYS_AVAILABLE_CATEGORIES.has(row.category);
      return active && allowed;
    }) || null;
    setItem(next ? mapRow(next) : null);

    if (next && !next.displayed_at) {
      const at = new Date().toISOString();
      await supabase
        .from("platform_notifications")
        .update({ displayed_at: at, seen_at: at })
        .eq("id", next.id);
    }
  }, [userId]);

  useEffect(() => {
    load().catch(() => setItem(null));
    if (!userId) return undefined;
    const channel = supabase
      .channel(`inline-platform-notifications-${userId}-${crypto.randomUUID()}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "platform_notifications", filter: `user_id=eq.${userId}` },
        () => load().catch(() => {}),
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [load, userId]);

  async function dismiss() {
    const current = item;
    setItem(null);
    if (!current?.id) return;
    await supabase
      .from("platform_notifications")
      .update({ status: "archived", dismissed_at: new Date().toISOString() })
      .eq("id", current.id);
  }

  function open() {
    const current = item;
    if (!current?.id) return;
    if (!openUnifiedNotification(current)) return;

    setItem(null);
    const at = new Date().toISOString();
    supabase
      .from("platform_notifications")
      .update({ status: "read", read_at: at, seen_at: at, actioned_at: at })
      .eq("id", current.id)
      .then(() => {});
  }

  if (!item) return null;

  return (
    <AppPortal>
      <aside
        aria-live="polite"
        className={`fixed left-1/2 z-[1175] w-[min(42rem,calc(100vw-1.5rem))] -translate-x-1/2 rounded-3xl border border-sky-200 bg-white/95 p-3 shadow-2xl shadow-slate-950/20 backdrop-blur-xl transition-[bottom] ${bottomTabsHidden ? "bottom-[max(0.75rem,env(safe-area-inset-bottom))]" : "bottom-[calc(5.75rem+env(safe-area-inset-bottom))]"}`}
      >
        <div className="flex items-start gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-sky-100 text-sky-700"><BellRing size={18} /></span>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-black uppercase tracking-[0.16em] text-sky-700">{item.sector === "marketplace" ? "UrMall" : item.sector === "transport" ? "UrRide" : item.sector === "explore" ? "Explore" : "KunThai"} update</p>
            <h2 className="mt-0.5 text-sm font-black leading-5 text-slate-950">{item.title || "Important update"}</h2>
            <p className="mt-1 line-clamp-2 text-xs font-semibold leading-5 text-slate-600">{item.body}</p>
            <button type="button" onClick={open} className="mt-2 inline-flex items-center gap-1 text-xs font-black text-sky-700">Open update <ChevronRight size={14} /></button>
          </div>
          <button type="button" onClick={dismiss} aria-label="Dismiss notification" className="grid h-8 w-8 shrink-0 place-items-center rounded-xl text-slate-400 hover:bg-slate-100 hover:text-slate-700"><X size={16} /></button>
        </div>
      </aside>
    </AppPortal>
  );
}
