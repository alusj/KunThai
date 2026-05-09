import {
  HiOutlineArchiveBox,
  HiOutlineArrowTopRightOnSquare,
  HiOutlineCheckBadge,
  HiOutlineChatBubbleLeftRight,
  HiOutlineEllipsisHorizontal,
  HiOutlineFlag,
  HiOutlineNoSymbol,
  HiOutlinePencilSquare,
  HiOutlinePhoto,
  HiOutlineUserMinus,
} from "react-icons/hi2";
import { useEffect, useRef, useState } from "react";

import Avatar from "../../shared/Avatar";

export default function ProfileHeaderCard({
  editable,
  editing,
  feedback,
  fileInputRef,
  followed,
  onAvatarChange,
  onBlock,
  onEdit,
  onFollow,
  onMessage,
  onReport,
  onShare,
  saving,
  stats,
  values,
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);

  useEffect(() => {
    if (!menuOpen) return undefined;

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
    <section className="overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-sm">
      <div className="h-24 bg-gradient-to-r from-sky-100 via-white to-slate-100" />
      <div className="-mt-10 px-5 pb-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <button
              type="button"
              onClick={() => editable && editing && fileInputRef.current?.click()}
              className="inline-flex rounded-full bg-white p-1 shadow-sm"
              aria-label={editable && editing ? "Change profile image" : "Profile image"}
            >
              <Avatar name={values.displayName} src={values.avatarUrl} size="lg" />
            </button>
            {editable && editing ? (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="ml-2 inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-1 text-[11px] font-bold text-slate-600"
              >
                <HiOutlinePhoto />
                Photo
              </button>
            ) : null}
            <input ref={fileInputRef} type="file" accept="image/*" onChange={onAvatarChange} className="hidden" />
          </div>

          <div ref={menuRef} className="relative flex flex-wrap justify-end gap-2 pt-10">
            {editable ? (
              <button
                type="button"
                onClick={onEdit}
                disabled={saving}
                className="inline-flex h-10 items-center gap-2 rounded-2xl bg-slate-950 px-4 text-sm font-black text-white disabled:opacity-60"
              >
                <HiOutlinePencilSquare />
                {editing ? (saving ? "Saving" : "Save") : "Edit"}
              </button>
            ) : (
              <>
                {!followed ? (
                  <button
                    type="button"
                    onClick={onFollow}
                    className="h-10 rounded-2xl bg-slate-950 px-4 text-sm font-black text-white"
                  >
                    Follow
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={onMessage}
                  className="flex h-10 w-10 items-center justify-center rounded-2xl bg-sky-50 text-sky-700"
                  aria-label="Message profile"
                >
                  <HiOutlineChatBubbleLeftRight />
                </button>
              </>
            )}
            <button
              type="button"
              onClick={() => setMenuOpen((current) => !current)}
              className="flex h-10 w-10 items-center justify-center rounded-2xl bg-slate-100 text-xl text-slate-700"
              aria-label="Open profile actions"
              aria-expanded={menuOpen}
            >
              <HiOutlineEllipsisHorizontal />
            </button>

            {menuOpen ? (
              <div className="absolute right-0 top-20 z-20 w-64 overflow-hidden rounded-2xl border border-slate-200 bg-white p-2 text-sm font-black shadow-xl">
                {!editable && followed ? (
                  <button
                    type="button"
                    onClick={() => runMenuAction(onFollow)}
                    className="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left text-slate-700 hover:bg-slate-100"
                  >
                    <HiOutlineUserMinus className="text-lg" />
                    Unfollow account
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={() => runMenuAction(onShare)}
                  className="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left text-slate-700 hover:bg-slate-100"
                >
                  <HiOutlineArrowTopRightOnSquare className="text-lg" />
                  Share profile
                </button>
                {!editable ? (
                  <>
                    <button
                      type="button"
                      onClick={() => runMenuAction(onReport)}
                      className="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left text-slate-700 hover:bg-slate-100"
                    >
                      <HiOutlineFlag className="text-lg" />
                      Report profile
                    </button>
                    <button
                      type="button"
                      onClick={() => runMenuAction(onBlock)}
                      className="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left text-rose-700 hover:bg-rose-50"
                    >
                      <HiOutlineNoSymbol className="text-lg" />
                      Block profile
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={() => runMenuAction(onShare)}
                    className="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left text-slate-700 hover:bg-slate-100"
                  >
                    <HiOutlineArchiveBox className="text-lg" />
                    Copy public profile
                  </button>
                )}
              </div>
            ) : null}
          </div>
        </div>

        <div className="mt-3 min-w-0">
          <div className="flex min-w-0 items-center gap-2">
            <h3 className="truncate text-2xl font-black text-slate-950">{values.displayName || "Profile"}</h3>
            {values.verified ? <HiOutlineCheckBadge className="flex-none text-xl text-sky-600" /> : null}
          </div>
          <p className="mt-1 text-sm font-bold text-slate-500">{values.username ? `@${values.username}` : "@username"}</p>
          {values.bio ? <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600">{values.bio}</p> : null}

          <div className="mt-4 grid grid-cols-4 gap-2 text-center">
            <div className="rounded-2xl bg-slate-50 px-3 py-2">
              <p className="text-lg font-black text-slate-950">{stats.feed}</p>
              <p className="text-[11px] font-bold text-slate-500">Feed</p>
            </div>
            <div className="rounded-2xl bg-slate-50 px-3 py-2">
              <p className="text-lg font-black text-slate-950">{stats.swip}</p>
              <p className="text-[11px] font-bold text-slate-500">Swip</p>
            </div>
            <div className="rounded-2xl bg-slate-50 px-3 py-2">
              <p className="text-lg font-black text-slate-950">{stats.followers}</p>
              <p className="text-[11px] font-bold text-slate-500">Followers</p>
            </div>
            <div className="rounded-2xl bg-slate-50 px-3 py-2">
              <p className="text-lg font-black text-slate-950">{stats.following}</p>
              <p className="text-[11px] font-bold text-slate-500">Following</p>
            </div>
          </div>

          {feedback ? <p className="mt-3 text-xs font-bold text-sky-700">{feedback}</p> : null}
        </div>
      </div>
    </section>
  );
}
