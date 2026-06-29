import { Megaphone } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { HiOutlineMicrophone, HiOutlinePaperAirplane, HiOutlinePhoto, HiOutlinePlus, HiOutlineVideoCamera } from "react-icons/hi2";

import Avatar from "../../../../shared/Avatar";

export default function CompactComposer({ profile, creating, onOpen, onQuickMedia, onQuickVoice, onSubmit }) {
  const [createMenuOpen, setCreateMenuOpen] = useState(false);
  const menuRef = useRef(null);

  useEffect(() => {
    if (!createMenuOpen) return undefined;
    function closeMenu(event) {
      if (!menuRef.current?.contains(event.target)) setCreateMenuOpen(false);
    }
    document.addEventListener("pointerdown", closeMenu);
    return () => document.removeEventListener("pointerdown", closeMenu);
  }, [createMenuOpen]);

  function runAction(action) {
    setCreateMenuOpen(false);
    action();
  }

  return (
    <div className="mt-4 w-full min-w-0 px-3 sm:px-5 lg:px-8">
      <div className="relative flex w-full min-w-0 items-center gap-2 rounded-[20px] border border-slate-200 bg-white p-2.5 shadow-sm sm:p-3">
        <div className="flex-none"><Avatar name={profile?.displayName || "KunThai"} src={profile?.avatarUrl} size="sm" /></div>
        <button type="button" onClick={() => onOpen?.("text")} className="h-10 min-w-0 flex-1 truncate rounded-2xl bg-slate-50 px-3 text-left text-sm font-medium text-slate-400 transition hover:bg-slate-100 sm:h-11 sm:px-4">
          What's happening in your world?
        </button>

        <div ref={menuRef} className="relative flex flex-none items-center gap-1.5 sm:gap-2">
          <button
            type="button"
            onClick={() => setCreateMenuOpen((current) => !current)}
            className="flex h-9 w-9 items-center justify-center rounded-xl bg-sky-50 text-lg text-sky-700 transition hover:bg-sky-100 sm:h-10 sm:w-10"
            aria-label="Open post options"
            aria-expanded={createMenuOpen}
            aria-haspopup="menu"
          >
            <HiOutlinePlus />
          </button>
          {createMenuOpen ? (
            <div role="menu" className="absolute right-0 top-[calc(100%+0.65rem)] z-30 w-56 rounded-[22px] border border-slate-200 bg-white p-2 shadow-2xl shadow-slate-950/15">
              <QuickAction icon={HiOutlinePhoto} label="Add image" onClick={() => runAction(() => onQuickMedia?.("image"))} />
              <QuickAction icon={HiOutlineVideoCamera} label="Add video" onClick={() => runAction(() => onQuickMedia?.("video"))} />
              <QuickAction icon={HiOutlineMicrophone} label="Record voice" onClick={() => runAction(() => onQuickVoice?.())} />
              <QuickAction icon={Megaphone} label="Advertisement" tone="amber" onClick={() => runAction(() => onOpen?.("advert"))} />
            </div>
          ) : null}
          <button type="button" onClick={onSubmit} disabled={creating} className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-slate-950 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-60 sm:h-10 sm:w-10" aria-label={creating ? "Posting" : "Post"}>
            <HiOutlinePaperAirplane />
          </button>
        </div>
      </div>
    </div>
  );
}

function QuickAction({ icon: Icon, label, onClick, tone = "sky" }) {
  return (
    <button type="button" role="menuitem" onClick={onClick} className="flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left text-sm font-black text-slate-700 hover:bg-slate-50">
      <span className={`grid h-9 w-9 place-items-center rounded-xl ${tone === "amber" ? "bg-amber-50 text-amber-700" : "bg-sky-50 text-sky-700"}`}><Icon size={18} /></span>
      {label}
    </button>
  );
}
