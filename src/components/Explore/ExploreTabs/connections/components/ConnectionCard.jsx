import { HiOutlineCheckBadge, HiOutlineNoSymbol, HiOutlineUserMinus, HiOutlineUsers } from "react-icons/hi2";

import Avatar from "../../../shared/Avatar";

export default function ConnectionCard({ user, mode = "discover", onBlock, onFollow, onRemove, onViewProfile }) {
  const isFollowing = Boolean(user.isFollowing);

  return (
    <article className="rounded-[24px] border border-slate-200 bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
      <div className="flex items-start gap-3">
        <button type="button" onClick={onViewProfile} className="flex-none" aria-label={`View ${user.name}`}>
          <Avatar name={user.name} src={user.avatar_url} size="md" />
        </button>

        <div className="min-w-0 flex-1">
          <button type="button" onClick={onViewProfile} className="flex min-w-0 items-center gap-1 text-left">
            <span className="truncate text-sm font-black text-slate-950">{user.name}</span>
            {user.verified ? <HiOutlineCheckBadge className="flex-none text-sky-600" /> : null}
          </button>
          <p className="truncate text-xs font-semibold text-slate-500">@{user.username}</p>
          {user.bio ? <p className="mt-2 line-clamp-2 text-sm leading-6 text-slate-600">{user.bio}</p> : null}

          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs font-bold">
            {user.status ? <span className="rounded-full bg-sky-50 px-3 py-1 text-sky-700">{user.status}</span> : null}
            {user.mutual_count ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-3 py-1 text-slate-600">
                <HiOutlineUsers />
                {user.mutual_count} mutual
              </span>
            ) : null}
          </div>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-[1fr_auto_auto] gap-2">
        <button
          type="button"
          onClick={onFollow}
          className={`h-10 rounded-2xl px-4 text-sm font-black transition ${
            isFollowing ? "bg-sky-50 text-sky-700 hover:bg-sky-100" : "bg-slate-950 text-white hover:bg-slate-800"
          }`}
        >
          {isFollowing ? "Following" : "Follow"}
        </button>
        {mode !== "discover" ? (
          <button
            type="button"
            onClick={onRemove}
            className="flex h-10 w-10 items-center justify-center rounded-2xl bg-slate-100 text-lg text-slate-600 hover:bg-slate-200"
            aria-label="Remove connection"
          >
            <HiOutlineUserMinus />
          </button>
        ) : null}
        <button
          type="button"
          onClick={onBlock}
          className="flex h-10 w-10 items-center justify-center rounded-2xl bg-rose-50 text-lg text-rose-600 hover:bg-rose-100"
          aria-label="Block account"
        >
          <HiOutlineNoSymbol />
        </button>
      </div>
    </article>
  );
}
