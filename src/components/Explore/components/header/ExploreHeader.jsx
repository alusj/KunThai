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
  EXPLORE_NOTIFICATION_SEEN_SCOPE,
  EXPLORE_MESSAGE_SEEN_SCOPE,
  getUnseenNotificationCount,
  markNotificationScopeVisited,
  markNotificationsSeen,
  subscribeNotificationSeen,
} from "../../../../Backend/services/notificationSeenStore";
import PremiumHeader, { PremiumHeaderButton } from "../../../shared/PremiumHeader";
import useBodyScrollLock from "../../../shared/useBodyScrollLock";
import SearchOverlay from "./search/SearchOverlay";

const CREATE_MENU_EXIT_MS = 280;

export default function ExploreHeader({ currentProfile, onAlertsClick, onNavigate, onCreateSelect, onSearchResult, onOverlayChange }) {
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchInitialQuery, setSearchInitialQuery] = useState("");
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
    function handleSearchQuery(event) {
      const query = String(event.detail?.query || "").trim();
      if (!query) return;
      setCreateOpen(false);
      setSearchInitialQuery(query);
      setSearchOpen(true);
    }

    window.addEventListener("explore-search-query", handleSearchQuery);
    return () => window.removeEventListener("explore-search-query", handleSearchQuery);
  }, []);

  useEffect(() => {
    onOverlayChange?.(searchOpen || createVisible);
    return () => onOverlayChange?.(false);
  }, [createVisible, onOverlayChange, searchOpen]);

  useEffect(() => {
    if (!createVisible) return undefined;

    function handleKeyDown(event) {
      if (event.key === "Escape") {
        setCreateOpen(false);
        setCreateClosing(true);
        window.setTimeout(() => setCreateClosing(false), CREATE_MENU_EXIT_MS);
      }
    }

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [createVisible]);

  useEffect(() => {
    function refreshBadge() {
      setBellBadgeCount(getUnseenNotificationCount(EXPLORE_NOTIFICATION_SEEN_SCOPE, notifications));
    }

    refreshBadge();
    return subscribeNotificationSeen((event) => {
      if (event.detail?.scope === EXPLORE_NOTIFICATION_SEEN_SCOPE || event.detail?.scope === "*") refreshBadge();
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
    markNotificationScopeVisited(EXPLORE_NOTIFICATION_SEEN_SCOPE);
    markNotificationsSeen(EXPLORE_NOTIFICATION_SEEN_SCOPE, notifications);
    setBellBadgeCount(0);
    onAlertsClick?.();
  }

  function openMessages() {
    markNotificationScopeVisited(EXPLORE_MESSAGE_SEEN_SCOPE);
    onNavigate?.("Messages");
  }

  return (
    <>
      <div className="w-full max-w-full overflow-x-clip">
        <SearchOverlay
          initialQuery={searchInitialQuery}
          open={searchOpen}
          onClose={() => {
            setSearchOpen(false);
            setSearchInitialQuery("");
          }}
          onOpenResult={onSearchResult}
        />
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
                onClick={openMessages}
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
                  setSearchInitialQuery("");
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
            <div
              role="dialog"
              aria-modal="true"
              aria-label="Create"
              className={`fixed inset-0 z-[90] flex h-full w-full flex-col bg-slate-50 ${
                createClosing ? "kt-explore-stack-leave-right" : "kt-explore-stack-enter"
              }`}
            >
              <header className="flex items-center justify-between border-b border-slate-200 px-4 pb-3 pt-[calc(env(safe-area-inset-top)+0.9rem)]">
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
              </header>
              <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-[calc(env(safe-area-inset-bottom)+2rem)] pt-5">
                <div className="mx-auto w-full max-w-sm">
                  <p className="px-1 pb-3 text-sm font-bold text-slate-500">What would you like to share?</p>
                  <div className="grid grid-cols-2 gap-3">
                    <CreateMenuItem accent="sky" icon={PenSquare} label="Text" onClick={() => selectCreateType("text")} />
                    <CreateMenuItem accent="emerald" icon={Image} label="Photo" onClick={() => selectCreateType("image")} />
                    <CreateMenuItem accent="violet" icon={Mic} label="Voice" onClick={() => selectCreateType("voice")} />
                    <CreateMenuItem accent="rose" icon={Video} label="Video" onClick={() => selectCreateType("video")} />
                  </div>
                  <button
                    type="button"
                    onClick={() => selectCreateType("advert")}
                    className="kt-pressable mt-3 flex w-full items-center gap-3 rounded-[22px] border-2 border-amber-300 bg-amber-50/80 p-4 text-left shadow-sm shadow-amber-900/[0.05] hover:border-amber-400 hover:bg-amber-50"
                  >
                    <span className="grid h-11 w-11 place-items-center rounded-2xl bg-white text-amber-700 ring-1 ring-amber-100">
                      <Megaphone size={20} strokeWidth={2.3} absoluteStrokeWidth />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-base font-black text-slate-950">Advertisement</span>
                      <span className="mt-0.5 block text-xs font-bold leading-5 text-slate-500">Promote an offer, job vacancy, event, service, or location.</span>
                    </span>
                  </button>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}

// Bold, accent-coloured borders distinguish each post type at a glance. The
// border colours are 300-weight so they stay visible on both the light cards
// and the dark-mode surfaces the appearance layer swaps in.
const createItemAccent = {
  emerald: { chip: "bg-emerald-50 text-emerald-700 ring-emerald-100", frame: "border-emerald-300 hover:border-emerald-400" },
  rose: { chip: "bg-rose-50 text-rose-700 ring-rose-100", frame: "border-rose-300 hover:border-rose-400" },
  sky: { chip: "bg-sky-50 text-sky-700 ring-sky-100", frame: "border-sky-300 hover:border-sky-400" },
  violet: { chip: "bg-violet-50 text-violet-700 ring-violet-100", frame: "border-violet-300 hover:border-violet-400" },
};

function CreateMenuItem({ accent = "sky", icon, label, onClick }) {
  const Icon = icon;
  const accentStyles = createItemAccent[accent] || createItemAccent.sky;

  return (
    <button
      type="button"
      onClick={onClick}
      className={`kt-create-popup-item kt-pressable flex min-h-24 w-full flex-col items-start justify-between rounded-[22px] border-2 bg-white p-4 text-left shadow-sm shadow-slate-950/[0.04] hover:bg-slate-50 ${accentStyles.frame}`}
    >
      <span className={`grid h-11 w-11 place-items-center rounded-2xl ring-1 ${accentStyles.chip}`}>
        {Icon ? <Icon size={20} strokeWidth={2.3} absoluteStrokeWidth /> : null}
      </span>
      <span className="text-base font-black text-slate-950">{label}</span>
    </button>
  );
}
