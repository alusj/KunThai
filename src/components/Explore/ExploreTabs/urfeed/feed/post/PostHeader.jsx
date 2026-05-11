import { HiOutlineEllipsisHorizontal } from "react-icons/hi2";

import { formatRelativeTime } from "../../../../../../Backend/services/exploreService";
import Avatar from "../../../../shared/Avatar";

export default function PostHeader({ post, isOwner, followed, onFollow, onOptions, onViewProfile }) {
  return (
    <div className="flex items-start justify-between gap-3 px-4 py-4">
      <div className="flex min-w-0 items-center gap-3">
        <button type="button" onClick={onViewProfile} className="flex-none" aria-label={`View ${post.author_name}'s profile`}>
          <Avatar name={post.author_name} src={post.author_avatar_url} />
        </button>

        <div className="min-w-0">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={onViewProfile}
              className="min-w-0 truncate text-left text-[15px] font-black text-slate-950 hover:text-sky-700"
            >
              {post.author_name || "Profile"}
            </button>
            {!isOwner && post.user_id && !followed ? (
              <button
                type="button"
                onClick={onFollow}
                className="h-7 flex-none rounded-full bg-slate-950 px-3 text-xs font-bold text-white transition hover:bg-slate-800"
              >
                Follow
              </button>
            ) : null}
          </div>
          <p className="mt-0.5 truncate text-[13px] font-bold text-slate-500">
            @{post.author_username || "user"} · {formatRelativeTime(post.created_at)}
          </p>
          {post.contextLabel ? (
            <span className="mt-2 inline-flex rounded-full bg-sky-50 px-2.5 py-1 text-[11px] font-black text-sky-700">
              {post.contextLabel}
            </span>
          ) : null}
        </div>
      </div>

      <button
        type="button"
        onClick={onOptions}
        data-post-options-toggle={post.id}
        className="flex h-9 w-9 flex-none items-center justify-center rounded-full text-xl text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
        aria-label="Post options"
      >
        <HiOutlineEllipsisHorizontal />
      </button>
    </div>
  );
}
