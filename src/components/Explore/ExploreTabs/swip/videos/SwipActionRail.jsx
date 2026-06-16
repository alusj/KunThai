import { useEffect, useState } from "react";
import {
  HiOutlineBookmark,
  HiOutlineChatBubbleOvalLeft,
  HiOutlineArrowsPointingOut,
  HiOutlineArrowsPointingIn,
  HiOutlineHandThumbUp,
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
      className={`kt-pressable group flex w-9 flex-col items-center gap-0.5 text-white xs:w-10 ${danger ? "text-rose-100" : ""}`}
      aria-label={title || String(label || "Swip action")}
      title={title}
    >
      <span
        className={`flex h-8 w-8 items-center justify-center rounded-full text-[17px] transition xs:h-9 xs:w-9 xs:text-[18px] ${
          danger
            ? "text-rose-200 group-hover:text-rose-100"
            : active
              ? "text-rose-200"
              : "text-white/92 group-hover:text-white"
        }`}
        style={{
          transform: tapped ? "scale(0.94)" : "scale(1)",
          transition: "transform 140ms ease, background-color 160ms ease, color 160ms ease",
        }}
      >
        {children}
      </span>
      {label !== undefined && label !== "" ? (
        <span className="max-w-9 truncate text-[9px] font-black leading-none text-white/90 drop-shadow xs:max-w-10 xs:text-[10px]">{label}</span>
      ) : null}
    </button>
  );
}

export default function SwipActionRail({
  fullscreen = false,
  post,
  liked,
  saved,
  onComment,
  onFullscreen,
  onLike,
  onMore,
  onSave,
}) {
  return (
    <div
      className="absolute bottom-28 right-2 z-20 flex flex-col items-center gap-1 rounded-full border border-white/18 bg-black/18 px-1 py-1.5 shadow-xl backdrop-blur-sm xs:right-3 xs:gap-1.5 xs:px-1.5 xs:py-2 sm:right-5"
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
      <RailButton label="" title={fullscreen ? "Exit full screen" : "Full screen"} onClick={onFullscreen}>
        {fullscreen ? <HiOutlineArrowsPointingIn /> : <HiOutlineArrowsPointingOut />}
      </RailButton>
      <RailButton label="" title="More Swip actions" onClick={onMore}>
        <span className="text-xl font-black leading-none xs:text-2xl">...</span>
      </RailButton>
    </div>
  );
}
