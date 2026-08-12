import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AtSign, Hash, MapPin, Megaphone } from "lucide-react";

import { useBrowserBack } from "../../../../../../Backend/hooks/useBrowserBack";
import {
  createExploreNotification,
  getExploreAdvertReason,
  recordExploreAdvertEvent,
  recordRecommendationSignal,
} from "../../../../../../Backend/services/exploreService";
import CommentsDrawer from "../comments/CommentsDrawer";
import PostActions from "../post/PostActions";
import PostHeader from "../post/PostHeader";
import PostMedia from "../post/PostMedia";
import PostOptionsMenu from "../post/PostOptionsMenu";
import { copyPostLink, sharePost } from "../post/postUtils";
import AdvertMetaActions from "../../../../shared/AdvertMetaActions";
import { openMentionContent } from "../../../../../../Backend/services/explore/linkTokenService";
import ExpandablePostText from "../../../../shared/ExpandablePostText";
import TextPostCanvas, { isTextCanvasPost } from "../../../../shared/TextPostCanvas";
import { useI18n } from "../../../../../../i18n";
import {
  formatAdvertType,
  getAdvertMeta,
  getAdvertPhoneHref,
  getPostTitle,
  isAdvertPost,
  normalizeAdvertUrl,
} from "../../../../shared/advertUtils";
import RepostComposer from "../../../../shared/RepostComposer";
import PostAnalyticsPanel from "../../../../shared/PostAnalyticsPanel";
import RepostPreview from "../../../../shared/RepostPreview";
import { contentHasModerationFlags } from "../../../../../../Backend/services/explore/safetyService";
import { readExploreSettings } from "../../../../../../Backend/services/explore/preferencesService";

// `value` is the canonical English category stored/submitted to the safety
// backend; `key` resolves the translated label shown to the reader.
const REPORT_CATEGORIES = [
  { value: "Content violation", key: "contentViolation" },
  { value: "Spam or scam", key: "spamScam" },
  { value: "Harassment or bullying", key: "harassment" },
  { value: "Hate speech", key: "hate" },
  { value: "Violence or dangerous acts", key: "violence" },
  { value: "Nudity or sexual content", key: "nudity" },
  { value: "False information", key: "falseInfo" },
  { value: "Intellectual property", key: "ip" },
  { value: "Something else", key: "other" },
];

export default function FeedPost({
  post,
  currentUserId = "",
  liked = false,
  saved = false,
  isOwner = false,
  onLike,
  onSave,
  onCommentCountChange,
  onEdit,
  onDelete,
  onHide,
  onMuteAdvertiser,
  onReport,
  onViewProfile,
  followed = false,
  onFollow,
  profile,
}) {
  const { t } = useI18n();
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [optionsClosing, setOptionsClosing] = useState(false);
  const [repostOpen, setRepostOpen] = useState(false);
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editValue, setEditValue] = useState(post.body || "");
  const [menuMessage, setMenuMessage] = useState("");
  const [reportOpen, setReportOpen] = useState(false);
  const [reportCategory, setReportCategory] = useState(REPORT_CATEGORIES[0].value);
  const [reportReason, setReportReason] = useState("");
  const [whyAdvertOpen, setWhyAdvertOpen] = useState(false);
  const [sensitiveRevealed, setSensitiveRevealed] = useState(false);
  const [analyticsOpen, setAnalyticsOpen] = useState(false);
  const optionsTimerRef = useRef(null);
  // "Warnings" in Settings → Feed: flagged wording hides the post content
  // behind a warning until the reader chooses to view it.
  const sensitiveGateActive =
    !isOwner &&
    !sensitiveRevealed &&
    readExploreSettings().feed.showSensitiveWarnings !== false &&
    contentHasModerationFlags(post.body || "").length > 0;
  const advert = getAdvertMeta(post);
  const advertPost = isAdvertPost(post);
  const postTitle = getPostTitle(post);
  const postLocation = post.media_meta?.location || post.mediaMeta?.location || null;
  const hashtags = Array.from(new Set([
    ...(Array.isArray(post.hashtags) ? post.hashtags : []),
    ...((String(post.body || "").match(/#[a-z0-9_]+/gi) || []).map((tag) => tag.slice(1))),
  ].filter(Boolean).map((tag) => String(tag).replace(/^#/, "").toLowerCase())));
  const mentions = Array.from(new Set([
    ...(Array.isArray(post.mentions) ? post.mentions : []),
    ...((String(post.body || "").match(/@[a-z0-9_]+/gi) || []).map((mention) => mention.slice(1))),
  ].filter(Boolean).map((mention) => String(mention).replace(/^@/, "").toLowerCase())));

  useBrowserBack(commentsOpen, () => setCommentsOpen(false), `comments-${post.id}`);
  useBrowserBack(optionsOpen, () => closeOptions(), `post-options-${post.id}`);

  useEffect(() => () => window.clearTimeout(optionsTimerRef.current), []);

  useEffect(() => {
    function handleOpenPostComments(event) {
      if (String(event.detail?.postId || "") !== String(post.id)) return;
      setCommentsOpen(true);
    }

    window.addEventListener("explore-open-post-comments", handleOpenPostComments);
    return () => window.removeEventListener("explore-open-post-comments", handleOpenPostComments);
  }, [post.id]);

  async function runAction(action) {
    closeOptions();

    try {
      const message = await action?.();
      if (message) {
        setMenuMessage(message);
      }
    } catch {
      setMenuMessage(t("explore.actionFailed"));
    }
  }

  async function shareAndNotify() {
    const message = await sharePost(post);
    recordRecommendationSignal(post, "share", { surface: "urfeed" }).catch(() => false);
    if (advertPost) recordExploreAdvertEvent(post, "share", { surface: "urfeed" }).catch(() => false);
    if (post.user_id && post.user_id !== currentUserId) {
      await createExploreNotification({
        user_id: post.user_id,
        type: "share",
        post_id: post.id,
        post_preview: post.body,
        media_type: post.video_url ? "video post" : post.image_url ? "photo post" : "post",
      });
    }
    return message;
  }

  async function submitEdit(event) {
    event.preventDefault();
    await runAction(() => onEdit?.(editValue));
    setEditOpen(false);
  }

  async function submitReport(event) {
    event.preventDefault();
    const details = reportReason.trim();
    const composedReason = details ? `${reportCategory} — ${details}` : reportCategory;
    await runAction(() => onReport?.(composedReason));
    setReportReason("");
    setReportCategory(REPORT_CATEGORIES[0].value);
    setReportOpen(false);
  }

  async function confirmDelete() {
    setDeleteOpen(false);
    // Let the wipe animation play before the post leaves the list.
    setDeleting(true);
    await new Promise((resolve) => window.setTimeout(resolve, 380));
    await runAction(onDelete);
    setDeleting(false);
  }

  async function followAndTrack() {
    const result = await onFollow?.();
    if (advertPost && result === "Connected") {
      recordExploreAdvertEvent(post, "follow", { surface: "urfeed" }).catch(() => false);
    }
    return result;
  }

  function viewProfileAndTrack() {
    if (advertPost) recordExploreAdvertEvent(post, "profile_visit", { surface: "urfeed" }).catch(() => false);
    onViewProfile?.();
  }

  function closeOptions(afterClose) {
    if (!optionsOpen || optionsClosing) return;
    setOptionsClosing(true);
    window.clearTimeout(optionsTimerRef.current);
    optionsTimerRef.current = window.setTimeout(() => {
      setOptionsOpen(false);
      setOptionsClosing(false);
      afterClose?.();
    }, 280);
  }

  function toggleOptions() {
    if (optionsOpen) {
      closeOptions();
      return;
    }
    setOptionsClosing(false);
    setOptionsOpen(true);
  }

  function openExploreSearch(query) {
    window.dispatchEvent(new CustomEvent("explore-search-query", { detail: { query } }));
  }

  function openPostLocation() {
    if (!postLocation) return;
    window.dispatchEvent(new CustomEvent("kuntai-open-area-view", {
      detail: {
        action: "explorePostLocationView",
        autoRoute: false,
        destination: {
          id: `explore-post-${post.id}-location`,
          name: postLocation.label || postLocation.address || "Post location",
          label: postLocation.label || postLocation.address || "Post location",
          address: postLocation.address || postLocation.label || "Explore post location",
          lat: postLocation.lat,
          lng: postLocation.lng,
          type: "post-location",
          status: "public",
        },
        // Transport's area-view back handler matches "explore-" prefixed
        // returnTo values; this is what routes the user back to the feed.
        returnTo: "explore-post",
        source: "explore-post",
      },
    }));
  }

  return (
    <article
      id={`post-${post.id}`}
      className={`kt-toast-expand-in relative w-full max-w-full min-w-0 overflow-hidden rounded-[24px] border border-slate-200 bg-white shadow-sm transition-shadow duration-200 hover:shadow-md ${deleting ? "kt-post-wipe-out" : ""}`}
    >
      <PostHeader
        post={post}
        isOwner={isOwner}
        followed={followed}
        onFollow={() => runAction(followAndTrack)}
        onOptions={toggleOptions}
        onViewProfile={viewProfileAndTrack}
      />

      {optionsOpen ? (
        <div>
          <PostOptionsMenu
            closing={optionsClosing}
            advertPost={advertPost}
            followed={followed}
            isOwner={isOwner}
            saved={saved}
            onCopy={() => runAction(() => copyPostLink(post.id))}
            onClose={() => closeOptions()}
            onDelete={() => closeOptions(() => setDeleteOpen(true))}
            onEdit={() => closeOptions(() => {
              setEditValue(post.body || "");
              setEditOpen(true);
            })}
            onFollow={() => runAction(followAndTrack)}
            onHide={() => runAction(onHide)}
            onMuteAdvertiser={() => runAction(onMuteAdvertiser)}
            onReport={() => closeOptions(() => setReportOpen(true))}
            onRepost={() => closeOptions(() => setRepostOpen(true))}
            onSave={() => runAction(onSave)}
            onShare={() => runAction(shareAndNotify)}
            onViewActivity={() => closeOptions(() => setAnalyticsOpen(true))}
            onWhyAdvert={() => closeOptions(() => setWhyAdvertOpen(true))}
          />
        </div>
      ) : null}

      {sensitiveGateActive ? (
        <div className="px-4 pb-4">
          <div className="rounded-[22px] border border-amber-200 bg-amber-50 p-4">
            <p className="text-sm font-black text-amber-900">{t("post.sensitiveContent")}</p>
            <p className="mt-1 text-xs font-semibold leading-5 text-amber-800">
              {t("post.sensitiveDesc")}
            </p>
            <button
              type="button"
              onClick={() => setSensitiveRevealed(true)}
              className="kt-pressable mt-3 h-10 rounded-2xl bg-amber-600 px-4 text-xs font-black text-white transition hover:bg-amber-700"
            >
              {t("post.viewPost")}
            </button>
          </div>
        </div>
      ) : advertPost ? (
        <AdvertPostCard
          post={post}
          advert={advert || {}}
          followed={followed}
          onFollow={() => runAction(followAndTrack)}
          onViewProfile={viewProfileAndTrack}
        />
      ) : postTitle || post.body ? (
        isTextCanvasPost(post, postTitle) ? (
          <div className="pb-1 pt-1">
            <TextPostCanvas post={post} title={postTitle} />
          </div>
        ) : (
          <div className="px-4 pb-4">
            {postTitle ? <h3 className="kuntai-break text-lg font-black leading-6 text-slate-950">{postTitle}</h3> : null}
            {post.body ? (
              <ExpandablePostText
                text={post.body}
                className={`${postTitle ? "mt-2" : ""} text-base font-semibold leading-7`}
                textClassName="text-slate-900"
                controlClassName="text-sky-700"
              />
            ) : null}
          </div>
        )
      ) : null}

      {!sensitiveGateActive && !advertPost && (hashtags.length || mentions.length || postLocation) ? (
        <div className="flex flex-wrap gap-2 px-4 pb-4">
          {hashtags.map((tag) => (
            <button
              key={`tag-${tag}`}
              type="button"
              onClick={() => openExploreSearch(`#${tag}`)}
              className="kt-pressable inline-flex h-9 items-center gap-1.5 rounded-2xl bg-sky-50 px-3 text-xs font-black text-sky-700"
            >
              <Hash size={14} strokeWidth={2.5} />
              {tag}
            </button>
          ))}
          {mentions.map((mention) => (
            <button
              key={`mention-${mention}`}
              type="button"
              onClick={() => openMentionContent(mention)}
              className="kt-pressable inline-flex h-9 items-center gap-1.5 rounded-2xl bg-violet-50 px-3 text-xs font-black text-violet-700"
            >
              <AtSign size={14} strokeWidth={2.5} />
              {mention}
            </button>
          ))}
          {postLocation ? (
            <button
              type="button"
              onClick={openPostLocation}
              className="kt-pressable inline-flex min-h-9 max-w-full items-center gap-1.5 rounded-2xl bg-emerald-50 px-3 text-left text-xs font-black text-emerald-700"
            >
              <MapPin size={14} strokeWidth={2.5} className="flex-none" />
              <span className="truncate">{postLocation.label || postLocation.address || "Post location"}</span>
            </button>
          ) : null}
        </div>
      ) : null}

      {!sensitiveGateActive ? <RepostPreview post={post} /> : null}

      {!sensitiveGateActive ? <PostMedia post={post} imageOnly={advertPost} /> : null}

      <PostActions
        post={post}
        liked={liked}
        onLike={onLike}
        onComment={() => setCommentsOpen((current) => !current)}
        onShare={() => runAction(shareAndNotify)}
      />

      <CommentsDrawer
        currentUserId={currentUserId}
        open={commentsOpen}
        post={post}
        onClose={() => setCommentsOpen(false)}
        onCountChange={onCommentCountChange}
        onViewProfile={onViewProfile}
      />

      {menuMessage ? <p className="px-4 pb-3 text-xs font-bold text-sky-700">{menuMessage}</p> : null}
      <PostActionOverlay open={editOpen} onClose={() => setEditOpen(false)} label={t("post.editPost")}>
          <form className="w-full" onSubmit={submitEdit}>
            <p className="text-xs font-black uppercase tracking-[0.16em] text-sky-700">{t("post.editPost")}</p>
            <textarea
              value={editValue}
              onChange={(event) => setEditValue(event.target.value)}
              rows={4}
              className="mt-3 w-full resize-none rounded-2xl bg-slate-100 px-4 py-3 text-sm font-bold leading-6 text-slate-800 outline-none"
            />
            <div className="mt-3 grid grid-cols-2 gap-2">
              <button type="button" onClick={() => setEditOpen(false)} className="h-11 rounded-2xl bg-slate-100 text-sm font-black text-slate-700">
                {t("post.cancel")}
              </button>
              <button type="submit" className="h-11 rounded-2xl bg-slate-950 text-sm font-black text-white">
                {t("post.save")}
              </button>
            </div>
          </form>
      </PostActionOverlay>
      <PostActionOverlay open={reportOpen} onClose={() => setReportOpen(false)} label={advertPost ? t("post.reportAdvert") : t("post.reportPost")}>
          <form className="w-full" onSubmit={submitReport}>
            <p className="text-xs font-black uppercase tracking-[0.16em] text-rose-600">{advertPost ? t("post.reportAdvert") : t("post.reportPost")}</p>
            <h3 className="mt-1 text-lg font-black text-slate-950">{t("post.reportReasonQuestion")}</h3>
            <label className="mt-3 block">
              <span className="mb-2 block text-xs font-black uppercase tracking-[0.14em] text-slate-500">{t("post.reason")}</span>
              <select
                value={reportCategory}
                onChange={(event) => setReportCategory(event.target.value)}
                className="h-12 w-full rounded-2xl bg-slate-100 px-4 text-sm font-black text-slate-800 outline-none"
              >
                {REPORT_CATEGORIES.map((category) => (
                  <option key={category.value} value={category.value}>{t(`post.reportCat.${category.key}`)}</option>
                ))}
              </select>
            </label>
            <textarea
              value={reportReason}
              onChange={(event) => setReportReason(event.target.value)}
              placeholder={t("post.reportPlaceholder")}
              rows={3}
              className="mt-3 w-full resize-none rounded-2xl bg-slate-100 px-4 py-3 text-sm font-bold leading-6 text-slate-800 outline-none"
            />
            <p className="mt-2 text-xs font-semibold leading-5 text-slate-500">
              {t("post.reportConfidential")}
            </p>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <button type="button" onClick={() => setReportOpen(false)} className="h-11 rounded-2xl bg-slate-100 text-sm font-black text-slate-700">
                {t("post.cancel")}
              </button>
              <button type="submit" className="h-11 rounded-2xl bg-rose-600 text-sm font-black text-white disabled:opacity-50">
                {t("post.submitReport")}
              </button>
            </div>
          </form>
      </PostActionOverlay>
      <PostActionOverlay open={deleteOpen} onClose={() => setDeleteOpen(false)} label={t("post.deletePost")}>
          <div className="w-full">
            <p className="text-xs font-black uppercase tracking-[0.16em] text-rose-600">{t("post.deletePost")}</p>
            <h3 className="mt-1 text-lg font-black text-slate-950">{t("post.removePostTitle")}</h3>
            <p className="mt-2 text-sm font-semibold leading-6 text-slate-600">{t("post.removePostBody")}</p>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <button type="button" onClick={() => setDeleteOpen(false)} className="h-11 rounded-2xl bg-slate-100 text-sm font-black text-slate-700">
                {t("post.cancel")}
              </button>
              <button type="button" onClick={confirmDelete} className="h-11 rounded-2xl bg-rose-600 text-sm font-black text-white">
                {t("post.delete")}
              </button>
            </div>
          </div>
      </PostActionOverlay>
      <PostActionOverlay open={whyAdvertOpen} onClose={() => setWhyAdvertOpen(false)} label={t("post.whySponsored")}>
          <section className="w-full">
            <p className="text-xs font-black uppercase tracking-[0.16em] text-sky-700">{t("post.whySponsored")}</p>
            <h3 className="mt-1 text-lg font-black text-slate-950">{t("post.sponsoredReason")}</h3>
            <p className="mt-2 text-sm font-semibold leading-6 text-slate-600">{getExploreAdvertReason(post)}</p>
            <p className="mt-3 rounded-2xl bg-slate-50 px-3 py-2 text-xs font-bold leading-5 text-slate-500">{t("post.whyAdvertPrivacy")}</p>
            <button type="button" onClick={() => setWhyAdvertOpen(false)} className="mt-4 h-11 w-full rounded-2xl bg-slate-950 text-sm font-black text-white">{t("post.gotIt")}</button>
          </section>
      </PostActionOverlay>
      {repostOpen ? (
        <RepostComposer
          profile={profile}
          sourcePost={post}
          onClose={() => setRepostOpen(false)}
          onSuccess={() => setMenuMessage(t("post.repostPublished"))}
        />
      ) : null}
      {analyticsOpen ? <PostAnalyticsPanel post={post} onClose={() => setAnalyticsOpen(false)} /> : null}
    </article>
  );
}

function AdvertPostCard({ post, advert, followed = false, onFollow, onViewProfile }) {
  const { t } = useI18n();
  const url = normalizeAdvertUrl(advert.link);
  const phoneHref = getAdvertPhoneHref(advert.phone);
  const actionHref = advert.ctaLabel === "Call or message" && phoneHref ? phoneHref : url;
  const opensWebsite = Boolean(url && actionHref === url);
  const title = advert.title || t("explore.advertisement");
  const profileAction = advert.ctaLabel === "View profile";
  const followAction = advert.ctaLabel === "Follow" || advert.ctaLabel === "Connect";

  return (
    <section className="mx-4 mb-4 rounded-[24px] border border-amber-200 bg-gradient-to-br from-amber-50 via-white to-white p-4 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <span className="grid h-10 w-10 flex-none place-items-center rounded-2xl bg-white text-amber-700 shadow-sm ring-1 ring-amber-100">
            <Megaphone size={18} strokeWidth={2.4} absoluteStrokeWidth />
          </span>
          <p className="text-[11px] font-black uppercase tracking-[0.18em] text-amber-700">{t("post.sponsored")}</p>
        </div>
        <span className="rounded-full bg-white px-3 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-slate-500 ring-1 ring-slate-100">
          {formatAdvertType(advert.type)}
        </span>
      </div>

      <h3 className="mt-3 kuntai-break text-xl font-black leading-7 text-slate-950">{title}</h3>
      {post.body ? (
        <ExpandablePostText
          text={post.body}
          className="mt-2 text-sm font-semibold leading-6"
          textClassName="text-slate-700"
          controlClassName="text-amber-700"
        />
      ) : null}

      <AdvertMetaActions post={post} advert={advert} className="mt-3" />

      {actionHref ? (
        <a
          href={actionHref}
          target={opensWebsite ? "_blank" : undefined}
          rel={opensWebsite ? "noreferrer" : undefined}
          onClick={() => recordExploreAdvertEvent(post, "click", { surface: "urfeed" }).catch(() => false)}
          className="kt-pressable mt-3 flex h-11 w-full items-center justify-center rounded-2xl bg-slate-950 px-4 text-sm font-black text-white"
        >
          {advert.ctaLabel || t("explore.learnMore")}
        </a>
      ) : null}
      {!actionHref && profileAction ? (
        <button type="button" onClick={onViewProfile} className="kt-pressable mt-3 flex h-11 w-full items-center justify-center rounded-2xl bg-slate-950 px-4 text-sm font-black text-white">
          View profile
        </button>
      ) : null}
      {!actionHref && followAction ? (
        <button type="button" onClick={onFollow} className="kt-pressable mt-3 flex h-11 w-full items-center justify-center rounded-2xl bg-slate-950 px-4 text-sm font-black text-white">
          {followed ? t("explore.connected") : t("explore.connect")}
        </button>
      ) : null}
    </section>
  );
}

function PostActionOverlay({ children, label, onClose, open }) {
  if (!open) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[1100] flex h-dvh w-full items-end justify-center overflow-hidden overscroll-none bg-slate-950/20 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-4 backdrop-blur-md [contain:strict] sm:items-center"
      onClick={onClose}
      role="presentation"
    >
      <section
        aria-label={label}
        aria-modal="true"
        role="dialog"
        className="kt-modal-enter max-h-[min(78dvh,680px)] w-full max-w-lg transform-gpu overflow-y-auto overscroll-contain rounded-[26px] bg-white p-4 shadow-2xl ring-1 ring-slate-200/70 [backface-visibility:hidden]"
        onClick={(event) => event.stopPropagation()}
      >
        {children}
      </section>
    </div>,
    document.body,
  );
}
