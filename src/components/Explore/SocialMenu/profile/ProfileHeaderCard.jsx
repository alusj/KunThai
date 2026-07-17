import {
  HiOutlineArchiveBox,
  HiOutlineArrowTopRightOnSquare,
  HiOutlineBuildingOffice2,
  HiOutlineCheckBadge,
  HiOutlineChatBubbleLeftRight,
  HiOutlineClipboardDocument,
  HiOutlineEllipsisHorizontal,
  HiOutlineFlag,
  HiOutlineNoSymbol,
  HiOutlinePencilSquare,
  HiOutlinePhoto,
  HiOutlineShare,
  HiOutlineUserMinus,
} from "react-icons/hi2";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { FaFacebookF, FaInstagram, FaTiktok, FaTwitter, FaWhatsapp, FaYoutube } from "react-icons/fa";

import { normalizeSocialLinks } from "../../../../Backend/services/explore/socialLinks";
import { getKunThaiPublicUserId } from "../../../../Backend/services/identityCodeService";
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
  creditLoading = false,
  creditWallet = null,
  editable,
  editing,
  feedback,
  fileInputRef,
  followed,
  onAvatarChange,
  onBlock,
  onCoverChange,
  onCoverPreset,
  onCreateSpace,
  onEdit,
  onFollow,
  onMessage,
  onReport,
  onShare,
  onShareCredits,
  loadingStats = false,
  saving,
  stats,
  values,
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [copiedPublicId, setCopiedPublicId] = useState(false);
  const [creditHelpOpen, setCreditHelpOpen] = useState(false);
  const [publicIdHelpOpen, setPublicIdHelpOpen] = useState(false);
  const menuRef = useRef(null);
  const socialLinks = normalizeSocialLinks(values.socialLinks).filter((link) => link.url);
  const coverStyle = getCoverStyle(values.coverUrl);
  const publicUserId = getKunThaiPublicUserId(values);
  const isSpace = values.identityType === "space" || values.accountType === "space" || values.isSpace;
  const showVisibilityCredits = editable && !isSpace && creditWallet;

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

  useEffect(() => {
    if (!publicIdHelpOpen && !creditHelpOpen) return undefined;
    function handleKeyDown(event) {
      if (event.key === "Escape") {
        setPublicIdHelpOpen(false);
        setCreditHelpOpen(false);
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [creditHelpOpen, publicIdHelpOpen]);

  function runMenuAction(action) {
    setMenuOpen(false);
    action?.();
  }

  async function copyPublicUserId() {
    try {
      await navigator.clipboard?.writeText(publicUserId);
      setCopiedPublicId(true);
      window.setTimeout(() => setCopiedPublicId(false), 2200);
    } catch {
      setCopiedPublicId(false);
    }
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
                      Connect
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
                    Remove connection
                  </button>
                ) : null}
                {editable && !isSpace && typeof onCreateSpace === "function" ? (
                  <button
                    type="button"
                    onClick={() => runMenuAction(onCreateSpace)}
                    className="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left text-slate-700 hover:bg-slate-100"
                  >
                    <HiOutlineBuildingOffice2 className="text-lg" />
                    Create Space
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={() => runMenuAction(onShare)}
                  className="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left text-slate-700 hover:bg-slate-100"
                >
                  <HiOutlineArrowTopRightOnSquare className="text-lg" />
                  {isSpace ? "Share Space" : "Share profile"}
                </button>
                {!editable ? (
                  <>
                    <button
                      type="button"
                      onClick={() => runMenuAction(onReport)}
                      className="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left text-slate-700 hover:bg-slate-100"
                    >
                    <HiOutlineFlag className="text-lg" />
                      {isSpace ? "Report Space" : "Report profile"}
                    </button>
                    <button
                      type="button"
                      onClick={() => runMenuAction(onBlock)}
                      className="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left text-rose-700 hover:bg-rose-50"
                    >
                    <HiOutlineNoSymbol className="text-lg" />
                      {isSpace ? "Block Space" : "Block profile"}
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={() => runMenuAction(onShare)}
                    className="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left text-slate-700 hover:bg-slate-100"
                  >
                    <HiOutlineArchiveBox className="text-lg" />
                    {isSpace ? "Copy Space link" : "Copy public profile"}
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
          <div className="mt-1 flex flex-wrap items-center gap-2">
            {values.username ? <p className="text-sm font-bold text-slate-500">@{values.username}</p> : null}
            {isSpace ? (
              <span className="rounded-full bg-sky-50 px-2.5 py-1 text-[11px] font-black uppercase tracking-[0.12em] text-sky-700">
                A Space
              </span>
            ) : null}
            {isSpace && values.categoryLabel ? (
              <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-black text-slate-600">
                {values.categoryLabel}
              </span>
            ) : null}
          </div>
          <div className="mt-2 flex w-fit max-w-full items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2">
            <span className="min-w-0 truncate text-xs font-black uppercase tracking-wide text-slate-500">
              {isSpace ? "Space ID" : "KunThai ID"}
            </span>
            <span className="min-w-0 truncate text-sm font-black text-slate-950">{publicUserId}</span>
            <button
              type="button"
              onClick={copyPublicUserId}
              className="kt-pressable flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white text-slate-700 shadow-sm hover:text-sky-700"
              aria-label="Copy KunThai ID"
              title="Copy KunThai ID"
            >
              <HiOutlineClipboardDocument />
            </button>
            <button
              type="button"
              onClick={() => setPublicIdHelpOpen(true)}
              className="kt-pressable flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-slate-300 bg-white text-sm font-black text-slate-700 shadow-sm hover:border-sky-300 hover:text-sky-700"
              aria-label="Why do I have a unique KunThai ID?"
              title="About your KunThai ID"
            >
              !
            </button>
            {copiedPublicId ? <span className="text-xs font-black text-sky-700">Copied</span> : null}
          </div>

          {showVisibilityCredits ? (
            <div className="mt-3 flex w-full max-w-2xl flex-wrap items-center gap-2 rounded-2xl border border-sky-200 bg-sky-50/85 px-3 py-3">
              <div className="min-w-0 flex-1">
                <p className="text-xs font-black uppercase tracking-[0.14em] text-sky-700">Visibility Credits</p>
                <p className="mt-0.5 text-sm font-black text-slate-950">
                  Available: {creditLoading ? "..." : Number(creditWallet.balance || 0)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setCreditHelpOpen(true)}
                className="kt-pressable flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-sky-300 bg-white text-sm font-black text-sky-700 shadow-sm"
                aria-label="What are Visibility Credits?"
                title="About Visibility Credits"
              >
                !
              </button>
              <button
                type="button"
                onClick={onShareCredits}
                className="kt-pressable inline-flex h-9 shrink-0 items-center gap-2 rounded-full bg-slate-950 px-4 text-xs font-black text-white shadow-sm disabled:opacity-50"
                disabled={creditLoading}
              >
                <HiOutlineShare />
                Share
              </button>
            </div>
          ) : null}
          {values.bio ? <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600">{values.bio}</p> : null}

          <div className="mt-4 grid grid-cols-4 gap-2 text-center">
            <StatTile label="Feed" value={stats?.feed} loading={loadingStats} />
            <StatTile label="Swip" value={stats?.swip} loading={loadingStats} />
            <StatTile label="Connections" value={stats?.followers} loading={loadingStats} />
            <StatTile label={isSpace ? "Team" : "Connected"} value={isSpace ? stats?.team : stats?.following} loading={loadingStats} />
          </div>

          {feedback ? <p className="mt-3 text-xs font-bold text-sky-700">{feedback}</p> : null}
        </div>
      </div>

      {publicIdHelpOpen && typeof document !== "undefined" ? createPortal(
        <div className="fixed inset-0 z-[2147483000] flex items-end justify-center overflow-y-auto bg-slate-950/55 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] backdrop-blur-[2px] sm:items-center" role="presentation" onMouseDown={() => setPublicIdHelpOpen(false)}>
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="kunthai-id-help-title"
            className="relative max-h-[calc(100dvh-2rem)] w-full max-w-md overflow-y-auto rounded-[28px] border border-sky-100 bg-white p-5 shadow-2xl"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="flex items-start gap-3">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-sky-200 bg-sky-50 text-lg font-black text-sky-700">!</span>
              <div className="min-w-0">
                <p className="text-xs font-black uppercase tracking-[0.18em] text-sky-700">Unique account code</p>
                <h2 id="kunthai-id-help-title" className="mt-1 text-xl font-black text-slate-950">Why your KunThai ID matters</h2>
              </div>
            </div>
            <div className="mt-4 space-y-3 text-sm font-semibold leading-6 text-slate-600">
              <p>This code identifies your exact account even when other people have the same name or a similar username.</p>
              <p>Use it when someone needs to find or invite you, or when KunThai support must confirm the correct account.</p>
              <p className="rounded-2xl bg-slate-50 px-4 py-3 text-slate-700">It is safe to share as an account identifier. It is not a password, login code, or payment PIN.</p>
            </div>
            <button type="button" onClick={() => setPublicIdHelpOpen(false)} className="mt-5 h-12 w-full rounded-2xl bg-slate-950 px-4 text-sm font-black text-white">
              Understood
            </button>
          </section>
        </div>,
        document.body,
      ) : null}

      {creditHelpOpen && typeof document !== "undefined" ? createPortal(
        <div className="fixed inset-0 z-[2147483000] flex items-end justify-center overflow-y-auto bg-slate-950/55 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] backdrop-blur-[2px] sm:items-center" role="presentation" onMouseDown={() => setCreditHelpOpen(false)}>
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="visibility-credit-help-title"
            className="relative max-h-[calc(100dvh-2rem)] w-full max-w-md overflow-y-auto rounded-[28px] border border-sky-100 bg-white p-5 shadow-2xl"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="flex items-start gap-3">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-sky-200 bg-sky-50 text-lg font-black text-sky-700">!</span>
              <div className="min-w-0">
                <p className="text-xs font-black uppercase tracking-[0.18em] text-sky-700">Visibility wallet</p>
                <h2 id="visibility-credit-help-title" className="mt-1 text-xl font-black text-slate-950">How Visibility Credits work</h2>
              </div>
            </div>
            <div className="mt-4 space-y-3 text-sm font-semibold leading-6 text-slate-600">
              <p>Visibility Credits help you boost Explore adverts and UrMall products without a payment method.</p>
              <p>Each verified person who joins KunThai through your invite link earns you 5 credits.</p>
              <p className="rounded-2xl bg-slate-50 px-4 py-3 text-slate-700">Credits are not cash, cannot be withdrawn, and are only used for KunThai visibility boosts.</p>
            </div>
            <button type="button" onClick={() => setCreditHelpOpen(false)} className="mt-5 h-12 w-full rounded-2xl bg-slate-950 px-4 text-sm font-black text-white">
              Understood
            </button>
          </section>
        </div>,
        document.body,
      ) : null}
    </section>
  );
}

function StatTile({ label, loading, value }) {
  return (
    <div className="rounded-2xl bg-slate-50 px-3 py-2">
      {loading ? (
        <div className="mx-auto h-6 w-8 animate-pulse rounded-full bg-slate-200" aria-label={`${label} loading`} />
      ) : (
        <p className="text-lg font-black text-slate-950">{Number(value || 0)}</p>
      )}
      <p className="text-[11px] font-bold text-slate-500">{label}</p>
    </div>
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
