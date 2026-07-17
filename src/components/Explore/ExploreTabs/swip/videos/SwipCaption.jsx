import { HiOutlineCheckBadge } from "react-icons/hi2";
import { Repeat2 } from "lucide-react";

import { formatRelativeTime } from "../../../../../Backend/services/exploreService";
import AdvertMetaActions from "../../../shared/AdvertMetaActions";
import Avatar from "../../../shared/Avatar";
import ExpandablePostText from "../../../shared/ExpandablePostText";
import { getAdvertMeta, getPostTitle, isAdvertPost } from "../../../shared/advertUtils";

export default function SwipCaption({ categoryLabel, contextLabel, post, onViewProfile }) {
  const advertPost = isAdvertPost(post);
  const advert = getAdvertMeta(post) || {};
  const postTitle = getPostTitle(post);
  const sharedFrom = post.swipRepost || post.media_meta?.repost || null;

  function openProfile(event) {
    event.preventDefault();
    event.stopPropagation();
    onViewProfile?.();
  }

  return (
    <div className="absolute inset-x-0 bottom-0 z-10 bg-gradient-to-t from-slate-950 via-slate-950/55 to-transparent px-4 pb-11 pt-24 text-white sm:px-5">
      <div className="min-w-0 max-w-[calc(100%-72px)] space-y-3">
        {sharedFrom ? (
          <div className="flex min-w-0 items-center gap-2 rounded-2xl bg-white/12 px-3 py-2 backdrop-blur">
            <span className="grid h-7 w-7 flex-none place-items-center rounded-full bg-emerald-400/25 text-emerald-200">
              <Repeat2 size={15} />
            </span>
            <span className="min-w-0">
              <span className="block text-[10px] font-black uppercase tracking-[0.16em] text-emerald-200">Shared Swip</span>
              <span className="flex min-w-0 items-center gap-1.5 text-xs font-black text-white/90">
                <Avatar name={sharedFrom.authorName} src={sharedFrom.authorAvatarUrl} size="xs" />
                <span className="truncate">
                  Original by {sharedFrom.authorName || "creator"}
                  {sharedFrom.authorUsername ? ` (@${sharedFrom.authorUsername})` : ""}
                </span>
              </span>
            </span>
          </div>
        ) : null}
        <button type="button" onClick={openProfile} className="kt-pressable flex min-w-0 items-center gap-3 rounded-2xl text-left">
          <Avatar name={post.author_name} src={post.author_avatar_url} size="sm" />
          <span className="min-w-0">
            <span className="flex min-w-0 items-center gap-1">
              <span className="truncate text-base font-black">{post.author_name || "Profile"}</span>
              {post.verified ? <HiOutlineCheckBadge className="flex-none text-sky-300" /> : null}
            </span>
            <span className="block truncate text-[13px] font-black text-white/75">
              @{post.author_username || "user"} &middot; {formatRelativeTime(post.created_at)}
            </span>
          </span>
        </button>

        {advertPost ? (
          <div className="space-y-2">
            <p className="text-[11px] font-black uppercase tracking-[0.18em] text-amber-300">Sponsored</p>
            <h3 className="kuntai-break text-lg font-black leading-6 text-white">
              {advert.title || "Advertisement"}
            </h3>
            {post.body ? (
              <ExpandablePostText
                text={post.body}
                className="text-sm font-bold leading-6"
                textClassName="text-white/90"
                controlClassName="text-amber-300"
              />
            ) : null}
            <AdvertMetaActions post={post} advert={advert} dark />
          </div>
        ) : (
          <>
            {postTitle ? <h3 className="kuntai-break text-lg font-black leading-6 text-white">{postTitle}</h3> : null}
            {post.body ? (
              <ExpandablePostText
                text={post.body}
                className="text-base font-bold leading-7"
                textClassName="text-white/95"
                controlClassName="text-sky-300"
              />
            ) : null}

            <div className="flex min-w-0 items-center gap-2">
              <span className="rounded-full bg-white/15 px-3 py-1 text-xs font-black backdrop-blur">{contextLabel || "Suggested"}</span>
              {categoryLabel ? (
                <span className="rounded-full bg-white/15 px-3 py-1 text-xs font-black backdrop-blur">{categoryLabel}</span>
              ) : null}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
