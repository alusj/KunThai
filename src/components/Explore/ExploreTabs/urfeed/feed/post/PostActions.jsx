import {
  HiOutlineBookmark,
  HiOutlineChatBubbleOvalLeft,
  HiOutlineHandThumbUp,
  HiOutlineShare,
} from "react-icons/hi2";

function ActionButton({ active, children, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex h-11 min-w-0 flex-1 items-center justify-center gap-2 rounded-2xl text-sm font-bold transition ${
        active ? "bg-sky-50 text-sky-700" : "text-slate-600 hover:bg-slate-50 hover:text-slate-950"
      }`}
    >
      {children}
    </button>
  );
}

export default function PostActions({ post, liked, saved, onLike, onComment, onSave, onShare }) {
  return (
    <div className="grid grid-cols-4 gap-1 border-t border-slate-100 px-2 py-2">
      <ActionButton active={liked} onClick={onLike}>
        <HiOutlineHandThumbUp className="text-lg" />
        <span>{post.likes_count ?? 0}</span>
      </ActionButton>
      <ActionButton onClick={onComment}>
        <HiOutlineChatBubbleOvalLeft className="text-lg" />
        <span>{post.comments_count ?? 0}</span>
      </ActionButton>
      <ActionButton active={saved} onClick={onSave}>
        <HiOutlineBookmark className="text-lg" />
        <span className="hidden sm:inline">{saved ? "Saved" : "Save"}</span>
      </ActionButton>
      <ActionButton onClick={onShare}>
        <HiOutlineShare className="text-lg" />
        <span className="hidden sm:inline">Share</span>
      </ActionButton>
    </div>
  );
}
