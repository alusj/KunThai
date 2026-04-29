import {
  HiOutlineBookmark,
  HiOutlineChartBar,
  HiOutlineEyeSlash,
  HiOutlineFlag,
  HiOutlineLink,
  HiOutlinePencilSquare,
  HiOutlineShare,
  HiOutlineTrash,
} from "react-icons/hi2";

export default function PostOptionsMenu({ isOwner, saved, onCopy, onDelete, onEdit, onHide, onReport, onSave, onShare, onViewActivity }) {
  const ownerActions = [
    { label: "Edit post", icon: HiOutlinePencilSquare, action: onEdit },
    { label: "Delete post", icon: HiOutlineTrash, action: onDelete, danger: true },
    { label: "Copy link", icon: HiOutlineLink, action: onCopy },
    { label: "View activity", icon: HiOutlineChartBar, action: onViewActivity },
  ];
  const viewerActions = [
    { label: saved ? "Remove saved" : "Save post", icon: HiOutlineBookmark, action: onSave, active: saved },
    { label: "Share", icon: HiOutlineShare, action: onShare },
    { label: "Copy link", icon: HiOutlineLink, action: onCopy },
    { label: "Hide post", icon: HiOutlineEyeSlash, action: onHide },
    { label: "Report post", icon: HiOutlineFlag, action: onReport, danger: true },
  ];

  return (
    <div className="absolute right-3 top-14 z-10 w-56 max-w-[calc(100vw-2rem)] rounded-[18px] border border-slate-200 bg-white p-2 text-left shadow-xl sm:right-4">
      {(isOwner ? ownerActions : viewerActions).map((item) => {
        const Icon = item.icon;
        return (
          <button
            key={item.label}
            type="button"
            onClick={item.action}
            className={`flex w-full min-w-0 items-center gap-2 rounded-[14px] px-3 py-2 text-sm font-bold transition hover:bg-slate-100 ${
              item.danger ? "text-rose-600" : item.active ? "text-sky-700" : "text-slate-700"
            }`}
          >
            <Icon className="flex-none text-lg" />
            <span className="truncate">{item.label}</span>
          </button>
        );
      })}
    </div>
  );
}
