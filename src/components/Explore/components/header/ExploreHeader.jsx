import { useState } from "react";
import {
  HiOutlineMicrophone,
  HiOutlinePencilSquare,
  HiOutlinePhoto,
  HiOutlinePlayCircle,
} from "react-icons/hi2";

import { useExploreNotifications } from "../../../../Backend/hooks/useExploreNotifications";
import HeaderMenu from "./HeaderMenu";
import MenuButton from "./MenuButton";
import MessageButton from "./MessageButton";
import SearchButton from "./SearchButton";
import CreateButton from "./CreateButton";
import AlertButton from "./AlertButton";
import SearchOverlay from "./search/SearchOverlay";

export default function ExploreHeader({ onAlertsClick, onNavigate, onCreateSelect, onSearchResult }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const { notifications, unreadCount } = useExploreNotifications();
  const latestMessage = notifications[0]?.message || "";

  function selectCreateType(type) {
    setCreateOpen(false);
    onCreateSelect?.(type);
  }

  return (
    <>
      <header className="w-full max-w-full overflow-x-clip border-b border-slate-200 bg-white/95 backdrop-blur">
        <SearchOverlay open={searchOpen} onClose={() => setSearchOpen(false)} onOpenResult={onSearchResult} />
        <div className="grid h-16 w-full max-w-full grid-cols-[1fr_auto_1fr] items-center gap-2 px-3 sm:px-5">
          <div className="flex min-w-0 items-center gap-1.5 sm:gap-2">
            <MenuButton onClick={() => setMenuOpen(true)} />
            <MessageButton onClick={() => onNavigate?.("Messages")} />
          </div>

          <div className="min-w-0 text-center leading-none">
            <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-sky-700 sm:text-[11px]">KunThai</p>
            <h1 className="mt-1 text-[14px] font-semibold text-slate-900 sm:text-[15px]">Explore</h1>
          </div>

          <div className="flex min-w-0 items-center justify-end gap-1.5 sm:gap-2">
            <SearchButton onClick={() => setSearchOpen(true)} />
            <div className="relative">
              <CreateButton onClick={() => setCreateOpen((current) => !current)} />
              {createOpen ? (
                <div className="absolute right-0 top-12 z-40 w-44 rounded-[18px] border border-slate-200 bg-white p-2 text-left shadow-xl">
                  <button
                    type="button"
                    onClick={() => selectCreateType("text")}
                    className="flex w-full items-center gap-2 rounded-[14px] px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
                  >
                    <HiOutlinePencilSquare className="text-lg" />
                    Text post
                  </button>
                  <button
                    type="button"
                    onClick={() => selectCreateType("image")}
                    className="flex w-full items-center gap-2 rounded-[14px] px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
                  >
                    <HiOutlinePhoto className="text-lg" />
                    Image
                  </button>
                  <button
                    type="button"
                    onClick={() => selectCreateType("voice")}
                    className="flex w-full items-center gap-2 rounded-[14px] px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
                  >
                    <HiOutlineMicrophone className="text-lg" />
                    Voice post
                  </button>
                  <button
                    type="button"
                    onClick={() => selectCreateType("video")}
                    className="flex w-full items-center gap-2 rounded-[14px] px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
                  >
                    <HiOutlinePlayCircle className="text-lg" />
                    Video
                  </button>
                </div>
              ) : null}
            </div>
            <AlertButton onClick={onAlertsClick} count={unreadCount} latestMessage={latestMessage} />
          </div>
        </div>
        {latestMessage ? (
          <div className="border-t border-slate-100 bg-sky-50 px-3 py-2 text-xs font-medium text-slate-700 sm:px-5">
            {latestMessage}
          </div>
        ) : null}
      </header>

      <HeaderMenu open={menuOpen} onClose={() => setMenuOpen(false)} onNavigate={onNavigate} />
    </>
  );
}
