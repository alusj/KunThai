import { createElement } from "react";
import {
  HiOutlineBookmark,
  HiOutlineChatBubbleOvalLeft,
  HiOutlineHandThumbUp,
  HiOutlineShare,
} from "react-icons/hi2";

function ActionButton({ active, icon, label, meta, onClick }) {
  function handleClick(event) {
    event.preventDefault();
    event.stopPropagation();
    onClick?.(event);
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      onPointerDown={(event) => event.stopPropagation()}
      className={`kt-pressable flex h-12 min-w-0 flex-1 touch-manipulation items-center justify-center gap-1.5 rounded-2xl text-[13px] font-black sm:text-sm ${
        active ? "bg-sky-50 text-sky-700" : "text-slate-600 hover:bg-slate-50 hover:text-slate-950"
      }`}
    >
      {createElement(icon, { className: "text-lg" })}
      <span className="truncate">{label}</span>
      {meta !== undefined ? <span className="text-[11px] text-slate-400">{meta}</span> : null}
    </button>
  );
}

export default function PostActions({ post, liked, saved, onLike, onComment, onSave, onShare }) {
  return (
    <div className="grid grid-cols-4 gap-1 border-t border-slate-100 px-2 py-2">
      <ActionButton active={liked} icon={HiOutlineHandThumbUp} label="Like" meta={post.likes_count ?? 0} onClick={onLike} />
      <ActionButton icon={HiOutlineChatBubbleOvalLeft} label="Comment" meta={post.comments_count ?? 0} onClick={onComment} />
      <ActionButton active={saved} icon={HiOutlineBookmark} label="Save" meta={post.saves_count ?? 0} onClick={onSave} />
      <ActionButton icon={HiOutlineShare} label="Share" onClick={onShare} />
    </div>
  );
}
