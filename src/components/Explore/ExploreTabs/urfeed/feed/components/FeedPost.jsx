import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AtSign, Hash, MapPin, Megaphone } from "lucide-react";

import { useBrowserBack } from "../../../../../../Backend/hooks/useBrowserBack";
import useBodyScrollLock from "../../../../../shared/useBodyScrollLock";
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

const REPORT_CATEGORIES = [
  "Content violation",
  "Spam or scam",
  "Harassment or bullying",
  "Hate speech",
  "Violence or dangerous acts",
  "Nudity or sexual content",
  "False information",
  "Intellectual property",
  "Something else",
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
  const [reportCategory, setReportCategory] = useState(REPORT_CATEGORIES[0]);
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
      setMenuMessage("Action could not be completed");
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
    setReportCategory(REPORT_CATEGORIES[0]);
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
      className={`kt-toast-expand-in relative w-full max-w-full min-w-0 rounded-[24px] border border-slate-200 bg-white shadow-sm transition-shadow duration-200 hover:shadow-md ${
        optionsOpen ? "z-40 overflow-visible" : "overflow-hidden"
      } ${deleting ? "kt-post-wipe-out" : ""}`}
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
            <p className="text-sm font-black text-amber-900">This post may contain sensitive content</p>
            <p className="mt-1 text-xs font-semibold leading-5 text-amber-800">
              KunThai flagged wording in this post. You can view it anyway or keep scrolling.
              Warnings can be turned off in Settings.
            </p>
            <button
              type="button"
              onClick={() => setSensitiveRevealed(true)}
              className="kt-pressable mt-3 h-10 rounded-2xl bg-amber-600 px-4 text-xs font-black text-white transition hover:bg-amber-700"
            >
              View post
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
      <PostActionOverlay open={editOpen} onClose={() => setEditOpen(false)} label="Edit post">
          <form className="w-full" onSubmit={submitEdit}>
            <p className="text-xs font-black uppercase tracking-[0.16em] text-sky-700">Edit post</p>
            <textarea
              value={editValue}
              onChange={(event) => setEditValue(event.target.value)}
              rows={4}
              className="mt-3 w-full resize-none rounded-2xl bg-slate-100 px-4 py-3 text-sm font-bold leading-6 text-slate-800 outline-none"
            />
            <div className="mt-3 grid grid-cols-2 gap-2">
              <button type="button" onClick={() => setEditOpen(false)} className="h-11 rounded-2xl bg-slate-100 text-sm font-black text-slate-700">
                Cancel
              </button>
              <button type="submit" className="h-11 rounded-2xl bg-slate-950 text-sm font-black text-white">
                Save
              </button>
            </div>
          </form>
      </PostActionOverlay>
      <PostActionOverlay open={reportOpen} onClose={() => setReportOpen(false)} label={advertPost ? "Report advertisement" : "Report post"}>
          <form className="w-full" onSubmit={submitReport}>
            <p className="text-xs font-black uppercase tracking-[0.16em] text-rose-600">{advertPost ? "Report advertisement" : "Report post"}</p>
            <h3 className="mt-1 text-lg font-black text-slate-950">Why are you reporting this?</h3>
            <label className="mt-3 block">
              <span className="mb-2 block text-xs font-black uppercase tracking-[0.14em] text-slate-500">Reason</span>
              <select
                value={reportCategory}
                onChange={(event) => setReportCategory(event.target.value)}
                className="h-12 w-full rounded-2xl bg-slate-100 px-4 text-sm font-black text-slate-800 outline-none"
              >
                {REPORT_CATEGORIES.map((category) => (
                  <option key={category} value={category}>{category}</option>
                ))}
              </select>
            </label>
            <textarea
              value={reportReason}
              onChange={(event) => setReportReason(event.target.value)}
              placeholder="Add details that help our safety team review this faster (optional)."
              rows={3}
              className="mt-3 w-full resize-none rounded-2xl bg-slate-100 px-4 py-3 text-sm font-bold leading-6 text-slate-800 outline-none"
            />
            <p className="mt-2 text-xs font-semibold leading-5 text-slate-500">
              Your report is confidential and goes straight to the KunThai safety team for review.
            </p>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <button type="button" onClick={() => setReportOpen(false)} className="h-11 rounded-2xl bg-slate-100 text-sm font-black text-slate-700">
                Cancel
              </button>
              <button type="submit" className="h-11 rounded-2xl bg-rose-600 text-sm font-black text-white disabled:opacity-50">
                Submit report
              </button>
            </div>
          </form>
      </PostActionOverlay>
      <PostActionOverlay open={deleteOpen} onClose={() => setDeleteOpen(false)} label="Delete post">
          <div className="w-full">
            <p className="text-xs font-black uppercase tracking-[0.16em] text-rose-600">Delete post</p>
            <h3 className="mt-1 text-lg font-black text-slate-950">Remove this post?</h3>
            <p className="mt-2 text-sm font-semibold leading-6 text-slate-600">This removes it from Explore and your profile.</p>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <button type="button" onClick={() => setDeleteOpen(false)} className="h-11 rounded-2xl bg-slate-100 text-sm font-black text-slate-700">
                Cancel
              </button>
              <button type="button" onClick={confirmDelete} className="h-11 rounded-2xl bg-rose-600 text-sm font-black text-white">
                Delete
              </button>
            </div>
          </div>
      </PostActionOverlay>
      <PostActionOverlay open={whyAdvertOpen} onClose={() => setWhyAdvertOpen(false)} label="Why this sponsored item">
          <section className="w-full">
            <p className="text-xs font-black uppercase tracking-[0.16em] text-sky-700">Why this sponsored item?</p>
            <h3 className="mt-1 text-lg font-black text-slate-950">Chosen for your Explore experience</h3>
            <p className="mt-2 text-sm font-semibold leading-6 text-slate-600">{getExploreAdvertReason(post)}</p>
            <p className="mt-3 rounded-2xl bg-slate-50 px-3 py-2 text-xs font-bold leading-5 text-slate-500">KunThai uses on-platform interests and activity. Contacts and precise location are not used. Nearby matching requires your permission.</p>
            <button type="button" onClick={() => setWhyAdvertOpen(false)} className="mt-4 h-11 w-full rounded-2xl bg-slate-950 text-sm font-black text-white">Got it</button>
          </section>
      </PostActionOverlay>
      {repostOpen ? (
        <RepostComposer
          profile={profile}
          sourcePost={post}
          onClose={() => setRepostOpen(false)}
          onSuccess={() => setMenuMessage("Repost published to UrFeed.")}
        />
      ) : null}
      {analyticsOpen ? <PostAnalyticsPanel post={post} onClose={() => setAnalyticsOpen(false)} /> : null}
    </article>
  );
}

function AdvertPostCard({ post, advert, followed = false, onFollow, onViewProfile }) {
  const url = normalizeAdvertUrl(advert.link);
  const phoneHref = getAdvertPhoneHref(advert.phone);
  const actionHref = advert.ctaLabel === "Call or message" && phoneHref ? phoneHref : url;
  const opensWebsite = Boolean(url && actionHref === url);
  const title = advert.title || "Advertisement";
  const profileAction = advert.ctaLabel === "View profile";
  const followAction = advert.ctaLabel === "Follow" || advert.ctaLabel === "Connect";

  return (
    <section className="mx-4 mb-4 rounded-[24px] border border-amber-200 bg-gradient-to-br from-amber-50 via-white to-white p-4 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <span className="grid h-10 w-10 flex-none place-items-center rounded-2xl bg-white text-amber-700 shadow-sm ring-1 ring-amber-100">
            <Megaphone size={18} strokeWidth={2.4} absoluteStrokeWidth />
          </span>
          <p className="text-[11px] font-black uppercase tracking-[0.18em] text-amber-700">Sponsored</p>
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
          {advert.ctaLabel || "Learn more"}
        </a>
      ) : null}
      {!actionHref && profileAction ? (
        <button type="button" onClick={onViewProfile} className="kt-pressable mt-3 flex h-11 w-full items-center justify-center rounded-2xl bg-slate-950 px-4 text-sm font-black text-white">
          View profile
        </button>
      ) : null}
      {!actionHref && followAction ? (
        <button type="button" onClick={onFollow} className="kt-pressable mt-3 flex h-11 w-full items-center justify-center rounded-2xl bg-slate-950 px-4 text-sm font-black text-white">
          {followed ? "Connected" : "Connect"}
        </button>
      ) : null}
    </section>
  );
}

function PostActionOverlay({ children, label, onClose, open }) {
  useBodyScrollLock(open);

  if (!open) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[1100] flex items-end justify-center bg-slate-950/20 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-4 backdrop-blur-md sm:items-center"
      onClick={onClose}
      role="presentation"
    >
      <section
        aria-label={label}
        aria-modal="true"
        role="dialog"
        className="kt-modal-enter max-h-[min(78dvh,680px)] w-full max-w-lg overflow-y-auto rounded-[26px] bg-white p-4 shadow-2xl ring-1 ring-slate-200/70"
        onClick={(event) => event.stopPropagation()}
      >
        {children}
      </section>
    </div>,
    document.body,
  );
}
