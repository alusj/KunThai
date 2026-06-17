import { useEffect, useRef, useState } from "react";
import { CalendarClock, ExternalLink, MapPin, Megaphone, Navigation } from "lucide-react";

import { useBrowserBack } from "../../../../../../Backend/hooks/useBrowserBack";
import { createExploreNotification } from "../../../../../../Backend/services/exploreService";
import CommentsDrawer from "../comments/CommentsDrawer";
import PostActions from "../post/PostActions";
import PostHeader from "../post/PostHeader";
import PostMedia from "../post/PostMedia";
import PostOptionsMenu from "../post/PostOptionsMenu";
import { copyPostLink, sharePost } from "../post/postUtils";

function getAdvertMeta(post = {}) {
  const mediaMeta = post.media_meta || post.mediaMeta || {};
  return mediaMeta?.advert && typeof mediaMeta.advert === "object" ? mediaMeta.advert : null;
}

function isAdvertPost(post = {}) {
  return post.post_type === "advert" || post.category === "advert" || Boolean(getAdvertMeta(post));
}

function normalizeAdvertUrl(value = "") {
  const text = String(value || "").trim();
  if (!text) return "";
  if (/^https?:\/\//i.test(text)) return text;
  return `https://${text}`;
}

function formatAdvertSchedule(advert = {}) {
  if (!advert.date && !advert.time) return "";
  if (!advert.date) return advert.time;
  const date = new Date(`${advert.date}T${advert.time || "00:00"}`);
  if (Number.isNaN(date.getTime())) return [advert.date, advert.time].filter(Boolean).join(" ");
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    ...(advert.time ? { hour: "numeric", minute: "2-digit" } : {}),
  });
}

function openAdvertAreaView(post, advert = {}) {
  const lat = Number(advert.lat);
  const lng = Number(advert.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;

  window.dispatchEvent(
    new CustomEvent("kuntai-open-area-view", {
      detail: {
        autoRoute: true,
        destination: {
          id: `advert-location-${post.id || Date.now()}`,
          name: advert.title || post.body || "Advert location",
          label: advert.title || "Advert location",
          address: advert.address || "Shared from Explore advert",
          type: "advert-location",
          status: "advert",
          lat,
          lng,
        },
        returnTo: "explore-advert",
        source: "explore-advert-location",
      },
    }),
  );
}

export default function FeedPost({
  post,
  animationIndex = 0,
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
  onReport,
  onViewActivity,
  onViewProfile,
  followed = false,
  onFollow,
}) {
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editValue, setEditValue] = useState(post.body || "");
  const [menuMessage, setMenuMessage] = useState("");
  const [reportOpen, setReportOpen] = useState(false);
  const [reportReason, setReportReason] = useState("");
  const optionsRef = useRef(null);
  const advert = getAdvertMeta(post);
  const advertPost = isAdvertPost(post);

  useBrowserBack(commentsOpen, () => setCommentsOpen(false), `comments-${post.id}`);

  useEffect(() => {
    function handleOpenPostComments(event) {
      if (String(event.detail?.postId || "") !== String(post.id)) return;
      setCommentsOpen(true);
    }

    window.addEventListener("explore-open-post-comments", handleOpenPostComments);
    return () => window.removeEventListener("explore-open-post-comments", handleOpenPostComments);
  }, [post.id]);

  useEffect(() => {
    if (!optionsOpen) {
      return undefined;
    }

    function handlePointerDown(event) {
      if (event.target?.closest?.(`[data-post-options-toggle="${post.id}"]`)) {
        return;
      }

      if (optionsRef.current?.contains(event.target)) {
        return;
      }

      setOptionsOpen(false);
    }

    function handleKeyDown(event) {
      if (event.key === "Escape") {
        setOptionsOpen(false);
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [optionsOpen, post.id]);

  async function runAction(action) {
    setOptionsOpen(false);

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
    await runAction(() => onReport?.(reportReason));
    setReportReason("");
    setReportOpen(false);
  }

  async function confirmDelete() {
    await runAction(onDelete);
    setDeleteOpen(false);
  }

  return (
    <article
      id={`post-${post.id}`}
      style={{ "--kt-feed-card-delay": `${Math.min(Number(animationIndex || 0), 6) * 45}ms` }}
      className={`kt-feed-card-in relative w-full max-w-full min-w-0 rounded-[24px] border border-slate-200 bg-white shadow-sm transition-shadow duration-200 hover:shadow-md ${
        optionsOpen ? "z-40 overflow-visible" : "overflow-hidden"
      }`}
    >
      <PostHeader
        post={post}
        isOwner={isOwner}
        followed={followed}
        onFollow={() => runAction(onFollow)}
        onOptions={() => setOptionsOpen((current) => !current)}
        onViewProfile={onViewProfile}
      />

      {optionsOpen ? (
        <div ref={optionsRef}>
          <PostOptionsMenu
            followed={followed}
            isOwner={isOwner}
            saved={saved}
            onCopy={() => runAction(() => copyPostLink(post.id))}
            onDelete={() => {
              setOptionsOpen(false);
              setDeleteOpen(true);
            }}
            onEdit={() => {
              setOptionsOpen(false);
              setEditValue(post.body || "");
              setEditOpen(true);
            }}
            onFollow={() => runAction(onFollow)}
            onHide={() => runAction(onHide)}
            onReport={() => {
              setOptionsOpen(false);
              setReportOpen(true);
            }}
            onSave={() => runAction(onSave)}
            onShare={() => runAction(shareAndNotify)}
            onViewActivity={() => runAction(onViewActivity)}
          />
        </div>
      ) : null}

      {advertPost ? (
        <AdvertPostCard post={post} advert={advert || {}} />
      ) : post.body ? (
        <div className="kuntai-break whitespace-pre-wrap px-4 pb-4 text-base font-semibold leading-7 text-slate-900">{post.body}</div>
      ) : null}

      <PostMedia post={post} />

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
      {editOpen ? (
        <div className="absolute inset-0 z-30 flex items-end bg-slate-950/30 px-3 pb-3 backdrop-blur-sm" onClick={() => setEditOpen(false)}>
          <form className="w-full rounded-[24px] bg-white p-4 shadow-2xl" onSubmit={submitEdit} onClick={(event) => event.stopPropagation()}>
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
        </div>
      ) : null}
      {reportOpen ? (
        <div className="absolute inset-0 z-30 flex items-end bg-slate-950/30 px-3 pb-3 backdrop-blur-sm" onClick={() => setReportOpen(false)}>
          <form className="w-full rounded-[24px] bg-white p-4 shadow-2xl" onSubmit={submitReport} onClick={(event) => event.stopPropagation()}>
            <p className="text-xs font-black uppercase tracking-[0.16em] text-rose-600">Report post</p>
            <textarea
              value={reportReason}
              onChange={(event) => setReportReason(event.target.value)}
              placeholder="Tell us what is wrong."
              rows={4}
              className="mt-3 w-full resize-none rounded-2xl bg-slate-100 px-4 py-3 text-sm font-bold leading-6 text-slate-800 outline-none"
            />
            <div className="mt-3 grid grid-cols-2 gap-2">
              <button type="button" onClick={() => setReportOpen(false)} className="h-11 rounded-2xl bg-slate-100 text-sm font-black text-slate-700">
                Cancel
              </button>
              <button type="submit" disabled={!reportReason.trim()} className="h-11 rounded-2xl bg-rose-600 text-sm font-black text-white disabled:opacity-50">
                Report
              </button>
            </div>
          </form>
        </div>
      ) : null}
      {deleteOpen ? (
        <div className="absolute inset-0 z-30 flex items-end bg-slate-950/30 px-3 pb-3 backdrop-blur-sm" onClick={() => setDeleteOpen(false)}>
          <div className="w-full rounded-[24px] bg-white p-4 shadow-2xl" onClick={(event) => event.stopPropagation()}>
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
        </div>
      ) : null}
    </article>
  );
}

function AdvertPostCard({ post, advert }) {
  const url = normalizeAdvertUrl(advert.link);
  const schedule = formatAdvertSchedule(advert);
  const hasLocation = Number.isFinite(Number(advert.lat)) && Number.isFinite(Number(advert.lng));
  const title = advert.title || "Sponsored advert";

  return (
    <section className="mx-4 mb-4 overflow-hidden rounded-[24px] border border-amber-200 bg-gradient-to-br from-amber-50 via-white to-white shadow-sm">
      <div className="flex items-center justify-between gap-3 border-b border-amber-100 px-4 py-3">
        <div className="flex min-w-0 items-center gap-3">
          <span className="grid h-10 w-10 flex-none place-items-center rounded-2xl bg-white text-amber-700 shadow-sm ring-1 ring-amber-100">
            <Megaphone size={18} strokeWidth={2.4} absoluteStrokeWidth />
          </span>
          <div className="min-w-0">
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-amber-700">Post an advert</p>
            <p className="truncate text-sm font-black text-slate-950">{title}</p>
          </div>
        </div>
        <span className="rounded-full bg-white px-3 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-slate-500 ring-1 ring-slate-100">
          {advert.type || "offer"}
        </span>
      </div>

      <div className="space-y-3 px-4 py-4">
        <h3 className="kuntai-break text-xl font-black leading-7 text-slate-950">{title}</h3>
        {post.body ? <p className="kuntai-break whitespace-pre-wrap text-sm font-semibold leading-6 text-slate-700">{post.body}</p> : null}

        <div className="grid gap-2 sm:grid-cols-2">
          {schedule ? (
            <div className="flex items-center gap-2 rounded-2xl bg-white px-3 py-2 text-sm font-bold text-slate-700 ring-1 ring-slate-100">
              <CalendarClock size={16} strokeWidth={2.35} absoluteStrokeWidth />
              <span className="truncate">{schedule}</span>
            </div>
          ) : null}
          {advert.address ? (
            <button
              type="button"
              onClick={() => openAdvertAreaView(post, advert)}
              disabled={!hasLocation}
              className="flex items-center gap-2 rounded-2xl bg-white px-3 py-2 text-left text-sm font-bold text-slate-700 ring-1 ring-slate-100 transition enabled:hover:bg-slate-50 disabled:cursor-default"
            >
              <MapPin size={16} strokeWidth={2.35} absoluteStrokeWidth />
              <span className="truncate">{advert.address}</span>
            </button>
          ) : null}
        </div>

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {url ? (
            <a
              href={url}
              target="_blank"
              rel="noreferrer"
              className="kt-pressable flex h-12 items-center justify-center gap-2 rounded-2xl bg-slate-950 px-4 text-sm font-black text-white"
            >
              <ExternalLink size={16} strokeWidth={2.4} absoluteStrokeWidth />
              {advert.ctaLabel || "Learn more"}
            </a>
          ) : null}
          {hasLocation ? (
            <button
              type="button"
              onClick={() => openAdvertAreaView(post, advert)}
              className="kt-pressable flex h-12 items-center justify-center gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 text-sm font-black text-emerald-700"
            >
              <Navigation size={16} strokeWidth={2.4} absoluteStrokeWidth />
              Open in Area View
            </button>
          ) : null}
        </div>
      </div>
    </section>
  );
}
