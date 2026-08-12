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
import { getKunThaiPublicUserId } from "../../../../Backend/services/identityCodeService";
import {
  fetchVisibilityCreditPackages,
  startFlutterwaveCardPurchase,
} from "../../../../Backend/services/visibilityCreditService";
import { t } from "../../../../i18n";
import CenteredModal from "../../../shared/CenteredModal";
import Avatar from "../../shared/Avatar";
import ShareVisibilityCreditsModal from "./ShareVisibilityCreditsModal";

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
    if (!buyCreditsOpen || buyCreditsMethod !== "card") return undefined;
    let active = true;
    setCreditPackagesLoading(true);
    setCardCheckoutError("");
    fetchVisibilityCreditPackages()
      .then((packages) => {
        if (active) setCreditPackages(packages);
      })
      .catch((error) => {
        if (active) setCardCheckoutError(error.message || "Unable to load credit packages.");
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
    setBuyCreditsOpen(false);
    setBuyCreditsMethod("");
    setCardCheckoutPackageId("");
    setCardCheckoutError("");
  }

  async function startCardCheckout(packageId) {
    try {
      setCardCheckoutPackageId(packageId);
      setCardCheckoutError("");
      const result = await startFlutterwaveCardPurchase(packageId);
      window.location.assign(result.checkoutUrl);
    } catch (error) {
      setCardCheckoutPackageId("");
      setCardCheckoutError(error.message || "Unable to open secure card checkout.");
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
                    aria-label="Open Visibility Credit actions"
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
                          label="Share KunThai"
                          helper="Invite someone to join"
                          onClick={() => {
                            setCreditMenuOpen(false);
                            onShareCredits?.();
                          }}
                        />
                        <CreditMenuAction
                          icon={HiOutlineGift}
                          label="Share credit"
                          helper="Send credits by KunThai ID"
                          onClick={() => {
                            setCreditMenuOpen(false);
                            setShareCreditOpen(true);
                          }}
                        />
                        <CreditMenuAction
                          icon={HiOutlineUserPlus}
                          label={t("buyCredits.button")}
                          helper="Add to your balance"
                          onClick={() => {
                            setCreditMenuOpen(false);
                            openBuyCredits();
                          }}
                        />
                        <div className="my-1 border-t border-slate-100" />
                        <CreditMenuAction
                          icon={HiOutlineInformationCircle}
                          label="About credits"
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
            <StatTile label="Feed" value={stats?.feed} loading={loadingStats} />
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
                  <p className="mt-1 text-sm font-semibold text-slate-500">Choose how you would like to pay.</p>
                </div>
              </div>
              <div className="mt-5 space-y-3">
                <PaymentMethodButton
                  icon={HiOutlineCreditCard}
                  label="Buy with credit card"
                  helper="Pay securely with your bank card"
                  onClick={() => setBuyCreditsMethod("card")}
                />
                <PaymentMethodButton
                  icon={HiOutlineDevicePhoneMobile}
                  label="Buy with mobile money"
                  helper="Use your mobile money account"
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
                  aria-label="Choose another payment method"
                >
                  <HiOutlineArrowLeft />
                </button>
                <div className="min-w-0">
                  <p className="text-xs font-black uppercase tracking-[0.18em] text-sky-700">Credit card</p>
                  <h2 id="buy-credits-title" className="mt-1 text-xl font-black text-slate-950">Choose a credit package</h2>
                  <p className="mt-1 text-sm font-semibold text-slate-500">You will complete payment securely on Flutterwave.</p>
                </div>
              </div>

              <div className="mt-5 space-y-3">
                {creditPackagesLoading ? (
                  <div className="space-y-3" aria-label="Loading credit packages">
                    {[1, 2, 3].map((item) => <div key={item} className="h-[74px] animate-pulse rounded-2xl bg-slate-100" />)}
                  </div>
                ) : creditPackages.length ? (
                  creditPackages.map((item) => {
                    const opening = cardCheckoutPackageId === item.id;
                    return (
                      <motion.button
                        key={item.id}
                        type="button"
                        onClick={() => startCardCheckout(item.id)}
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
                          <span className="mt-0.5 block text-xs font-semibold text-slate-500">{item.credits} Visibility Credits</span>
                        </span>
                        <span className="shrink-0 text-sm font-black text-sky-800">
                          {opening ? "Opening…" : formatPackagePrice(item)}
                        </span>
                      </motion.button>
                    );
                  })
                ) : (
                  <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4 text-sm font-semibold leading-6 text-amber-900">
                    Card packages have not been priced yet. No payment can be started until approved packages are added.
                  </div>
                )}
              </div>

              {cardCheckoutError ? (
                <p role="alert" className="mt-3 rounded-2xl bg-rose-50 px-4 py-3 text-sm font-bold text-rose-700">{cardCheckoutError}</p>
              ) : null}
              <div className="mt-4 flex items-center justify-center gap-2 text-xs font-bold text-slate-500">
                <HiOutlineCreditCard className="text-base text-sky-700" />
                KunThai never receives or stores your card details.
              </div>
              <button type="button" onClick={closeBuyCredits} disabled={Boolean(cardCheckoutPackageId)} className="mt-3 h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm font-black text-slate-700 disabled:opacity-50">
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
                  aria-label="Choose another payment method"
                >
                  <HiOutlineArrowLeft />
                </button>
                <div className="min-w-0">
                  <p className="text-xs font-black uppercase tracking-[0.18em] text-sky-700">
                    {buyCreditsMethod === "card" ? "Credit card" : "Mobile money"}
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
