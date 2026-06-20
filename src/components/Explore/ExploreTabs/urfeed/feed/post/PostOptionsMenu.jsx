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
    <ExploreActionDrawer closing={closing} eyebrow="UrFeed" onClose={onClose} title="Post actions">
      <div className="space-y-2">
      {(isOwner ? ownerActions : viewerActions).map((item) => {
        const Icon = item.icon;
        return (
          <button
            key={item.label}
            type="button"
            onClick={item.action}
            className={`flex w-full min-w-0 items-center gap-3 rounded-[18px] border px-3 py-3 text-sm font-black transition hover:bg-slate-100 ${
              item.danger ? "border-rose-100 bg-rose-50 text-rose-600" : item.active ? "border-sky-100 bg-sky-50 text-sky-700" : "border-slate-200 bg-white text-slate-700"
            }`}
          >
            <span className="grid h-10 w-10 flex-none place-items-center rounded-2xl border border-slate-200 bg-white shadow-sm">
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
