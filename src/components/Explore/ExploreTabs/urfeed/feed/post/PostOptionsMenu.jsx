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
import { useI18n } from "../../../../../../i18n";

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
  const { t } = useI18n();
  const ownerActions = [
    { label: advertPost ? t("post.editAdvert") : t("post.editPost"), icon: HiOutlinePencilSquare, action: onEdit },
    { label: saved ? t("post.removeSaved") : advertPost ? t("post.saveAdvert") : t("post.savePost"), icon: HiOutlineBookmark, action: onSave, active: saved },
    ...(!advertPost ? [{ label: t("post.repost"), icon: HiArrowPathRoundedSquare, action: onRepost }] : []),
    { label: t("post.share"), icon: HiOutlineShare, action: onShare },
    { label: t("post.copyLink"), icon: HiOutlineLink, action: onCopy },
    { label: advertPost ? t("post.viewAdvertActivity") : t("post.viewActivity"), icon: HiOutlineChartBar, action: onViewActivity },
    { label: advertPost ? t("post.deleteAdvert") : t("post.deletePost"), icon: HiOutlineTrash, action: onDelete, danger: true },
  ];

  const viewerActions = [
    { label: saved ? t("post.removeSaved") : advertPost ? t("post.saveAdvert") : t("post.savePost"), icon: HiOutlineBookmark, action: onSave, active: saved },
    ...(!advertPost ? [{ label: t("post.repost"), icon: HiArrowPathRoundedSquare, action: onRepost }] : []),
    { label: t("post.share"), icon: HiOutlineShare, action: onShare },
    { label: t("post.copyLink"), icon: HiOutlineLink, action: onCopy },
    ...(followed ? [{ label: t("post.removeConnection"), icon: HiOutlineUserMinus, action: onFollow }] : []),
    ...(advertPost ? [
      { label: t("post.whySeeing"), icon: HiOutlineInformationCircle, action: onWhyAdvert },
      { label: t("post.hideAdvert"), icon: HiOutlineEyeSlash, action: onHide },
      { label: t("post.muteAdvertiser"), icon: HiOutlineSpeakerXMark, action: onMuteAdvertiser },
      { label: t("post.reportAdvert"), icon: HiOutlineFlag, action: onReport, danger: true },
    ] : [
      { label: t("post.hidePost"), icon: HiOutlineEyeSlash, action: onHide },
      { label: t("post.reportPost"), icon: HiOutlineFlag, action: onReport, danger: true },
    ]),
  ];

  return (
    <ExploreActionDrawer closing={closing} onClose={onClose} title={advertPost ? t("post.advertActions") : t("post.postActions")}>
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
