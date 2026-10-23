import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Copy, Link2, QrCode, Share2, X } from "lucide-react";

import useBodyScrollLock from "../useBodyScrollLock";
import { showToast } from "../../../Backend/services/toastService";
import { haptics } from "../../../Backend/services/feedbackService";
import {
  buildDecoratedProfileShareUrl,
  buildProfileShareUrl,
  encodeProfileQr,
  qrModulesPath,
  shareProfileQrImage,
} from "../../../Backend/services/profileShareService";
import { t, useI18n } from "../../../i18n";

// One "Share my profile" sheet for every public profile: an Explore person
// (kind "person") or Space ("space"), a UrMall seller ("seller"), a UrRide
// fleet ("operator") or a UrRide company ("company"). It shows the QR code, the link, and three actions: copy the
// link, share the link, share the QR code as an image. Scanning the QR with
// any phone camera opens the same link, which opens the profile on KunThai.

async function copyText(text) {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return;
    } catch {
      // Some WebViews refuse the clipboard API; fall back to the copy command.
    }
  }
  const input = document.createElement("textarea");
  input.value = text;
  input.setAttribute("readonly", "");
  input.style.position = "fixed";
  input.style.opacity = "0";
  document.body.appendChild(input);
  input.select();
  document.execCommand("copy");
  input.remove();
}

function ProfileQr({ value }) {
  const qr = useMemo(() => (value ? encodeProfileQr(value) : null), [value]);
  if (!qr) return <div className="aspect-square w-full" />;
  const logo = qr.size * 0.22;
  const logoStart = (qr.size - logo) / 2;
  return (
    <svg viewBox={`-2 -2 ${qr.size + 4} ${qr.size + 4}`} className="block aspect-square w-full" role="img" aria-label={t("profileShare.scanCaption")} shapeRendering="crispEdges">
      <rect x="-2" y="-2" width={qr.size + 4} height={qr.size + 4} fill="#ffffff" />
      <path d={qrModulesPath(qr)} fill="#0f172a" />
      <rect x={logoStart - 0.6} y={logoStart - 0.6} width={logo + 1.2} height={logo + 1.2} rx="1.6" fill="#ffffff" />
      <image href="/icons/kunthai-192.png" x={logoStart} y={logoStart} width={logo} height={logo} preserveAspectRatio="xMidYMid slice" />
    </svg>
  );
}

export default function ShareProfileSheet({ open, onClose, kind, profileId, name = "", subtitle = "", avatarUrl = "" }) {
  useI18n();
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState("");
  // Resolves to the link with the sharer's invite code (kt_ref); every action
  // waits for it so a quick tap never sends a link that cannot credit them.
  const decoratedUrlRef = useRef(null);
  useBodyScrollLock(open);

  useEffect(() => {
    if (!open || !kind || !profileId) return undefined;
    let alive = true;
    setUrl(buildProfileShareUrl(kind, profileId));
    decoratedUrlRef.current = buildDecoratedProfileShareUrl(kind, profileId).then((decorated) => {
      if (alive && decorated) setUrl(decorated);
      return decorated;
    });
    return () => {
      alive = false;
    };
  }, [kind, open, profileId]);

  useEffect(() => {
    if (!open) return undefined;
    const handleKey = (event) => {
      if (event.key === "Escape") onClose?.();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose, open]);

  if (!open) return null;

  const shareText = t("profileShare.shareText", { name: name || "KunThai" });

  async function shareUrl() {
    return (await decoratedUrlRef.current) || url;
  }

  async function handleCopy() {
    if (!url) return;
    try {
      await copyText(await shareUrl());
      haptics.success();
      showToast(t("profileShare.linkCopied"), "success");
    } catch {
      showToast(t("profileShare.shareFailed"), "danger");
    }
  }

  async function handleShareLink() {
    if (!url || busy) return;
    haptics.light();
    try {
      const link = await shareUrl();
      if (navigator.share) {
        await navigator.share({ title: name || "KunThai", text: shareText, url: link });
      } else {
        await handleCopy();
      }
    } catch (error) {
      if (error?.name !== "AbortError") showToast(t("profileShare.shareFailed"), "danger");
    }
  }

  async function handleShareQr() {
    if (!url || busy) return;
    haptics.light();
    setBusy("qr");
    try {
      const link = await shareUrl();
      await shareProfileQrImage({ url: link, title: name || "KunThai", caption: t("profileShare.scanCaption"), text: `${shareText}\n${link}` });
    } catch {
      showToast(t("profileShare.shareFailed"), "danger");
    } finally {
      setBusy("");
    }
  }

  return createPortal(
    <div className="fixed inset-0 z-[1400]" role="presentation">
      <button
        type="button"
        aria-label={t("profileShare.close")}
        onClick={onClose}
        className="kt-detail-backdrop-enter absolute inset-0 bg-slate-950/40 backdrop-blur-[2px]"
      />
      <section
        role="dialog"
        aria-modal="true"
        aria-label={t("profileShare.sheetTitle")}
        className="kt-seller-action-menu-enter absolute inset-x-3 bottom-[max(0.75rem,env(safe-area-inset-bottom))] mx-auto max-h-[calc(100dvh-1.5rem)] max-w-md overflow-y-auto rounded-[28px] border border-white/80 bg-white p-4 shadow-2xl"
      >
        <div className="flex items-center gap-3">
          {avatarUrl ? (
            <img src={avatarUrl} alt="" className="h-11 w-11 shrink-0 rounded-2xl object-cover" />
          ) : (
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-emerald-50 text-emerald-700">
              <QrCode size={20} />
            </span>
          )}
          <div className="min-w-0 flex-1">
            <p className="text-xs font-black uppercase tracking-[0.16em] text-emerald-700">{t("profileShare.sheetTitle")}</p>
            <h3 className="truncate text-base font-black text-gray-950">{name || "KunThai"}</h3>
            {subtitle ? <p className="truncate text-xs font-bold text-gray-500">{subtitle}</p> : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t("profileShare.close")}
            className="kt-touchable grid h-10 w-10 shrink-0 place-items-center rounded-full bg-gray-100 text-gray-600"
          >
            <X size={18} />
          </button>
        </div>

        {/* Always black on white so every camera can read it, in dark mode too. */}
        <div className="mx-auto mt-4 w-full max-w-[260px] rounded-3xl p-4 shadow-inner" style={{ background: "#ffffff", border: "1px solid #e2e8f0" }}>
          <ProfileQr value={url} />
          <p className="mt-3 text-center text-xs font-black" style={{ color: "#475569" }}>{t("profileShare.scanCaption")}</p>
        </div>

        <button
          type="button"
          onClick={handleCopy}
          className="kt-pressable mt-4 flex w-full items-center gap-3 rounded-2xl border border-gray-200 bg-gray-50 px-3 py-3 text-left"
        >
          <Link2 size={18} className="shrink-0 text-gray-500" />
          <span className="min-w-0 flex-1 truncate text-xs font-bold text-gray-600">{url}</span>
          <span className="flex shrink-0 items-center gap-1 text-xs font-black text-emerald-700">
            <Copy size={14} />
            {t("profileShare.copyLink")}
          </span>
        </button>

        <div className="mt-3 grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={handleShareLink}
            disabled={!url}
            className="kt-pressable flex h-12 items-center justify-center gap-2 rounded-2xl bg-emerald-600 px-3 text-sm font-black text-white disabled:opacity-60"
          >
            <Share2 size={17} />
            {t("profileShare.shareLink")}
          </button>
          <button
            type="button"
            onClick={handleShareQr}
            disabled={!url || busy === "qr"}
            className="kt-pressable flex h-12 items-center justify-center gap-2 rounded-2xl bg-slate-900 px-3 text-sm font-black text-white disabled:opacity-60"
          >
            <QrCode size={17} />
            {busy === "qr" ? t("profileShare.preparing") : t("profileShare.shareQr")}
          </button>
        </div>
      </section>
    </div>,
    document.body,
  );
}
