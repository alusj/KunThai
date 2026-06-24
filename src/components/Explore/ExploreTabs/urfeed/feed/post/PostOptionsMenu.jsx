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

export default function PostOptionsMenu({
  closing,
  followed,
  isOwner,
  onClose,
  onCopy,
  onDelete,
  onEdit,
  onFollow,
  onHide,
  onReport,
  onRepost,
  onSave,
  onShare,
  onViewActivity,
  saved,
}) {
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
    ...(followed
      ? [{ label: "Unfollow account", icon: HiOutlineUserMinus, action: onFollow }]
      : []),
    { label: "Hide post", icon: HiOutlineEyeSlash, action: onHide },
    { label: "Report post", icon: HiOutlineFlag, action: onReport, danger: true },
  ];

  return (
    <ExploreActionDrawer
      closing={closing}
      onClose={onClose}
      title="Post actions"
    >
      <div className="flex flex-col items-end gap-2">
        {(isOwner ? ownerActions : viewerActions).map((item) => {
          const Icon = item.icon;

          return (
            <button
              key={item.label}
              type="button"
              onClick={item.action}
              className={`flex w-fit min-w-[230px] items-center gap-3 rounded-[22px] px-4 py-3.5 pr-8 text-sm font-black shadow-lg backdrop-blur-xl transition ${
                item.danger
                  ? "bg-rose-100/95 text-rose-700 hover:bg-rose-100"
                  : item.active
                  ? "bg-sky-100/95 text-sky-800 hover:bg-sky-100"
                  : "bg-white/95 text-slate-800 hover:bg-white"
              }`}
            >
              <span
                className={`grid h-11 w-11 flex-none place-items-center rounded-2xl ${
                  item.danger
                    ? "bg-rose-200/60"
                    : item.active
                    ? "bg-sky-200/60"
                    : "bg-slate-100"
                }`}
              >
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