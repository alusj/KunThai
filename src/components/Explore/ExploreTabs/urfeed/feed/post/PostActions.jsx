import { createElement } from "react";
import {
  HiOutlineChatBubbleOvalLeft,
  HiOutlineHandThumbUp,
  HiOutlineShare,
} from "react-icons/hi2";

import { useI18n } from "../../../../../../i18n";
import { postInteractionRules } from "../../../../../../Backend/services/explore/postControls";
import { uiText as translateUi, useI18n as useUiLocale } from "../../../../../../i18n/index.js";

function ActionButton({ active, icon, label, meta, onClick }) {
  useUiLocale();
  function handleClick(event) {
    event.preventDefault();
    event.stopPropagation();
    onClick?.(event);
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      onPointerDown={(event) => event.stopPropagation()}
      className={`kt-pressable flex h-12 min-w-0 flex-1 touch-manipulation items-center justify-center gap-1.5 rounded-2xl text-[13px] font-black sm:text-sm ${
        active ? "bg-sky-50 text-sky-700" : "text-slate-600 hover:bg-slate-50 hover:text-slate-950"
      }`}
    >
      {createElement(icon, { className: "text-lg" })}
      <span className="truncate">{translateUi(label)}</span>
      {meta !== undefined ? <span className="text-[11px] text-slate-400">{meta}</span> : null}
    </button>
  );
}

export default function PostActions({ post, liked, isOwner = false, onLike, onComment, onShare }) {
  const { t } = useI18n();
  // Advanced Post Controls: likes off removes the button; hidden counts show
  // only to the owner. The database enforces both.
  const rules = postInteractionRules(post, { isOwner, followsAuthor: true });
  return (
    <div className={`grid ${rules.canLike ? "grid-cols-3" : "grid-cols-2"} gap-1 border-t border-slate-100 px-2 py-2`}>
      {rules.canLike ? (
        <ActionButton active={liked} icon={HiOutlineHandThumbUp} label={t("post.like")} meta={rules.showLikeCount ? post.likes_count ?? 0 : undefined} onClick={onLike} />
      ) : null}
      <ActionButton icon={HiOutlineChatBubbleOvalLeft} label={t("post.comments")} meta={rules.showCommentCount ? post.comments_count ?? 0 : undefined} onClick={onComment} />
      <ActionButton icon={HiOutlineShare} label={t("post.share")} onClick={onShare} />
    </div>
  );
}
