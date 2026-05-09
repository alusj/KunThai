import { useEffect, useRef, useState } from "react";
import { HiOutlineCheckBadge, HiOutlineEllipsisHorizontal, HiOutlineNoSymbol, HiOutlineUserMinus, HiOutlineUsers } from "react-icons/hi2";

import Avatar from "../../../shared/Avatar";

export default function ConnectionCard({ user, mode = "discover", onBlock, onFollow, onRemove, onViewProfile }) {
  const isFollowing = Boolean(user.isFollowing);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);

  useEffect(() => {
    if (!menuOpen) {
      return undefined;
    }

    function handlePointerDown(event) {
      if (!menuRef.current?.contains(event.target)) {
        setMenuOpen(false);
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [menuOpen]);

  function runMenuAction(action) {
    setMenuOpen(false);
    action?.();
  }

  return (
    <article className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
      <div className="flex items-start gap-4">
        <button type="button" onClick={onViewProfile} className="flex-none" aria-label={`View ${user.name}`}>
          <Avatar name={user.name} src={user.avatar_url} size="md" />
        </button>

        <div className="min-w-0 flex-1">
          <div ref={menuRef} className="relative flex min-w-0 items-start justify-between gap-3">
            <button type="button" onClick={onViewProfile} className="flex min-w-0 items-center gap-1 text-left">
              <span className="truncate text-base font-black text-slate-950">{user.name}</span>
              {user.verified ? <HiOutlineCheckBadge className="flex-none text-sky-600" /> : null}
            </button>
            <button
              type="button"
              onClick={() => setMenuOpen((current) => !current)}
              className="flex h-10 w-10 flex-none items-center justify-center rounded-2xl bg-slate-100 text-2xl text-slate-700 hover:bg-slate-200"
              aria-label={`Open actions for ${user.name}`}
              aria-expanded={menuOpen}
            >
              <HiOutlineEllipsisHorizontal />
            </button>

            {menuOpen ? (
              <div className="absolute right-0 top-12 z-20 w-64 overflow-hidden rounded-2xl border border-slate-200 bg-white p-2 text-base font-black shadow-xl">
                <button
                  type="button"
                  onClick={() => runMenuAction(onViewProfile)}
                  className="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left text-slate-700 hover:bg-slate-100"
                >
                  View profile
                </button>
                {isFollowing ? (
                  <button
                    type="button"
                    onClick={() => runMenuAction(onFollow)}
                    className="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left text-slate-700 hover:bg-slate-100"
                  >
                    <HiOutlineUserMinus className="text-lg" />
                    Unfollow
                  </button>
                ) : null}
                {mode !== "discover" ? (
                  <button
                    type="button"
                    onClick={() => runMenuAction(onRemove)}
                    className="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left text-slate-700 hover:bg-slate-100"
                  >
                    <HiOutlineUserMinus className="text-lg" />
                    Remove from list
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={() => runMenuAction(onBlock)}
                  className="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left text-rose-700 hover:bg-rose-50"
                >
                  <HiOutlineNoSymbol className="text-lg" />
                  Block account
                </button>
              </div>
            ) : null}
          </div>
          <p className="truncate text-sm font-bold text-slate-500">@{user.username}</p>
          {user.bio ? <p className="mt-2 line-clamp-2 text-base font-semibold leading-7 text-slate-600">{user.bio}</p> : null}

          <div className="mt-3 flex flex-wrap items-center gap-2 text-sm font-black">
            {user.status ? <span className="rounded-full bg-sky-50 px-3.5 py-1.5 text-sky-700">{user.status}</span> : null}
            {user.mutual_count ? (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-3.5 py-1.5 text-slate-600">
                <HiOutlineUsers />
                {user.mutual_count} mutual
              </span>
            ) : null}
          </div>
        </div>
      </div>

      <div className="mt-4">
        {!isFollowing ? (
          <button
            type="button"
            onClick={onFollow}
            className="h-12 w-full rounded-2xl bg-slate-950 px-4 text-base font-black text-white transition hover:bg-slate-800"
          >
            Follow
          </button>
        ) : null}
      </div>
    </article>
  );
}
