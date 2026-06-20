import {
  HiArrowPathRoundedSquare,
  HiOutlineBookmark,
  HiOutlineChartBar,
  HiOutlineEyeSlash,
  HiOutlineFlag,
  HiOutlineLink,
  HiOutlinePencilSquare,
  HiOutlineShare,
  HiOutlineTrash,
  HiOutlineUserMinus,
} from "react-icons/hi2";
import ExploreActionDrawer from "../../../../shared/ExploreActionDrawer";

export default function PostOptionsMenu({ closing, followed, isOwner, onClose, onCopy, onDelete, onEdit, onFollow, onHide, onReport, onRepost, onSave, onShare, onViewActivity, saved }) {
  const ownerActions = [
    { label: "Edit post", icon: HiOutlinePencilSquare, action: onEdit },
    { label: saved ? "Remove saved" : "Save post", icon: HiOutlineBookmark, action: onSave, active: saved },
    { label: "Repost", icon: HiArrowPathRoundedSquare, action: onRepost },
    { label: "Share", icon: HiOutlineShare, action: onShare },
    { label: "Delete post", icon: HiOutlineTrash, action: onDelete, danger: true },
    { label: "Copy link", icon: HiOutlineLink, action: onCopy },
    { label: "View activity", icon: HiOutlineChartBar, action: onViewActivity },
  ];
  const viewerActions = [
    { label: saved ? "Remove saved" : "Save post", icon: HiOutlineBookmark, action: onSave, active: saved },
    { label: "Repost", icon: HiArrowPathRoundedSquare, action: onRepost },
    { label: "Share", icon: HiOutlineShare, action: onShare },
    { label: "Copy link", icon: HiOutlineLink, action: onCopy },
    ...(followed ? [{ label: "Unfollow account", icon: HiOutlineUserMinus, action: onFollow }] : []),
    { label: "Hide post", icon: HiOutlineEyeSlash, action: onHide },
    { label: "Report post", icon: HiOutlineFlag, action: onReport, danger: true },
  ];

  return (
    <ExploreActionDrawer closing={closing} onClose={onClose} title="Post actions">
      <div className="space-y-1">
      {(isOwner ? ownerActions : viewerActions).map((item) => {
        const Icon = item.icon;
        return (
          <button
            key={item.label}
            type="button"
            onClick={item.action}
            className={`flex w-full min-w-0 items-center gap-3 rounded-[18px] px-3 py-3 text-sm font-black transition ${
              item.danger ? "bg-rose-500/10 text-rose-700 hover:bg-rose-500/15" : item.active ? "bg-sky-500/10 text-sky-800 hover:bg-sky-500/15" : "text-slate-800 hover:bg-white/55"
            }`}
          >
            <span className={`grid h-10 w-10 flex-none place-items-center rounded-2xl ${item.danger ? "bg-rose-500/10" : "bg-white/60"}`}>
              <Icon className="text-lg" />
            </span>
            <span className="truncate">{item.label}</span>
          </button>
        );
      })}
      </div>
    </ExploreActionDrawer>
  );
}
