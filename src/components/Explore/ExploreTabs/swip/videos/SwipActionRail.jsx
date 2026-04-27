import {
  HiOutlineBookmark,
  HiOutlineChatBubbleOvalLeft,
  HiOutlineHandThumbUp,
  HiOutlineShare,
  HiOutlineTrash,
} from "react-icons/hi2";

function RailButton({ active, children, label, onClick, danger = false }) {
  return (
    <button type="button" onClick={onClick} className="flex flex-col items-center gap-1 text-white">
      <span
        className={`flex h-11 w-11 items-center justify-center rounded-full text-xl shadow-lg backdrop-blur ${
          danger
            ? "bg-rose-500/90"
            : active
              ? "bg-sky-500/95"
              : "bg-slate-950/45 hover:bg-slate-950/70"
        }`}
      >
        {children}
      </span>
      <span className="max-w-14 truncate text-[11px] font-black drop-shadow">{label}</span>
    </button>
  );
}

export default function SwipActionRail({ post, liked, saved, isOwner, onComment, onDelete, onLike, onSave, onShare }) {
  return (
    <div className="absolute bottom-24 right-3 z-10 flex flex-col items-center gap-3 sm:right-5">
      <RailButton active={liked} label={post.likes_count ?? 0} onClick={onLike}>
        <HiOutlineHandThumbUp />
      </RailButton>
      <RailButton label={post.comments_count ?? 0} onClick={onComment}>
        <HiOutlineChatBubbleOvalLeft />
      </RailButton>
      <RailButton active={saved} label={saved ? "Saved" : post.saves_count ?? 0} onClick={onSave}>
        <HiOutlineBookmark />
      </RailButton>
      <RailButton label="Share" onClick={onShare}>
        <HiOutlineShare />
      </RailButton>
      {isOwner ? (
        <RailButton danger label="Delete" onClick={onDelete}>
          <HiOutlineTrash />
        </RailButton>
      ) : null}
    </div>
  );
}
