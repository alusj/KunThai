import { useEffect, useState } from "react";
import {
  HiOutlineBookmark,
  HiOutlineChatBubbleOvalLeft,
  HiOutlineArrowsPointingOut,
  HiOutlineArrowsPointingIn,
  HiOutlineHandThumbUp,
  HiOutlineShare,
  HiOutlineTrash,
} from "react-icons/hi2";

function RailButton({ active, children, label, title, onClick, danger = false, emphasis = "tap" }) {
  const [tapped, setTapped] = useState(false);

  useEffect(() => {
    if (!tapped) {
      return undefined;
    }

    const timer = window.setTimeout(() => setTapped(false), emphasis === "like" ? 260 : 150);
    return () => window.clearTimeout(timer);
  }, [emphasis, tapped]);

  function handleClick(event) {
    event.stopPropagation();
    setTapped(true);
    onClick?.(event);
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      onPointerDown={(event) => event.stopPropagation()}
      className={`kt-pressable group flex w-12 flex-col items-center gap-0.5 text-white ${danger ? "text-rose-100" : ""}`}
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
        style={{
          transform: tapped ? "scale(0.94)" : "scale(1)",
          transition: "transform 140ms ease, background-color 160ms ease, color 160ms ease",
        }}
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
  onMore,
  onSave,
  onShare,
}) {
  return (
    <div
      className="absolute bottom-28 right-3 z-20 flex flex-col items-center gap-1.5 rounded-full border border-white/14 bg-slate-950/24 px-1.5 py-2 shadow-2xl backdrop-blur-md sm:right-5"
    >
      <RailButton active={liked} emphasis="like" label={post.likes_count ?? 0} title="Like" onClick={onLike}>
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
      <RailButton label="" title="More Swip actions" onClick={onMore}>
        <span className="text-2xl font-black leading-none">...</span>
      </RailButton>
    </div>
  );
}
