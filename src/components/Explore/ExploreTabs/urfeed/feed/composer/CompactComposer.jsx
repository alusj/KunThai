import { HiOutlineMicrophone, HiOutlinePaperAirplane, HiOutlinePhoto, HiOutlineSparkles } from "react-icons/hi2";

import Avatar from "../../../../shared/Avatar";

export default function CompactComposer({ profile, creating, onOpen, onQuickMedia, onQuickVoice, onSubmit }) {
  return (
    <div className="mt-4 w-full min-w-0 px-3 sm:px-5 lg:px-8">
      <div className="flex w-full min-w-0 items-center gap-2 rounded-[20px] border border-slate-200 bg-white p-2.5 shadow-sm sm:p-3">
        <div className="flex-none">
          <Avatar name={profile?.displayName || "KunThai"} src={profile?.avatarUrl} size="sm" />
        </div>

        <button
          type="button"
          onClick={() => onOpen?.("text")}
          className="h-10 min-w-0 flex-1 truncate rounded-2xl bg-slate-50 px-3 text-left text-sm font-medium text-slate-400 transition hover:bg-slate-100 sm:h-11 sm:px-4"
        >
          What's happening in your world?
        </button>

        <div className="flex flex-none items-center gap-1.5 sm:gap-2">
          <button
            type="button"
            onClick={() => onQuickMedia?.("image")}
            className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-100 text-lg text-slate-500 transition hover:bg-slate-200 sm:h-10 sm:w-10"
            aria-label="Add image"
          >
            <HiOutlinePhoto />
          </button>
          <button
            type="button"
            onClick={onQuickVoice}
            className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-100 text-lg text-slate-500 transition hover:bg-slate-200 sm:h-10 sm:w-10"
            aria-label="Record voice note"
          >
            <HiOutlineMicrophone />
          </button>
          <button
            type="button"
            onClick={onSubmit}
            disabled={creating}
            className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-slate-950 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-60 sm:h-10 sm:w-10"
            aria-label={creating ? "Posting" : "Post"}
          >
            <HiOutlinePaperAirplane />
          </button>
        </div>
      </div>
      <button
        type="button"
        onClick={() => onOpen?.("advert")}
        className="mx-auto mt-2 flex w-fit max-w-full items-center gap-2 rounded-full border border-amber-100 bg-white/90 px-4 py-2 text-xs font-black uppercase tracking-[0.14em] text-amber-700 shadow-sm transition hover:border-amber-200 hover:bg-amber-50"
      >
        <HiOutlineSparkles className="text-base" />
        Post an advert
      </button>
    </div>
  );
}
