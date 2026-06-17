import { useEffect,useMemo, useState } from "react";
import { createPortal } from "react-dom";
import {
  Bell,
  Image,
  Menu,
  Megaphone,
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
const CREATE_MENU_EXIT_MS = 280;

export default function ExploreHeader({ currentProfile, onAlertsClick, onNavigate, onCreateSelect, onSearchResult }) {
  const [searchOpen, setSearchOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [createClosing, setCreateClosing] = useState(false);
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
  const createVisible = createOpen || createClosing;

  useBodyScrollLock(createVisible);

  useEffect(() => {
    if (!createVisible) return undefined;

    function handleKeyDown(event) {
      if (event.key === "Escape") {
        closeCreateMenu();
      }
    }

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [createVisible]);

  useEffect(() => {
    function refreshBadge() {
      setBellBadgeCount(getUnseenNotificationCount(EXPLORE_BELL_SEEN_SCOPE, notifications));
    }

    refreshBadge();
    return subscribeNotificationSeen((event) => {
      if (event.detail?.scope === EXPLORE_BELL_SEEN_SCOPE) refreshBadge();
    });
  }, [notifications]);

  function closeCreateMenu(afterClose) {
    if (!createOpen && !createClosing) {
      afterClose?.();
      return;
    }

    setCreateOpen(false);
    setCreateClosing(true);
    window.setTimeout(() => {
      setCreateClosing(false);
      afterClose?.();
    }, CREATE_MENU_EXIT_MS);
  }

  function toggleCreateMenu() {
    if (createOpen || createClosing) {
      closeCreateMenu();
      return;
    }

    setCreateOpen(true);
  }

  function selectCreateType(type) {
    closeCreateMenu(() => onCreateSelect?.(type));
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
                icon={createVisible ? X : Plus}
                label={createVisible ? "Close create menu" : "Create"}
                onClick={toggleCreateMenu}
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

      {createVisible
        ? createPortal(
            <div className="fixed inset-0 z-[90] flex items-start justify-center px-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] pt-[calc(env(safe-area-inset-top)+5.25rem)] sm:items-center sm:pt-4">
              <button
                type="button"
                aria-label="Close create menu"
                className={`${createClosing ? "kt-create-popup-backdrop-out" : "kt-create-popup-backdrop"} absolute inset-0 cursor-default`}
                onClick={() => closeCreateMenu()}
              />
              <div
                role="dialog"
                aria-modal="true"
                aria-label="Create"
                className={`relative z-10 w-full max-w-sm rounded-[28px] border border-white/80 bg-white/95 p-3 text-left shadow-2xl shadow-slate-950/20 ${
                  createClosing ? "kt-toast-collapse-out" : "kt-toast-expand-in"
                }`}
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
                    onClick={() => closeCreateMenu()}
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
                <button
                  type="button"
                  onClick={() => selectCreateType("advert")}
                  className="kt-pressable mt-2 flex w-full items-center gap-3 rounded-[22px] border border-amber-200 bg-amber-50/80 p-4 text-left shadow-sm shadow-amber-900/[0.05] hover:border-amber-300 hover:bg-amber-50"
                >
                  <span className="grid h-11 w-11 place-items-center rounded-2xl bg-white text-amber-700 ring-1 ring-amber-100">
                    <Megaphone size={20} strokeWidth={2.3} absoluteStrokeWidth />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-base font-black text-slate-950">Post an advert</span>
                    <span className="mt-0.5 block text-xs font-bold leading-5 text-slate-500">Promote an offer, event, service, or location.</span>
                  </span>
                </button>
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
