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
import { FaFacebookF, FaInstagram, FaTiktok, FaTwitter, FaWhatsapp, FaYoutube } from "react-icons/fa";

import { normalizeSocialLinks } from "../../../../Backend/services/explore/socialLinks";
import Avatar from "../../shared/Avatar";

const platformIcons = {
  facebook: FaFacebookF,
  instagram: FaInstagram,
  tiktok: FaTiktok,
  x: FaTwitter,
  whatsapp: FaWhatsapp,
  youtube: FaYoutube,
};

export default function ProfileHeaderCard({
  coverInputRef,
  editable,
  editing,
  feedback,
  fileInputRef,
  followed,
  onAvatarChange,
  onBlock,
  onCoverChange,
  onCoverPreset,
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
  const socialLinks = normalizeSocialLinks(values.socialLinks).filter((link) => link.url);
  const coverStyle = getCoverStyle(values.coverUrl);

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
    <section className="rounded-[28px] border border-slate-200 bg-white shadow-sm">
      <div className="relative h-28 overflow-hidden rounded-t-[28px] bg-slate-100 sm:h-36" style={coverStyle}>
        {editing && editable ? (
          <div className="absolute inset-x-4 top-4 flex flex-wrap gap-2">
            {["gradient", "animated", "marketplace", "transport"].map((preset) => (
              <button
                key={preset}
                type="button"
                onClick={() => onCoverPreset?.(preset)}
                className="rounded-full bg-white/90 px-3 py-1 text-xs font-semibold capitalize text-slate-700 shadow-sm backdrop-blur"
              >
                {preset}
              </button>
            ))}
            <button
              type="button"
              onClick={() => coverInputRef.current?.click()}
              className="rounded-full bg-slate-950 px-3 py-1 text-xs font-semibold text-white shadow-sm"
            >
              Upload cover
            </button>
          </div>
        ) : null}
      </div>
      <div className="relative z-10 -mt-10 px-5 pb-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <button
              type="button"
              onClick={() => editable && editing && fileInputRef.current?.click()}
              className="inline-flex rounded-full bg-white p-1 shadow-sm ring-4 ring-white"
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
            <input ref={coverInputRef} type="file" accept="image/*" onChange={onCoverChange} className="hidden" />
          </div>

          <div ref={menuRef} className="relative flex flex-col items-end gap-2 pt-10">
            {socialLinks.length ? (
              <div className="flex items-center justify-end gap-2">
                {socialLinks.map((link) => {
                  const Icon = platformIcons[link.platform];
                  return Icon ? (
                    <a
                      key={link.id}
                      href={/^https?:\/\//i.test(link.url) ? link.url : `https://${link.url}`}
                      target="_blank"
                      rel="noreferrer"
                      title={link.label || "Social profile"}
                      aria-label={link.label || "Social profile"}
                      className="flex h-10 w-10 items-center justify-center rounded-2xl bg-slate-100 text-lg text-slate-700 transition hover:bg-sky-50 hover:text-sky-700"
                    >
                      <Icon />
                    </a>
                  ) : null;
                })}
              </div>
            ) : null}

            <div className="flex flex-wrap justify-end gap-2">
              {editable ? (
                <button
                  type="button"
                  onClick={onEdit}
                  disabled={saving}
                  className="inline-flex h-10 items-center gap-2 rounded-2xl bg-slate-950 px-4 text-sm font-semibold text-white disabled:opacity-60"
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
                      className="h-10 rounded-2xl bg-slate-950 px-4 text-sm font-semibold text-white"
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
            </div>

            {menuOpen ? (
              <div className="absolute right-0 top-full z-20 mt-2 w-64 overflow-hidden rounded-2xl border border-slate-200 bg-white p-2 text-sm font-semibold shadow-xl">
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
            <h3 className="truncate text-2xl font-semibold text-slate-950">{values.displayName || "Profile"}</h3>
            {values.verified ? <HiOutlineCheckBadge className="flex-none text-xl text-sky-600" /> : null}
          </div>
          {values.username ? <p className="mt-1 text-sm font-bold text-slate-500">@{values.username}</p> : null}
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

function getCoverStyle(coverUrl) {
  const value = coverUrl || "preset:gradient";
  const presets = {
    "preset:gradient": {
      backgroundImage: "linear-gradient(120deg, #dff4ff 0%, #ffffff 50%, #eef2f7 100%)",
    },
    "preset:animated": {
      backgroundImage: "linear-gradient(120deg, #e0f2fe 0%, #f8fafc 35%, #dbeafe 70%, #f0fdfa 100%)",
      backgroundSize: "220% 220%",
      animation: "kuntai-cover-pan 12s ease-in-out infinite",
    },
    "preset:marketplace": {
      backgroundImage: "linear-gradient(120deg, #ecfeff 0%, #fef9c3 48%, #e0f2fe 100%)",
    },
    "preset:transport": {
      backgroundImage: "linear-gradient(120deg, #f0fdf4 0%, #eff6ff 55%, #e2e8f0 100%)",
    },
  };

  if (presets[value]) {
    return presets[value];
  }

  return {
    backgroundImage: `linear-gradient(120deg, rgba(15,23,42,0.08), rgba(255,255,255,0.12)), url("${value}")`,
    backgroundSize: "cover",
    backgroundPosition: "center",
  };
}
