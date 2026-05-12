import {
  HiOutlineBookmark,
  HiOutlineChatBubbleOvalLeft,
  HiOutlineArrowsPointingOut,
  HiOutlineArrowsPointingIn,
  HiOutlineHandThumbUp,
  HiOutlineShare,
  HiOutlineTrash,
} from "react-icons/hi2";

function RailButton({ active, children, label, title, onClick, danger = false }) {
  function handleClick(event) {
    event.stopPropagation();
    onClick?.(event);
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      className={`group flex w-12 flex-col items-center gap-0.5 text-white ${danger ? "text-rose-100" : ""}`}
      aria-label={title || String(label || "Swip action")}
      title={title}
    >
      <span
        className={`flex h-9 w-9 items-center justify-center rounded-full text-[19px] transition ${
          danger
            ? "text-rose-200 group-hover:bg-rose-500/25"
            : active
              ? "bg-white text-rose-500"
              : "text-white/92 group-hover:bg-white/12"
        }`}
      >
        {children}
      </span>
      {label !== undefined && label !== "" ? (
        <span className="max-w-12 truncate text-[10px] font-black leading-none text-white/90 drop-shadow">{label}</span>
      ) : null}
    </button>
  );
}

export default function SwipActionRail({
  fullscreen = false,
  post,
  liked,
  saved,
  isOwner,
  onComment,
  onDelete,
  onFullscreen,
  onLike,
  onSave,
  onShare,
}) {
  return (
    <div
      className={`absolute right-3 z-20 flex flex-col items-center gap-1.5 rounded-full border border-white/14 bg-slate-950/24 px-1.5 py-2 shadow-2xl backdrop-blur-md sm:right-5 ${
        fullscreen ? "bottom-6" : "bottom-28"
      }`}
    >
      <RailButton active={liked} label={post.likes_count ?? 0} title="Like" onClick={onLike}>
        <HiOutlineHandThumbUp />
      </RailButton>
      <RailButton label={post.comments_count ?? 0} title="Comments" onClick={onComment}>
        <HiOutlineChatBubbleOvalLeft />
      </RailButton>
      <RailButton active={saved} label={post.saves_count ?? 0} title={saved ? "Saved" : "Save"} onClick={onSave}>
        <HiOutlineBookmark />
      </RailButton>
      <RailButton label="" title="Share" onClick={onShare}>
        <HiOutlineShare />
      </RailButton>
      <RailButton label="" title={fullscreen ? "Exit full screen" : "Full screen"} onClick={onFullscreen}>
        {fullscreen ? <HiOutlineArrowsPointingIn /> : <HiOutlineArrowsPointingOut />}
      </RailButton>
      {isOwner ? (
        <RailButton danger label="" title="Delete video" onClick={onDelete}>
          <HiOutlineTrash />
        </RailButton>
      ) : null}
    </div>
  );
}
