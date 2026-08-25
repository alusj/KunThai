import {
  HiOutlineArchiveBox,
  HiOutlineArrowLeft,
  HiOutlineArrowTopRightOnSquare,
  HiOutlineBuildingOffice2,
  HiOutlineCheckBadge,
  HiOutlineChatBubbleLeftRight,
  HiOutlineClipboardDocument,
  HiOutlineCreditCard,
  HiOutlineDevicePhoneMobile,
  HiOutlineEllipsisHorizontal,
  HiOutlineFlag,
  HiOutlineGift,
  HiOutlineInformationCircle,
  HiOutlineNoSymbol,
  HiOutlinePencilSquare,
  HiOutlinePhoto,
  HiOutlineShare,
  HiOutlineUserPlus,
  HiOutlineUserMinus,
} from "react-icons/hi2";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { FaFacebookF, FaInstagram, FaTiktok, FaTwitter, FaWhatsapp, FaYoutube } from "react-icons/fa";

import { normalizeSocialLinks } from "../../../../Backend/services/explore/socialLinks";
import { resizedImageUrl } from "../../../../Backend/lib/imageProxy";
import { getKunThaiPublicUserId } from "../../../../Backend/services/identityCodeService";
import {
  fetchVisibilityCreditPackages,
  startFlutterwaveCardPurchase,
  startMonimeMobileMoneyPurchase,
  monimeWalletName,
  pollMonimePaymentStatus,
  MONIME_MIN_CREDITS,
  monimeCustomPriceMinor,
  CARD_MIN_CREDITS,
  cardCustomUsdPriceMinor,
} from "../../../../Backend/services/visibilityCreditService";
import { showToast } from "../../../../Backend/services/toastService";
import { t } from "../../../../i18n";
import CenteredModal from "../../../shared/CenteredModal";
import Avatar from "../../shared/Avatar";
import ShareVisibilityCreditsModal from "./ShareVisibilityCreditsModal";
import { t as i18nText } from "../../../../i18n/index";

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
  currentUserId = "",
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
  onLookupCreditRecipient,
  onReport,
  onShare,
  onShareCredits,
  onTransferCredits,
  loadingStats = false,
  saving,
  stats,
  values,
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [copiedPublicId, setCopiedPublicId] = useState(false);
  const [creditHelpOpen, setCreditHelpOpen] = useState(false);
  const [creditMenuOpen, setCreditMenuOpen] = useState(false);
  const [creditMenuPlacement, setCreditMenuPlacement] = useState("bottom");
  const [shareCreditOpen, setShareCreditOpen] = useState(false);
  const [buyCreditsOpen, setBuyCreditsOpen] = useState(false);
  const [buyCreditsMethod, setBuyCreditsMethod] = useState("");
  const [creditPackages, setCreditPackages] = useState([]);
  const [creditPackagesLoading, setCreditPackagesLoading] = useState(false);
  const [cardCheckoutPackageId, setCardCheckoutPackageId] = useState("");
  const [cardCheckoutError, setCardCheckoutError] = useState("");
  const [cardCustomCredits, setCardCustomCredits] = useState("");
  const [momoProvider, setMomoProvider] = useState("orange");
  // Every label, error and toast in this flow names the wallet the customer
  // actually picked, so Afrimoney never reads as "Orange Money".
  const momoWalletName = monimeWalletName(momoProvider);
  const [momoCustomCredits, setMomoCustomCredits] = useState("");
  const [momoPhone, setMomoPhone] = useState("");
  const [momoBusy, setMomoBusy] = useState(false);
  const [momoError, setMomoError] = useState("");
  // "select" (choosing amount + phone) -> "waiting" (approve on phone, polling
  // for confirmation) -> the sheet closes itself the moment it's confirmed.
  const [momoStage, setMomoStage] = useState("select");
  const [momoPending, setMomoPending] = useState(null); // { purchaseId, ussdCode, credits, expireTime, phoneNumber }
  const [momoSecondsLeft, setMomoSecondsLeft] = useState(null);
  const [momoCodeCopied, setMomoCodeCopied] = useState(false);
  const momoPollRef = useRef(null);
  const [publicIdHelpOpen, setPublicIdHelpOpen] = useState(false);
  const menuRef = useRef(null);
  const creditMenuRef = useRef(null);
  const creditMenuButtonRef = useRef(null);
  const creditMenuPanelRef = useRef(null);
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
    if (!creditMenuOpen) return undefined;

    function handlePointerDown(event) {
      if (!creditMenuRef.current?.contains(event.target)) {
        setCreditMenuOpen(false);
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [creditMenuOpen]);

  useEffect(() => {
    return () => {
      if (momoPollRef.current) window.clearTimeout(momoPollRef.current);
    };
  }, []);

  useEffect(() => {
    if (!buyCreditsOpen || (buyCreditsMethod !== "card" && buyCreditsMethod !== "mobile-money")) return undefined;
    let active = true;
    setCreditPackagesLoading(true);
    setCardCheckoutError("");
    fetchVisibilityCreditPackages()
      .then((packages) => {
        if (active) setCreditPackages(packages);
      })
      .catch((error) => {
        if (active) setCardCheckoutError(error.message || t("profile.unableLoadCreditPackages"));
      })
      .finally(() => {
        if (active) setCreditPackagesLoading(false);
      });
    return () => {
      active = false;
    };
  }, [buyCreditsMethod, buyCreditsOpen]);

  useLayoutEffect(() => {
    if (!creditMenuOpen) return undefined;

    function placeCreditMenu() {
      const trigger = creditMenuButtonRef.current?.getBoundingClientRect();
      const panel = creditMenuPanelRef.current?.getBoundingClientRect();
      if (!trigger || !panel) return;

      const edgeGap = 16;
      const roomBelow = window.innerHeight - trigger.bottom - edgeGap;
      const roomAbove = trigger.top - edgeGap;
      setCreditMenuPlacement(panel.height > roomBelow && roomAbove > roomBelow ? "top" : "bottom");
    }

    placeCreditMenu();
    window.addEventListener("resize", placeCreditMenu);
    window.addEventListener("scroll", placeCreditMenu, true);
    return () => {
      window.removeEventListener("resize", placeCreditMenu);
      window.removeEventListener("scroll", placeCreditMenu, true);
    };
  }, [creditMenuOpen]);

  useEffect(() => {
    if (!publicIdHelpOpen && !creditHelpOpen && !creditMenuOpen) return undefined;
    function handleKeyDown(event) {
      if (event.key === "Escape") {
        setPublicIdHelpOpen(false);
        setCreditHelpOpen(false);
        setCreditMenuOpen(false);
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [creditHelpOpen, creditMenuOpen, publicIdHelpOpen]);

  function runMenuAction(action) {
    setMenuOpen(false);
    action?.();
  }

  function openBuyCredits() {
    setBuyCreditsMethod("");
    setBuyCreditsOpen(true);
  }

  function closeBuyCredits() {
    stopMomoPolling();
    setBuyCreditsOpen(false);
    setBuyCreditsMethod("");
    setCardCheckoutPackageId("");
    setCardCheckoutError("");
    setMomoStage("select");
    setMomoPending(null);
    setMomoError("");
  }

  async function startCardCheckout({ packageId, credits } = {}) {
    try {
      setCardCheckoutPackageId(packageId || "custom");
      setCardCheckoutError("");
      const result = await startFlutterwaveCardPurchase(packageId ? { packageId } : { credits });
      window.location.assign(result.checkoutUrl);
    } catch (error) {
      setCardCheckoutPackageId("");
      setCardCheckoutError(error.message || t("profile.unableOpenCardCheckout"));
    }
  }

  // Tap-to-dial link for a USSD string. The "#" has to be percent-encoded or
  // the dialler silently drops everything after it.
  function ussdDialHref(code) {
    return `tel:${String(code || "").replace(/#/g, "%23")}`;
  }

  function formatCountdown(totalSeconds) {
    const safe = Math.max(0, Math.floor(Number(totalSeconds) || 0));
    return `${String(Math.floor(safe / 60)).padStart(2, "0")}:${String(safe % 60).padStart(2, "0")}`;
  }

  const stopMomoPollingRef = useRef(null);

  // Count the payment code down to its Monime expiry. When it runs out the code
  // is dead, so polling stops and the customer is told to start again rather
  // than left watching a spinner forever.
  useEffect(() => {
    if (momoStage !== "waiting" || !momoPending?.expireTime) {
      setMomoSecondsLeft(null);
      return undefined;
    }

    const expiresAt = new Date(momoPending.expireTime).getTime();
    if (!Number.isFinite(expiresAt)) {
      setMomoSecondsLeft(null);
      return undefined;
    }

    let expired = false;
    const tick = () => {
      const remaining = Math.max(0, Math.round((expiresAt - Date.now()) / 1000));
      setMomoSecondsLeft(remaining);
      if (remaining === 0 && !expired) {
        expired = true;
        stopMomoPollingRef.current?.();
      }
    };

    tick();
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, [momoStage, momoPending?.expireTime]);

  function stopMomoPolling() {
    if (momoPollRef.current) {
      window.clearTimeout(momoPollRef.current);
      momoPollRef.current = null;
    }
  }

  // The code has expired: nothing more can confirm this purchase, so stop
  // polling and say so instead of spinning indefinitely.
  function expireMomoPayment() {
    stopMomoPolling();
    setMomoBusy(false);
    setMomoError("This payment code expired. Start again to get a new one.");
  }

  stopMomoPollingRef.current = expireMomoPayment;

  // Poll the purchase status while the customer approves the mobile money
  // prompt on their phone. Stops on success, terminal failure, or timeout.
  function pollMomoStatus(purchaseId, attempt = 0) {
    const MAX_ATTEMPTS = 40; // ~2 minutes at the cadence below
    pollMonimePaymentStatus(purchaseId)
      .then((result) => {
        window.dispatchEvent(new CustomEvent("kuntai-visibility-credits-updated"));
        showToast(`${Number(result.credits || 0)} Visibility Credits added.`, "success", {
          title: result.walletName || momoWalletName,
        });
        setMomoStage("select");
        setMomoPending(null);
        setMomoBusy(false);
        closeBuyCredits();
      })
      .catch((error) => {
        if (error.pending && attempt < MAX_ATTEMPTS) {
          momoPollRef.current = window.setTimeout(() => pollMomoStatus(purchaseId, attempt + 1), 3000);
          return;
        }
        setMomoBusy(false);
        setMomoStage("select");
        setMomoError(
          error.pending
            ? "This is taking longer than expected. Check your phone, or try again."
            : error.message || `${momoWalletName} couldn't confirm this payment. Please try again.`,
        );
      });
  }

  async function startMonimeCheckout({ packageId, credits } = {}) {
    if (momoBusy) return;
    // The number is optional: with one, Monime pushes an approval prompt to it;
    // without one, the customer dials the USSD code shown on the next screen.
    const phoneNumber = momoPhone.replace(/[^\d]/g, "");
    if (phoneNumber && phoneNumber.replace(/^(232|0)/, "").length !== 8) {
      setMomoError("Enter a valid Sierra Leone number, or leave it blank to pay by code.");
      return;
    }
    try {
      setMomoBusy(true);
      setMomoError("");
      const result = await startMonimeMobileMoneyPurchase(
        packageId
          ? { packageId, phoneNumber, wallet: momoProvider }
          : { credits, phoneNumber, wallet: momoProvider },
      );
      setMomoPending({
        purchaseId: result.purchaseId,
        ussdCode: result.ussdCode || "",
        credits: result.credits,
        expireTime: result.expireTime || "",
        phoneNumber: result.phoneNumber || "",
      });
      setMomoStage("waiting");
      pollMomoStatus(result.purchaseId);
    } catch (error) {
      setMomoBusy(false);
      setMomoError(error.message || `${momoWalletName} couldn't start this payment. Please try again.`);
    }
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
                {t(`profile.coverPreset${preset[0].toUpperCase()}${preset.slice(1)}`)}
              </button>
            ))}
            <button
              type="button"
              onClick={() => coverInputRef.current?.click()}
              className="rounded-full bg-slate-950 px-3 py-1 text-xs font-semibold text-white shadow-sm"
            >
              {t("profile.uploadCover")}
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
              aria-label={editable && editing ? t("profile.changeProfileImage") : t("profile.profileImage")}
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
                {t("profile.photo")}
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
                      title={link.label || t("profile.socialProfile")}
                      aria-label={link.label || t("profile.socialProfile")}
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
                  {editing ? (saving ? t("profile.saving") : t("profile.save")) : t("profile.edit")}
                </button>
              ) : (
                <>
                  {!followed ? (
                    <button
                      type="button"
                      onClick={onFollow}
                    className="h-10 rounded-2xl bg-slate-950 px-4 text-sm font-semibold text-white"
                  >
                      {t("feed.connect")}
                    </button>
                  ) : null}
                  <button
                    type="button"
                    onClick={onMessage}
                    className="flex h-10 w-10 items-center justify-center rounded-2xl bg-sky-50 text-sky-700"
                    aria-label={t("profile.messageProfile")}
                  >
                    <HiOutlineChatBubbleLeftRight />
                  </button>
                </>
              )}
              <button
                type="button"
                onClick={() => setMenuOpen((current) => !current)}
                className="flex h-10 w-10 items-center justify-center rounded-2xl bg-slate-100 text-xl text-slate-700"
                aria-label={t("profile.openActions")}
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
                    {t("post.removeConnection")}
                  </button>
                ) : null}
                {editable && !isSpace && typeof onCreateSpace === "function" ? (
                  <button
                    type="button"
                    onClick={() => runMenuAction(onCreateSpace)}
                    className="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left text-slate-700 hover:bg-slate-100"
                  >
                    <HiOutlineBuildingOffice2 className="text-lg" />
                    {t("profile.createSpace")}
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={() => runMenuAction(onShare)}
                  className="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left text-slate-700 hover:bg-slate-100"
                >
                  <HiOutlineArrowTopRightOnSquare className="text-lg" />
                  {isSpace ? t("profile.shareSpace") : t("profile.shareProfile")}
                </button>
                {!editable ? (
                  <>
                    <button
                      type="button"
                      onClick={() => runMenuAction(onReport)}
                      className="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left text-slate-700 hover:bg-slate-100"
                    >
                    <HiOutlineFlag className="text-lg" />
                      {isSpace ? t("profile.reportSpace") : t("profile.reportProfile")}
                    </button>
                    <button
                      type="button"
                      onClick={() => runMenuAction(onBlock)}
                      className="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left text-rose-700 hover:bg-rose-50"
                    >
                    <HiOutlineNoSymbol className="text-lg" />
                      {isSpace ? t("profile.blockSpace") : t("profile.blockProfile")}
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={() => runMenuAction(onShare)}
                    className="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left text-slate-700 hover:bg-slate-100"
                  >
                    <HiOutlineArchiveBox className="text-lg" />
                    {isSpace ? t("profile.copySpaceLink") : t("profile.copyPublicProfile")}
                  </button>
                )}
              </div>
            ) : null}
          </div>
        </div>

        <div className="mt-3 min-w-0">
          <div className="flex min-w-0 items-center gap-2">
            <h3 className="truncate text-2xl font-semibold text-slate-950">{values.displayName || t("feed.profileFallback")}</h3>
            {values.verified ? <HiOutlineCheckBadge className="flex-none text-xl text-sky-600" /> : null}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            {values.username ? <p className="text-sm font-bold text-slate-500">@{values.username}</p> : null}
            {isSpace ? (
              <span className="rounded-full bg-sky-50 px-2.5 py-1 text-[11px] font-black uppercase tracking-[0.12em] text-sky-700">
                {t("profile.aSpace")}
              </span>
            ) : null}
            {isSpace && values.categoryLabel ? (
              <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-black text-slate-600">
                {values.categoryLabel}
              </span>
            ) : null}
          </div>
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, ease: "easeOut" }}
            className="mt-3 flex w-fit max-w-full items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2.5"
          >
            <span className="min-w-0 shrink-0 text-xs font-black uppercase tracking-wide text-slate-500">
              {isSpace ? t("profile.spaceIdLabel") : t("profile.kunthaiIdLabel")}
            </span>
            <span className="min-w-0 flex-1 truncate text-sm font-black text-slate-950">{publicUserId}</span>
            <motion.button
              type="button"
              onClick={copyPublicUserId}
              whileHover={{ scale: 1.08 }}
              whileTap={{ scale: 0.92 }}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white text-slate-700 shadow-sm hover:text-sky-700"
              aria-label={t("profile.copyId")}
              title={t("profile.copyId")}
            >
              <HiOutlineClipboardDocument />
            </motion.button>
            <motion.button
              type="button"
              onClick={() => setPublicIdHelpOpen(true)}
              whileHover={{ scale: 1.12, rotate: 6 }}
              whileTap={{ scale: 0.9 }}
              transition={{ type: "spring", stiffness: 400, damping: 15 }}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-sky-500 to-sky-700 text-sm font-black text-white shadow-md shadow-sky-500/30"
              aria-label={t("profile.whyId")}
              title={t("profile.aboutId")}
            >
              ?
            </motion.button>
            {copiedPublicId ? <span className="shrink-0 text-xs font-black text-sky-700">{t("profile.copied")}</span> : null}
          </motion.div>

          {showVisibilityCredits ? (
            <motion.div
              initial={{ opacity: 0, y: 14, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ duration: 0.4, ease: "easeOut", delay: 0.05 }}
              className="kt-visibility-credit-card mt-3 w-full max-w-2xl rounded-[22px] border border-sky-200 bg-gradient-to-br from-sky-50 to-white p-4 shadow-sm"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs font-black uppercase tracking-[0.16em] text-sky-700">Visibility Credits</p>
                  <p className="mt-1 flex items-baseline gap-1.5">
                    <span className="text-3xl font-black leading-none text-slate-950">
                      {creditLoading ? "…" : Number(creditWallet.balance || 0)}
                    </span>
                    <span className="text-xs font-bold text-slate-500">{t("profile.available")}</span>
                  </p>
                </div>
                <div ref={creditMenuRef} className="relative">
                  <motion.button
                    ref={creditMenuButtonRef}
                    type="button"
                    onClick={() => setCreditMenuOpen((current) => !current)}
                    whileHover={{ scale: 1.08 }}
                    whileTap={{ scale: 0.92 }}
                    transition={{ type: "spring", stiffness: 400, damping: 18 }}
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-sky-500 to-sky-700 text-xl text-white shadow-md shadow-sky-500/30"
                    aria-label={t("profile.openCreditActions")}
                    aria-expanded={creditMenuOpen}
                    aria-haspopup="menu"
                  >
                    <HiOutlineEllipsisHorizontal />
                  </motion.button>
                  <AnimatePresence>
                    {creditMenuOpen ? (
                      <motion.div
                        ref={creditMenuPanelRef}
                        initial={{ opacity: 0, y: creditMenuPlacement === "top" ? 8 : -8, scale: 0.96 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: creditMenuPlacement === "top" ? 6 : -6, scale: 0.97 }}
                        transition={{ type: "spring", stiffness: 420, damping: 30 }}
                        role="menu"
                        className={`absolute right-0 z-30 w-60 overflow-hidden rounded-2xl border border-sky-100 bg-white p-2 text-sm font-semibold shadow-2xl shadow-slate-950/15 ${
                          creditMenuPlacement === "top" ? "bottom-full mb-2" : "top-full mt-2"
                        }`}
                      >
                        <CreditMenuAction
                          icon={HiOutlineShare}
                          label={t("profile.shareKunThai")}
                          helper={t("profile.inviteSomeone")}
                          onClick={() => {
                            setCreditMenuOpen(false);
                            onShareCredits?.();
                          }}
                        />
                        <CreditMenuAction
                          icon={HiOutlineGift}
                          label={t("profile.shareCredit")}
                          helper={t("profile.sendCreditsById")}
                          onClick={() => {
                            setCreditMenuOpen(false);
                            setShareCreditOpen(true);
                          }}
                        />
                        <CreditMenuAction
                          icon={HiOutlineUserPlus}
                          label={t("buyCredits.button")}
                          helper={t("profile.addToBalance")}
                          onClick={() => {
                            setCreditMenuOpen(false);
                            openBuyCredits();
                          }}
                        />
                        <div className="my-1 border-t border-slate-100" />
                        <CreditMenuAction
                          icon={HiOutlineInformationCircle}
                          label={t("profile.aboutCreditsAction")}
                          onClick={() => {
                            setCreditMenuOpen(false);
                            setCreditHelpOpen(true);
                          }}
                        />
                      </motion.div>
                    ) : null}
                  </AnimatePresence>
                </div>
              </div>
            </motion.div>
          ) : null}
          {values.bio ? <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600">{values.bio}</p> : null}

          <div className="mt-4 grid grid-cols-4 gap-2 text-center">
            <StatTile label={t("profile.tabFeed")} value={stats?.feed} loading={loadingStats} />
            <StatTile label="Swip" value={stats?.swip} loading={loadingStats} />
            <StatTile label={t("profile.statConnections")} value={stats?.followers} loading={loadingStats} />
            <StatTile label={isSpace ? t("profile.statTeam") : t("profile.statConnected")} value={isSpace ? stats?.team : stats?.following} loading={loadingStats} />
          </div>

          {feedback ? <p className="mt-3 text-xs font-bold text-sky-700">{feedback}</p> : null}
        </div>
      </div>

      <CenteredModal open={publicIdHelpOpen} onClose={() => setPublicIdHelpOpen(false)} labelledBy="kunthai-id-help-title">
        <div className="flex items-start gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-sky-500 to-sky-700 text-lg font-black text-white shadow-md shadow-sky-500/30">?</span>
          <div className="min-w-0">
            <p className="text-xs font-black uppercase tracking-[0.18em] text-sky-700">{t("profile.uniqueCode")}</p>
            <h2 id="kunthai-id-help-title" className="mt-1 text-xl font-black text-slate-950">{t("profile.whyIdMatters")}</h2>
          </div>
        </div>
        <div className="mt-4 space-y-3 text-sm font-semibold leading-6 text-slate-600">
          <p>{t("profile.idExplain1")}</p>
          <p>{t("profile.idExplain2")}</p>
          <p className="rounded-2xl bg-slate-50 px-4 py-3 text-slate-700">{t("profile.idExplain3")}</p>
        </div>
        <button type="button" onClick={() => setPublicIdHelpOpen(false)} className="mt-5 h-12 w-full rounded-2xl bg-slate-950 px-4 text-sm font-black text-white">
          {t("profile.understood")}
        </button>
      </CenteredModal>

      <CenteredModal open={buyCreditsOpen} onClose={closeBuyCredits} labelledBy="buy-credits-title">
        <AnimatePresence mode="wait" initial={false}>
          {!buyCreditsMethod ? (
            <motion.div
              key="buy-credit-methods"
              initial={{ opacity: 0, x: -24, scale: 0.98 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, x: -24, scale: 0.98 }}
              transition={{ type: "spring", stiffness: 360, damping: 28 }}
            >
              <div className="flex items-start gap-3">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-sky-500 to-sky-700 text-white shadow-md shadow-sky-500/30">
                  <HiOutlineUserPlus className="text-2xl" />
                </span>
                <div className="min-w-0">
                  <p className="text-xs font-black uppercase tracking-[0.18em] text-sky-700">Visibility Credits</p>
                  <h2 id="buy-credits-title" className="mt-1 text-xl font-black text-slate-950">{t("buyCredits.title")}</h2>
                  <p className="mt-1 text-sm font-semibold text-slate-500">{t("profile.choosePaymentMethod")}</p>
                </div>
              </div>
              <div className="mt-5 space-y-3">
                <PaymentMethodButton
                  icon={HiOutlineCreditCard}
                  label={t("profile.buyWithCard")}
                  helper={t("profile.paySecurelyByCard")}
                  onClick={() => setBuyCreditsMethod("card")}
                />
                <PaymentMethodButton
                  icon={HiOutlineDevicePhoneMobile}
                  label={t("profile.buyWithMobileMoney")}
                  helper={t("profile.useMobileMoney")}
                  onClick={() => setBuyCreditsMethod("mobile-money")}
                />
              </div>
              <button type="button" onClick={closeBuyCredits} className="mt-3 h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm font-black text-slate-700">
                {t("common.close")}
              </button>
            </motion.div>
          ) : buyCreditsMethod === "card" ? (
            <motion.div
              key="buy-credit-card-packages"
              initial={{ opacity: 0, x: 28, scale: 0.98 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, x: 28, scale: 0.98 }}
              transition={{ type: "spring", stiffness: 360, damping: 28 }}
            >
              <div className="flex items-start gap-3">
                <button
                  type="button"
                  onClick={() => setBuyCreditsMethod("")}
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xl text-slate-700 transition hover:bg-sky-50 hover:text-sky-700"
                  aria-label={t("profile.chooseAnotherPaymentMethod")}
                >
                  <HiOutlineArrowLeft />
                </button>
                <div className="min-w-0">
                  <p className="text-xs font-black uppercase tracking-[0.18em] text-sky-700">{t("profile.creditCard")}</p>
                  <h2 id="buy-credits-title" className="mt-1 text-xl font-black text-slate-950">{t("profile.chooseCreditPackage")}</h2>
                </div>
              </div>

              <div className="mt-5 space-y-3">
                {creditPackagesLoading ? (
                  <div className="space-y-3" aria-label={t("profile.loadingCreditPackages")}>
                    {[1, 2, 3].map((item) => <div key={item} className="h-[74px] animate-pulse rounded-2xl bg-slate-100" />)}
                  </div>
                ) : creditPackages.filter((pkg) => pkg.usdPriceMinor > 0).length ? (
                  creditPackages.filter((pkg) => pkg.usdPriceMinor > 0).map((item) => {
                    const opening = cardCheckoutPackageId === item.id;
                    return (
                      <motion.button
                        key={item.id}
                        type="button"
                        onClick={() => startCardCheckout({ packageId: item.id })}
                        disabled={Boolean(cardCheckoutPackageId)}
                        whileHover={{ y: -2, scale: 1.01 }}
                        whileTap={{ scale: 0.98 }}
                        className="flex w-full items-center gap-3 rounded-2xl border border-sky-100 bg-gradient-to-r from-sky-50 to-white p-4 text-left shadow-sm transition hover:border-sky-300 disabled:cursor-wait disabled:opacity-65"
                      >
                        <span className="grid h-11 min-w-11 shrink-0 place-items-center rounded-2xl bg-sky-700 px-2 text-sm font-black text-white">
                          {item.credits}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-black text-slate-950">{item.label}</span>
                          <span className="mt-0.5 block text-xs font-semibold text-slate-500">{t("profile.creditCount", { count: item.credits })}</span>
                        </span>
                        <span className="shrink-0 text-sm font-black text-sky-800">
                          {opening ? t("profile.openingCheckout") : formatPackagePrice({ priceMinor: item.usdPriceMinor, currency: "USD" })}
                        </span>
                      </motion.button>
                    );
                  })
                ) : (
                  <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4 text-sm font-semibold leading-6 text-amber-900">
                    {t("profile.creditPackagesUnavailable")}
                  </div>
                )}

                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <label className="block text-xs font-black uppercase tracking-wide text-slate-500">Custom amount (min {CARD_MIN_CREDITS})</label>
                  <div className="mt-2 flex items-center gap-2">
                    <input
                      inputMode="numeric"
                      value={cardCustomCredits}
                      onChange={(event) => setCardCustomCredits(event.target.value.replace(/[^\d]/g, ""))}
                      placeholder={String(CARD_MIN_CREDITS)}
                      className="h-11 w-24 rounded-xl border border-slate-200 bg-white px-3 text-sm font-black text-slate-950"
                    />
                    <span className="min-w-0 flex-1 truncate text-xs font-bold text-slate-500">
                      {Number(cardCustomCredits) >= CARD_MIN_CREDITS
                        ? `${Number(cardCustomCredits)} credits · ${formatPackagePrice({ priceMinor: cardCustomUsdPriceMinor(cardCustomCredits), currency: "USD" })}`
                        : "credits"}
                    </span>
                    <button
                      type="button"
                      disabled={Boolean(cardCheckoutPackageId) || Number(cardCustomCredits) < CARD_MIN_CREDITS}
                      onClick={() => startCardCheckout({ credits: Number(cardCustomCredits) })}
                      className="h-11 shrink-0 rounded-xl bg-sky-700 px-4 text-sm font-black text-white transition hover:bg-sky-800 disabled:opacity-50"
                    >
                      {cardCheckoutPackageId === "custom" ? t("profile.openingCheckout") : "Continue"}
                    </button>
                  </div>
                </div>
              </div>

              {cardCheckoutError ? (
                <p role="alert" className="mt-3 rounded-2xl bg-rose-50 px-4 py-3 text-sm font-bold text-rose-700">{cardCheckoutError}</p>
              ) : null}
              <div className="mt-4 flex items-center justify-center gap-2 text-xs font-bold text-slate-500">
                <HiOutlineCreditCard className="text-base text-sky-700" />
                {t("profile.cardDetailsPrivacy")}
              </div>
              <button type="button" onClick={closeBuyCredits} disabled={Boolean(cardCheckoutPackageId)} className="mt-3 h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm font-black text-slate-700 disabled:opacity-50">
                {t("common.close")}
              </button>
            </motion.div>
          ) : buyCreditsMethod === "mobile-money" && momoStage === "waiting" ? (
            <motion.div
              key="buy-credit-mobile-money-waiting"
              initial={{ opacity: 0, x: 28, scale: 0.98 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, x: 28, scale: 0.98 }}
              transition={{ type: "spring", stiffness: 360, damping: 28 }}
              className="py-2 text-center"
            >
              <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-orange-50 text-orange-600">
                <span className="h-9 w-9 animate-spin rounded-full border-[3px] border-orange-200 border-t-orange-600" aria-hidden="true" />
              </span>
              <h2 className="mt-4 text-xl font-black text-slate-950">
                {momoPending?.phoneNumber ? "Approve on your phone" : `Pay with ${momoWalletName}`}
              </h2>
              <p className="mt-2 text-sm font-semibold leading-6 text-slate-500">
                {momoPending?.phoneNumber
                  ? <>We sent a {momoWalletName} prompt to <span className="font-black text-slate-800">{momoPending.phoneNumber}</span>. Enter your PIN there to confirm{momoPending?.credits ? ` ${momoPending.credits} Visibility Credits` : ""}.</>
                  : <>Tap the code below to dial it, then enter your PIN to confirm{momoPending?.credits ? ` ${momoPending.credits} Visibility Credits` : ""}.</>}
              </p>

              {momoPending?.ussdCode ? (
                <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  {momoPending?.phoneNumber ? (
                    <p className="text-xs font-black uppercase tracking-[0.14em] text-slate-400">Didn’t get the prompt?</p>
                  ) : null}
                  <a
                    href={ussdDialHref(momoPending.ussdCode)}
                    className={`flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-slate-900 px-4 text-base font-black tracking-wide text-white transition hover:bg-slate-800 ${
                      momoPending?.phoneNumber ? "mt-2" : ""
                    } ${momoSecondsLeft === 0 ? "pointer-events-none opacity-50" : ""}`}
                  >
                    <HiOutlineDevicePhoneMobile className="text-lg" aria-hidden="true" />
                    Dial {momoPending.ussdCode}
                  </a>
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard?.writeText(momoPending.ussdCode);
                      setMomoCodeCopied(true);
                      window.setTimeout(() => setMomoCodeCopied(false), 2000);
                    }}
                    className="mt-2 text-xs font-black text-slate-500 underline decoration-slate-300 underline-offset-2"
                  >
                    {momoCodeCopied ? "Code copied" : "Copy code instead"}
                  </button>
                  {momoSecondsLeft !== null ? (
                    <p className="mt-3 text-xs font-black uppercase tracking-[0.14em] text-slate-400">
                      {momoSecondsLeft === 0 ? "Code expired" : <>Code expires in <span className="text-slate-700">{formatCountdown(momoSecondsLeft)}</span></>}
                    </p>
                  ) : null}
                </div>
              ) : null}
              {momoError ? (
                <p role="alert" className="mt-3 rounded-2xl bg-rose-50 px-4 py-3 text-sm font-bold text-rose-700">{momoError}</p>
              ) : null}
              <button
                type="button"
                onClick={() => {
                  stopMomoPolling();
                  setMomoBusy(false);
                  setMomoStage("select");
                  setMomoPending(null);
                }}
                className="mt-5 h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm font-black text-slate-700"
              >
                Cancel
              </button>
            </motion.div>
          ) : buyCreditsMethod === "mobile-money" ? (
            <motion.div
              key="buy-credit-mobile-money"
              initial={{ opacity: 0, x: 28, scale: 0.98 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, x: 28, scale: 0.98 }}
              transition={{ type: "spring", stiffness: 360, damping: 28 }}
            >
              <div className="flex items-start gap-3">
                <button
                  type="button"
                  onClick={() => { setBuyCreditsMethod(""); setMomoError(""); }}
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xl text-slate-700 transition hover:bg-sky-50 hover:text-sky-700"
                  aria-label={t("profile.chooseAnotherPaymentMethod")}
                >
                  <HiOutlineArrowLeft />
                </button>
                <div className="min-w-0">
                  <p className="text-xs font-black uppercase tracking-[0.18em] text-sky-700">{t("profile.mobileMoney")}</p>
                  <h2 id="buy-credits-title" className="mt-1 text-xl font-black text-slate-950">Choose a wallet</h2>
                </div>
              </div>

              <div className="mt-5 grid grid-cols-2 gap-2.5">
                {[
                  { id: "orange", name: "Orange Money", tone: "bg-orange-500", status: "instant" },
                  { id: "afrimoney", name: "Afrimoney", tone: "bg-rose-600", status: "instant" },
                  { id: "qmoney", name: "QMoney", tone: "bg-emerald-600", status: "soon" },
                  { id: "sieratel", name: "Sieratel Money", tone: "bg-blue-600", status: "soon" },
                ].map((wallet) => {
                  const active = momoProvider === wallet.id;
                  const disabled = wallet.status !== "instant";
                  return (
                    <button
                      key={wallet.id}
                      type="button"
                      disabled={disabled}
                      onClick={() => setMomoProvider(wallet.id)}
                      className={`relative flex flex-col items-start gap-2 rounded-2xl border p-3 text-left transition ${
                        active ? "border-sky-500 bg-sky-50 shadow-sm" : "border-slate-200 bg-white"
                      } ${disabled ? "cursor-not-allowed opacity-60" : "hover:border-sky-300"}`}
                    >
                      <span className={`grid h-9 w-9 place-items-center rounded-xl ${wallet.tone} text-sm font-black text-white`}>
                        {wallet.name.charAt(0)}
                      </span>
                      <span className="block text-sm font-black text-slate-950">{wallet.name}</span>
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-black uppercase tracking-wide ${
                        disabled ? "bg-slate-100 text-slate-500" : "bg-emerald-100 text-emerald-700"
                      }`}>
                        {disabled ? "Coming soon" : "Instant"}
                      </span>
                    </button>
                  );
                })}
              </div>

              <div className="mt-5">
                <label htmlFor="momo-phone" className="block text-xs font-black uppercase tracking-[0.14em] text-slate-400">
                  {momoWalletName} number <span className="text-slate-300">(optional)</span>
                </label>
                <input
                  id="momo-phone"
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel"
                  value={momoPhone}
                  onChange={(event) => setMomoPhone(event.target.value.replace(/[^\d+\s]/g, ""))}
                  placeholder="076 123 456"
                  className="mt-2 h-12 w-full rounded-2xl border border-slate-300 px-4 text-sm font-black text-slate-950 focus:border-orange-400 focus:outline-none"
                />
              </div>

              <div className="mt-5">
                <p className="text-xs font-black uppercase tracking-[0.14em] text-slate-400">Credit amount</p>
                {creditPackagesLoading ? (
                  <div className="mt-3 space-y-3">
                    {[1, 2, 3].map((item) => <div key={item} className="h-[64px] animate-pulse rounded-2xl bg-slate-100" />)}
                  </div>
                ) : (
                  <div className="mt-3 space-y-2.5">
                    {creditPackages.filter((item) => item.currency === "SLE").map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        disabled={momoBusy}
                        onClick={() => startMonimeCheckout({ packageId: item.id })}
                        className="flex w-full items-center gap-3 rounded-2xl border border-orange-100 bg-gradient-to-r from-orange-50 to-white p-3.5 text-left shadow-sm transition hover:border-orange-300 disabled:cursor-wait disabled:opacity-65"
                      >
                        <span className="grid h-10 min-w-10 shrink-0 place-items-center rounded-2xl bg-orange-500 px-2 text-sm font-black text-white">{item.credits}</span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-black text-slate-950">{item.label}</span>
                          <span className="mt-0.5 block text-xs font-semibold text-slate-500">{t("profile.creditCount", { count: item.credits })}</span>
                        </span>
                        <span className="shrink-0 text-sm font-black text-orange-700">{formatPackagePrice(item)}</span>
                      </button>
                    ))}

                    <div className="rounded-2xl border border-slate-200 bg-white p-3.5">
                      <label className="block text-xs font-black uppercase tracking-wide text-slate-500">Custom amount (min {MONIME_MIN_CREDITS})</label>
                      <div className="mt-2 flex items-center gap-2">
                        <input
                          type="number"
                          inputMode="numeric"
                          min={MONIME_MIN_CREDITS}
                          value={momoCustomCredits}
                          onChange={(event) => setMomoCustomCredits(event.target.value.replace(/[^\d]/g, ""))}
                          placeholder={`${MONIME_MIN_CREDITS}`}
                          className="h-11 w-24 rounded-xl border border-slate-300 px-3 text-sm font-black text-slate-950 focus:border-orange-400 focus:outline-none"
                        />
                        <span className="flex-1 text-xs font-semibold text-slate-500">
                          {Number(momoCustomCredits) >= MONIME_MIN_CREDITS
                            ? `${Number(momoCustomCredits)} credits · ${formatPackagePrice({ priceMinor: monimeCustomPriceMinor(momoCustomCredits), currency: "SLE" })}`
                            : "credits"}
                        </span>
                        <button
                          type="button"
                          disabled={momoBusy || Number(momoCustomCredits) < MONIME_MIN_CREDITS}
                          onClick={() => startMonimeCheckout({ credits: Number(momoCustomCredits) })}
                          className="h-11 shrink-0 rounded-xl bg-orange-500 px-4 text-sm font-black text-white transition hover:bg-orange-600 disabled:opacity-50"
                        >
                          {momoBusy ? t("profile.openingCheckout") : "Continue"}
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {momoError ? (
                <p role="alert" className="mt-3 rounded-2xl bg-rose-50 px-4 py-3 text-sm font-bold text-rose-700">{momoError}</p>
              ) : null}
              <div className="mt-4 flex items-center justify-center gap-2 text-xs font-bold text-slate-500">
                <HiOutlineDevicePhoneMobile className="text-base text-orange-600" />
                You’ll approve the payment on your phone. Credits arrive the moment it’s confirmed.
              </div>
              <button type="button" onClick={closeBuyCredits} disabled={momoBusy} className="mt-3 h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm font-black text-slate-700 disabled:opacity-50">
                {t("common.close")}
              </button>
            </motion.div>
          ) : (
            <motion.div
              key={`buy-credit-notice-${buyCreditsMethod}`}
              initial={{ opacity: 0, x: 28, scale: 0.98 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, x: 28, scale: 0.98 }}
              transition={{ type: "spring", stiffness: 360, damping: 28 }}
            >
              <div className="flex items-start gap-3">
                <button
                  type="button"
                  onClick={() => setBuyCreditsMethod("")}
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xl text-slate-700 transition hover:bg-sky-50 hover:text-sky-700"
                  aria-label={t("profile.chooseAnotherPaymentMethod")}
                >
                  <HiOutlineArrowLeft />
                </button>
                <div className="min-w-0">
                  <p className="text-xs font-black uppercase tracking-[0.18em] text-sky-700">
                    {buyCreditsMethod === "card" ? t("profile.creditCard") : t("profile.mobileMoney")}
                  </p>
                  <h2 id="buy-credits-title" className="mt-1 text-xl font-black text-slate-950">{t("buyCredits.title")}</h2>
                </div>
              </div>
              <div className="mt-4 space-y-3 text-sm font-semibold leading-6 text-slate-600">
                <p>{t("buyCredits.working")}</p>
                <p className="rounded-2xl bg-slate-50 px-4 py-3 text-slate-700">{t("buyCredits.earnInstead")}</p>
              </div>
              <button
                type="button"
                onClick={() => {
                  closeBuyCredits();
                  onShareCredits?.();
                }}
                className="mt-5 h-12 w-full rounded-2xl bg-slate-950 px-4 text-sm font-black text-white"
              >
                {t("buyCredits.shareInstead")}
              </button>
              <button type="button" onClick={closeBuyCredits} className="mt-2 h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm font-black text-slate-700">
                {t("common.close")}
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </CenteredModal>

      <CenteredModal open={creditHelpOpen} onClose={() => setCreditHelpOpen(false)} labelledBy="visibility-credit-help-title">
        <div className="flex items-start gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-sky-500 to-sky-700 text-lg font-black text-white shadow-md shadow-sky-500/30">?</span>
          <div className="min-w-0">
            <p className="text-xs font-black uppercase tracking-[0.18em] text-sky-700">{t("profile.visibilityWallet")}</p>
            <h2 id="visibility-credit-help-title" className="mt-1 text-xl font-black text-slate-950">{t("profile.howCreditsWork")}</h2>
          </div>
        </div>
        <div className="mt-4 space-y-3 text-sm font-semibold leading-6 text-slate-600">
          <p>{t("profile.creditsExplain1")}</p>
          <p>{t("profile.creditsExplainMid")}</p>
          <p className="rounded-2xl bg-slate-50 px-4 py-3 text-slate-700">{t("profile.creditsExplain2")}</p>
        </div>
        <button type="button" onClick={() => setCreditHelpOpen(false)} className="mt-5 h-12 w-full rounded-2xl bg-slate-950 px-4 text-sm font-black text-white">
          {t("profile.understood")}
        </button>
      </CenteredModal>

      <ShareVisibilityCreditsModal
        open={shareCreditOpen}
        onClose={() => setShareCreditOpen(false)}
        balance={creditWallet?.balance || 0}
        loading={creditLoading}
        currentUserId={currentUserId}
        onLookup={onLookupCreditRecipient}
        onTransfer={onTransferCredits}
      />
    </section>
  );
}

function CreditMenuAction({ helper = "", icon: Icon, label, onClick }) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-slate-700 transition hover:bg-sky-50 hover:text-sky-800"
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-sky-50 text-lg text-sky-700">
        <Icon />
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-black">{label}</span>
        {helper ? <span className="mt-0.5 block text-[11px] font-semibold text-slate-500">{helper}</span> : null}
      </span>
    </button>
  );
}

function PaymentMethodButton({ helper, icon: Icon, label, onClick }) {
  return (
    <motion.button
      type="button"
      onClick={onClick}
      whileHover={{ y: -2, scale: 1.01 }}
      whileTap={{ scale: 0.98 }}
      transition={{ type: "spring", stiffness: 420, damping: 24 }}
      className="flex w-full items-center gap-4 rounded-2xl border border-sky-100 bg-gradient-to-r from-sky-50 to-white p-4 text-left shadow-sm transition hover:border-sky-300 hover:shadow-md"
    >
      <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-sky-500 to-sky-700 text-2xl text-white shadow-md shadow-sky-500/20">
        <Icon />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-black text-slate-950">{label}</span>
        <span className="mt-1 block text-xs font-semibold text-slate-500">{helper}</span>
      </span>
      <HiOutlineArrowTopRightOnSquare className="shrink-0 text-lg text-sky-700" />
    </motion.button>
  );
}

function formatPackagePrice(item) {
  try {
    const formatter = new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: item.currency,
    });
    const digits = formatter.resolvedOptions().maximumFractionDigits;
    return formatter.format(Number(item.priceMinor || 0) / (10 ** digits));
  } catch {
    return `${item.currency} ${Number(item.priceMinor || 0) / 100}`;
  }
}

function StatTile({ label, loading, value }) {
  return (
    <div className="rounded-2xl bg-slate-50 px-3 py-2">
      {loading ? (
        <div className="mx-auto h-6 w-8 animate-pulse rounded-full bg-slate-200" aria-label={i18nText("ui.literals.k4360a33c8dc2", { value0: label })} />
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
    backgroundImage: `linear-gradient(120deg, rgba(15,23,42,0.08), rgba(255,255,255,0.12)), url("${resizedImageUrl(value, { width: 1080, quality: 72 })}")`,
    backgroundSize: "cover",
    backgroundPosition: "center",
  };
}
