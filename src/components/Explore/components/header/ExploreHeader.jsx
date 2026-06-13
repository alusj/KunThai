import { useEffect,useMemo, useState } from "react";
import { createPortal } from "react-dom";
import {
  Bell,
  Image,
  Menu,
  MessageCircle,
  Mic,
  PenSquare,
  Plus,
  Search,
  Video,
  X,
} from "lucide-react";

import { useExploreNotifications } from "../../../../Backend/hooks/useExploreNotifications";
import { useExploreMessageStatus } from "../../../../Backend/hooks/useExploreMessageStatus";
import {
  getUnseenNotificationCount,
  markNotificationsSeen,
  subscribeNotificationSeen,
} from "../../../../Backend/services/notificationSeenStore";
import PremiumHeader, { PremiumHeaderButton } from "../../../shared/PremiumHeader";
import useBodyScrollLock from "../../../shared/useBodyScrollLock";
import SearchOverlay from "./search/SearchOverlay";

const EXPLORE_BELL_SEEN_SCOPE = "explore.header.bell";

export default function ExploreHeader({ currentProfile, onAlertsClick, onNavigate, onCreateSelect, onSearchResult }) {
  const [searchOpen, setSearchOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [bellBadgeCount, setBellBadgeCount] = useState(0);
  const { notifications } = useExploreNotifications();
  const messageStatus = useExploreMessageStatus(currentProfile?.userId || "");
  const latestMessage = useMemo(
  () =>
    notifications.find(
      (item) => item.type !== "message"
    )?.message || "",
  [notifications]
);
  useBodyScrollLock(createOpen);

  useEffect(() => {
    if (!createOpen) return undefined;

    function handleKeyDown(event) {
      if (event.key === "Escape") {
        setCreateOpen(false);
      }
    }

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [createOpen]);

  useEffect(() => {
    function refreshBadge() {
      setBellBadgeCount(getUnseenNotificationCount(EXPLORE_BELL_SEEN_SCOPE, notifications));
    }

    refreshBadge();
    return subscribeNotificationSeen((event) => {
      if (event.detail?.scope === EXPLORE_BELL_SEEN_SCOPE) refreshBadge();
    });
  }, [notifications]);

  function selectCreateType(type) {
    setCreateOpen(false);
    onCreateSelect?.(type);
  }

  function openAlerts() {
    markNotificationsSeen(EXPLORE_BELL_SEEN_SCOPE, notifications);
    setBellBadgeCount(0);
    onAlertsClick?.();
  }

  return (
    <>
      <div className="w-full max-w-full overflow-x-clip">
        <SearchOverlay open={searchOpen} onClose={() => setSearchOpen(false)} onOpenResult={onSearchResult} />
        <PremiumHeader
          accent="sky"
          title="Explore"
          left={(
            <>
              <PremiumHeaderButton icon={Menu} label="Open Explore menu" onClick={() => onNavigate?.("Menu")} />
              <PremiumHeaderButton
                active={messageStatus.active}
                accent="sky"
                badge={messageStatus.unreadCount}
                icon={MessageCircle}
                label={messageStatus.activity ? "Messages active now" : "Messages"}
                onClick={() => onNavigate?.("Messages")}
              />
            </>
          )}
          right={(
            <>
              <PremiumHeaderButton
                icon={Search}
                label="Search Explore"
                onClick={() => {
                  setCreateOpen(false);
                  setSearchOpen(true);
                }}
              />
              <PremiumHeaderButton
                active
                accent="sky"
                icon={createOpen ? X : Plus}
                label={createOpen ? "Close create menu" : "Create"}
                onClick={() => setCreateOpen((current) => !current)}
              />
              <PremiumHeaderButton
                badge={bellBadgeCount}
                icon={Bell}
                label="Notifications"
                onClick={openAlerts}
                title={latestMessage || "Notifications"}
              />
            </>
          )}
        />
      </div>

      {createOpen
        ? createPortal(
            <div className="fixed inset-0 z-[90] flex items-start justify-center px-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] pt-[calc(env(safe-area-inset-top)+5.25rem)] sm:items-center sm:pt-4">
              <button
                type="button"
                aria-label="Close create menu"
                className="kt-create-popup-backdrop absolute inset-0 cursor-default"
                onClick={() => setCreateOpen(false)}
              />
              <div
                role="dialog"
                aria-modal="true"
                aria-label="Create"
                className="kt-create-popup-panel relative z-10 w-full max-w-sm rounded-[28px] border border-white/80 bg-white/95 p-3 text-left shadow-2xl shadow-slate-950/20"
                onClick={(event) => event.stopPropagation()}
              >
                <div className="flex items-center justify-between px-2 pb-3 pt-1">
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-[0.24em] text-sky-700">KunThai</p>
                    <h2 className="mt-1 text-xl font-black text-slate-950">Create</h2>
                  </div>
                  <button
                    type="button"
                    aria-label="Close create menu"
                    className="kt-pressable grid h-10 w-10 place-items-center rounded-2xl border border-slate-200 bg-white text-slate-600 shadow-sm hover:border-slate-300 hover:text-slate-950"
                    onClick={() => setCreateOpen(false)}
                  >
                    <X size={18} strokeWidth={2.35} absoluteStrokeWidth />
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <CreateMenuItem accent="sky" icon={PenSquare} label="Text" onClick={() => selectCreateType("text")} />
                  <CreateMenuItem accent="emerald" icon={Image} label="Photo" onClick={() => selectCreateType("image")} />
                  <CreateMenuItem accent="violet" icon={Mic} label="Voice" onClick={() => selectCreateType("voice")} />
                  <CreateMenuItem accent="rose" icon={Video} label="Video" onClick={() => selectCreateType("video")} />
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}

const createItemAccent = {
  emerald: "bg-emerald-50 text-emerald-700 ring-emerald-100",
  rose: "bg-rose-50 text-rose-700 ring-rose-100",
  sky: "bg-sky-50 text-sky-700 ring-sky-100",
  violet: "bg-violet-50 text-violet-700 ring-violet-100",
};

function CreateMenuItem({ accent = "sky", icon, label, onClick }) {
  const Icon = icon;

  return (
    <button
      type="button"
      onClick={onClick}
      className="kt-create-popup-item kt-pressable flex min-h-24 w-full flex-col items-start justify-between rounded-[22px] border border-slate-200 bg-white p-4 text-left shadow-sm shadow-slate-950/[0.04] hover:border-slate-300 hover:bg-slate-50"
    >
      <span className={`grid h-11 w-11 place-items-center rounded-2xl ring-1 ${createItemAccent[accent] || createItemAccent.sky}`}>
        {Icon ? <Icon size={20} strokeWidth={2.3} absoluteStrokeWidth /> : null}
      </span>
      <span className="text-base font-black text-slate-950">{label}</span>
    </button>
  );
}
