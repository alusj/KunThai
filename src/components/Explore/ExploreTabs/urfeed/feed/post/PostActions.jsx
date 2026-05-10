import {
  HiOutlineChatBubbleOvalLeft,
  HiOutlineHandThumbUp,
  HiOutlineShare,
} from "react-icons/hi2";

function ActionButton({ active, icon: Icon, label, meta, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex h-12 min-w-0 flex-1 items-center justify-center gap-1.5 rounded-2xl text-[12px] font-semibold transition sm:text-sm ${
        active ? "bg-sky-50 text-sky-700" : "text-slate-600 hover:bg-slate-50 hover:text-slate-950"
      }`}
    >
      <Icon className="text-lg" />
      <span className="truncate">{label}</span>
      {meta !== undefined ? <span className="text-[11px] text-slate-400">{meta}</span> : null}
    </button>
  );
}

export default function PostActions({ post, liked, onLike, onComment, onShare }) {
  return (
    <div className="grid grid-cols-3 gap-1 border-t border-slate-100 px-2 py-2">
      <ActionButton active={liked} icon={HiOutlineHandThumbUp} label="Like" meta={post.likes_count ?? 0} onClick={onLike} />
      <ActionButton icon={HiOutlineChatBubbleOvalLeft} label="Comment" meta={post.comments_count ?? 0} onClick={onComment} />
      <ActionButton icon={HiOutlineShare} label="Share" onClick={onShare} />
    </div>
  );
}
