// =====================================
// MessageButton.jsx
// Messages shortcut button
// =====================================

import { HiOutlineChatBubbleLeftRight } from "react-icons/hi2";

export default function MessageButton({ active = false, activity = "", count = 0, onClick }) {
  const title = activity
    ? activity === "recording"
      ? "Someone is recording a voice note"
      : "Someone is typing"
    : active
      ? "Messages active now"
      : "Messages";

  return (
    <button
      type="button"
      onClick={onClick}
      className="relative inline-flex h-10 w-10 items-center justify-center rounded-xl bg-slate-50 text-xl text-slate-700 transition hover:bg-slate-100 hover:text-slate-950"
      aria-label="Messages"
      title={title}
    >
      <HiOutlineChatBubbleLeftRight />
      {active ? <span className="absolute bottom-1.5 right-1.5 h-2.5 w-2.5 rounded-full border-2 border-white bg-emerald-500" /> : null}
      {count > 0 ? (
        <span className="absolute -right-1 -top-1 min-w-5 rounded-full bg-sky-600 px-1.5 py-0.5 text-[10px] font-bold leading-none text-white">
          {count > 9 ? "9+" : count}
        </span>
      ) : null}
      {activity ? (
        <span className="absolute left-8 top-8 h-2 w-2 animate-ping rounded-full bg-sky-500" />
      ) : null}
    </button>
  );
}
