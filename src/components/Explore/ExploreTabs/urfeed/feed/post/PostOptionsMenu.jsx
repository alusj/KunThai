import {
  HiArrowPathRoundedSquare,
  HiOutlineBookmark,
  HiOutlineChartBar,
  HiOutlineEyeSlash,
  HiOutlineFlag,
  HiOutlineInformationCircle,
  HiOutlineLink,
  HiOutlinePencilSquare,
  HiOutlineShare,
  HiOutlineSpeakerXMark,
  HiOutlineTrash,
  HiOutlineUserMinus,
} from "react-icons/hi2";
import ExploreActionDrawer from "../../../../shared/ExploreActionDrawer";

export default function PostOptionsMenu({
  closing,
  followed,
  advertPost = false,
  isOwner,
  onClose,
  onCopy,
  onDelete,
  onEdit,
  onFollow,
  onHide,
  onMuteAdvertiser,
  onReport,
  onRepost,
  onSave,
  onShare,
  onViewActivity,
  onWhyAdvert,
  saved,
}) {
  const ownerActions = [
    { label: advertPost ? "Edit advert message" : "Edit post", icon: HiOutlinePencilSquare, action: onEdit },
    { label: saved ? "Remove saved" : advertPost ? "Save advert" : "Save post", icon: HiOutlineBookmark, action: onSave, active: saved },
    ...(!advertPost ? [{ label: "Repost", icon: HiArrowPathRoundedSquare, action: onRepost }] : []),
    { label: "Share", icon: HiOutlineShare, action: onShare },
    { label: "Copy link", icon: HiOutlineLink, action: onCopy },
    { label: advertPost ? "View advert activity" : "View activity", icon: HiOutlineChartBar, action: onViewActivity },
    { label: advertPost ? "Delete advertisement" : "Delete post", icon: HiOutlineTrash, action: onDelete, danger: true },
  ];

  const viewerActions = [
    { label: saved ? "Remove saved" : advertPost ? "Save advert" : "Save post", icon: HiOutlineBookmark, action: onSave, active: saved },
    ...(!advertPost ? [{ label: "Repost", icon: HiArrowPathRoundedSquare, action: onRepost }] : []),
    { label: "Share", icon: HiOutlineShare, action: onShare },
    { label: "Copy link", icon: HiOutlineLink, action: onCopy },
    ...(followed ? [{ label: "Remove connection", icon: HiOutlineUserMinus, action: onFollow }] : []),
    ...(advertPost ? [
      { label: "Why am I seeing this?", icon: HiOutlineInformationCircle, action: onWhyAdvert },
      { label: "Hide advertisement", icon: HiOutlineEyeSlash, action: onHide },
      { label: "Mute this advertiser", icon: HiOutlineSpeakerXMark, action: onMuteAdvertiser },
      { label: "Report advertisement", icon: HiOutlineFlag, action: onReport, danger: true },
    ] : [
      { label: "Hide post", icon: HiOutlineEyeSlash, action: onHide },
      { label: "Report post", icon: HiOutlineFlag, action: onReport, danger: true },
    ]),
  ];

  return (
    <ExploreActionDrawer closing={closing} onClose={onClose} title={advertPost ? "Advertisement actions" : "Post actions"}>
      <div className="inline-flex flex-col overflow-hidden rounded-[26px] border border-white/70 bg-white/90 p-2 shadow-[0_24px_70px_rgba(15,23,42,0.28)] backdrop-blur-2xl">
        {(isOwner ? ownerActions : viewerActions).map((item) => {
          const Icon = item.icon;

          return (
            <button
              key={item.label}
              type="button"
              onClick={item.action}
              className={`flex w-fit min-w-[210px] items-center gap-3 rounded-[18px] px-3 py-3 text-left text-sm font-black transition ${
                item.danger
                  ? "bg-rose-500/10 text-rose-700 hover:bg-rose-500/15"
                  : item.active
                  ? "bg-sky-500/10 text-sky-800 hover:bg-sky-500/15"
                  : "text-slate-800 hover:bg-slate-100/80"
              }`}
            >
              <span
                className={`grid h-10 w-10 flex-none place-items-center rounded-2xl ${
                  item.danger ? "bg-rose-500/10" : "bg-slate-100"
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
