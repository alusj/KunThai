import { HiOutlineArrowsPointingOut, HiOutlineCheckBadge } from "react-icons/hi2";

import { formatRelativeTime } from "../../../../../Backend/services/exploreService";
import Avatar from "../../../shared/Avatar";

export default function SwipCaption({ categoryLabel, contextLabel, post, onFullscreen, onViewProfile }) {
  return (
    <div className="absolute inset-x-0 bottom-0 z-10 bg-gradient-to-t from-slate-950 via-slate-950/55 to-transparent px-4 pb-5 pt-24 text-white sm:px-5">
      <div className="min-w-0 max-w-[calc(100%-72px)] space-y-3">
        <button type="button" onClick={onViewProfile} className="flex min-w-0 items-center gap-3 text-left">
          <Avatar name={post.author_name} src={post.author_avatar_url} size="sm" />
          <span className="min-w-0">
            <span className="flex min-w-0 items-center gap-1">
              <span className="truncate text-base font-black">{post.author_name || "Profile"}</span>
              {post.verified ? <HiOutlineCheckBadge className="flex-none text-sky-300" /> : null}
            </span>
            <span className="block truncate text-[13px] font-black text-white/75">
              @{post.author_username || "user"} · {formatRelativeTime(post.created_at)}
            </span>
          </span>
        </button>

        {post.body ? <p className="kuntai-break line-clamp-3 whitespace-pre-wrap text-base font-bold leading-7 text-white/95">{post.body}</p> : null}

        <div className="flex min-w-0 items-center gap-2">
          <span className="rounded-full bg-white/15 px-3 py-1 text-xs font-black backdrop-blur">{contextLabel || "Suggested"}</span>
          {categoryLabel ? (
            <span className="rounded-full bg-white/15 px-3 py-1 text-xs font-black backdrop-blur">{categoryLabel}</span>
          ) : null}
          <button
            type="button"
            onClick={onFullscreen}
            className="inline-flex items-center gap-1 rounded-full bg-white/15 px-3 py-1 text-xs font-black backdrop-blur"
          >
            <HiOutlineArrowsPointingOut />
            Full screen
          </button>
        </div>
      </div>
    </div>
  );
}
