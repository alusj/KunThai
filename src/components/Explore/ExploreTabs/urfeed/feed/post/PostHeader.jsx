import { HiOutlineEllipsisHorizontal } from "react-icons/hi2";

import { formatRelativeTime } from "../../../../../../Backend/services/exploreService";
import Avatar from "../../../../shared/Avatar";

export default function PostHeader({ post, isOwner, followed, onFollow, onOptions, onViewProfile }) {
  function openProfile(event) {
    event.preventDefault();
    event.stopPropagation();
    onViewProfile?.();
  }

  function runFollow(event) {
    event.preventDefault();
    event.stopPropagation();
    onFollow?.();
  }

  function openOptions(event) {
    event.preventDefault();
    event.stopPropagation();
    onOptions?.();
  }

  return (
    <div className="flex items-start justify-between gap-3 px-4 py-4">
      <div className="flex min-w-0 items-center gap-3">
        <button
          type="button"
          onClick={openProfile}
          className="kt-pressable flex min-w-0 items-center gap-3 rounded-2xl text-left"
          aria-label={`View ${post.author_name || "Profile"}'s profile`}
        >
          <Avatar name={post.author_name} src={post.author_avatar_url} />

          <span className="min-w-0">
            <span className="block truncate text-[15px] font-black text-slate-950">
              {post.author_name || "Profile"}
            </span>
            <span className="mt-0.5 block max-w-full truncate text-[13px] font-bold text-slate-500">
              @{post.author_username || "user"} - {formatRelativeTime(post.created_at)}
            </span>
          </span>
        </button>

        <div className="min-w-0">
          {!isOwner && post.user_id && !followed ? (
            <button
              type="button"
              onClick={runFollow}
              className="kt-pressable h-7 flex-none rounded-full bg-slate-950 px-3 text-xs font-bold text-white hover:bg-slate-800"
            >
              Follow
            </button>
          ) : null}
          {post.contextLabel ? (
            <span className="mt-2 inline-flex rounded-full bg-sky-50 px-2.5 py-1 text-[11px] font-black text-sky-700">
              {post.contextLabel}
            </span>
          ) : null}
        </div>
      </div>

      <button
        type="button"
        onClick={openOptions}
        data-post-options-toggle={post.id}
        className="kt-pressable flex h-9 w-9 flex-none items-center justify-center rounded-full text-xl text-slate-400 hover:bg-slate-100 hover:text-slate-700"
        aria-label="Post options"
      >
        <HiOutlineEllipsisHorizontal />
      </button>
    </div>
  );
}
