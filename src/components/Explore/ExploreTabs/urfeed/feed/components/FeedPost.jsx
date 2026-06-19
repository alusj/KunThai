import { useEffect, useRef, useState } from "react";
import { AtSign, Hash, MapPin, Megaphone } from "lucide-react";

import { useBrowserBack } from "../../../../../../Backend/hooks/useBrowserBack";
import { createExploreNotification } from "../../../../../../Backend/services/exploreService";
import CommentsDrawer from "../comments/CommentsDrawer";
import PostActions from "../post/PostActions";
import PostHeader from "../post/PostHeader";
import PostMedia from "../post/PostMedia";
import PostOptionsMenu from "../post/PostOptionsMenu";
import { copyPostLink, sharePost } from "../post/postUtils";
import AdvertMetaActions from "../../../../shared/AdvertMetaActions";
import ExpandablePostText from "../../../../shared/ExpandablePostText";
import { getAdvertMeta, getPostTitle, isAdvertPost, normalizeAdvertUrl } from "../../../../shared/advertUtils";

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
        returnTo: "explore",
        source: "explore-post",
      },
    }));
  }

  return (
    <article
      id={`post-${post.id}`}
      className={`relative w-full max-w-full min-w-0 rounded-[24px] border border-slate-200 bg-white shadow-sm transition-shadow duration-200 hover:shadow-md ${
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
      ) : postTitle || post.body ? (
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
      ) : null}

      {!advertPost && (hashtags.length || mentions.length || postLocation) ? (
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
              onClick={() => openExploreSearch(`@${mention}`)}
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

      <PostMedia post={post} imageOnly={advertPost} />

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
  const title = advert.title || "Advertisement";

  return (
    <section className="mx-4 mb-4 rounded-[24px] border border-amber-200 bg-gradient-to-br from-amber-50 via-white to-white p-4 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <span className="grid h-10 w-10 flex-none place-items-center rounded-2xl bg-white text-amber-700 shadow-sm ring-1 ring-amber-100">
            <Megaphone size={18} strokeWidth={2.4} absoluteStrokeWidth />
          </span>
          <p className="text-[11px] font-black uppercase tracking-[0.18em] text-amber-700">Advertisement</p>
        </div>
        <span className="rounded-full bg-white px-3 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-slate-500 ring-1 ring-slate-100">
          {advert.type || "offer"}
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

      {url ? (
        <a
          href={url}
          target="_blank"
          rel="noreferrer"
          className="kt-pressable mt-3 flex h-11 w-full items-center justify-center rounded-2xl bg-slate-950 px-4 text-sm font-black text-white"
        >
          {advert.ctaLabel || "Learn more"}
        </a>
      ) : null}
    </section>
  );
}
