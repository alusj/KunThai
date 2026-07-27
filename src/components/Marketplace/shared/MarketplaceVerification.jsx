import { AlertTriangle, BadgeCheck, Clock, Info, ShieldCheck, X } from "lucide-react";

import { useI18n, t } from "../../../i18n";

// Text fields are i18n keys resolved via t() at render time; the icon and
// colour classes stay literal. The status objects are consumed only through the
// Badge/Inline/Modal components in this file, never the raw text externally.
export const marketplaceVerificationStatuses = {
  notVerified: {
    labelKey: "urmall.verification.notVerifiedLabel",
    shortTextKey: "urmall.verification.notVerifiedShort",
    icon: AlertTriangle,
    colorClass: "border-red-200 bg-red-50 text-red-700",
    panelClass: "border-red-200 bg-red-50 text-red-900",
    buyerNoteKey: "urmall.verification.notVerifiedBuyer",
    sellerNoteKey: "urmall.verification.notVerifiedSeller",
  },
  pending: {
    labelKey: "urmall.verification.pendingLabel",
    shortTextKey: "urmall.verification.pendingShort",
    icon: Clock,
    colorClass: "border-amber-200 bg-amber-50 text-amber-800",
    panelClass: "border-amber-200 bg-amber-50 text-amber-950",
    buyerNoteKey: "urmall.verification.pendingBuyer",
    sellerNoteKey: "urmall.verification.pendingSeller",
  },
  verified: {
    labelKey: "urmall.verification.verifiedLabel",
    shortTextKey: "urmall.verification.verifiedShort",
    icon: BadgeCheck,
    colorClass: "border-blue-200 bg-blue-50 text-blue-700",
    panelClass: "border-blue-200 bg-blue-50 text-blue-950",
    buyerNoteKey: "urmall.verification.verifiedBuyer",
    sellerNoteKey: "urmall.verification.verifiedSeller",
  },
  recommended: {
    labelKey: "urmall.verification.recommendedLabel",
    shortTextKey: "urmall.verification.recommendedShort",
    icon: ShieldCheck,
    colorClass: "border-emerald-200 bg-emerald-50 text-emerald-700",
    panelClass: "border-emerald-200 bg-emerald-50 text-emerald-950",
    buyerNoteKey: "urmall.verification.recommendedBuyer",
    sellerNoteKey: "urmall.verification.recommendedSeller",
  },
};

export function normalizeMarketplaceVerificationStatus(status, verified) {
  const value = String(status || "").toLowerCase();
  if (["recommended", "verified_recommended", "verify-recommended", "verified recommended"].includes(value)) return "recommended";
  if (["verified", "approved"].includes(value)) return "verified";
  if (["submitted", "pending", "verification_pending", "under_review", "pending_review", "in_review", "review"].includes(value)) return "pending";
  if (["not_verified", "notverified", "none", "false"].includes(value)) return "notVerified";
  if (!value && verified === true) return "verified";
  return "notVerified";
}

export function MarketplaceVerificationBadge({ status, verified, onClick }) {
  useI18n();
  const key = normalizeMarketplaceVerificationStatus(status, verified);
  const config = marketplaceVerificationStatuses[key];
  const Icon = config.icon;

  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-black ${config.colorClass}`}
    >
      <Icon size={13} strokeWidth={2.4} />
      {t(config.labelKey)}
      <Info size={12} strokeWidth={2.4} />
    </button>
  );
}

export function MarketplaceVerificationInline({ status, verified, audience = "buyer", onReadMore }) {
  useI18n();
  const key = normalizeMarketplaceVerificationStatus(status, verified);
  const config = marketplaceVerificationStatuses[key];
  const note = audience === "seller"
    ? t("urmall.verification.inlineSeller", { status: t(config.labelKey) })
    : t("urmall.verification.inlineBuyer", { status: t(config.labelKey) });

  return (
    <div className={`flex min-w-0 flex-wrap items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-bold ${config.panelClass}`}>
      <span className="min-w-0 truncate">{note}</span>
      <button type="button" onClick={onReadMore} className="shrink-0 font-black underline">
        {t("urmall.verification.readMore")}
      </button>
    </div>
  );
}

export function MarketplaceVerificationModal({
  status,
  verified,
  audience = "buyer",
  anchorRect = null,
  onClose,
  onPrimaryAction,
  onSecondaryAction,
}) {
  useI18n();
  if (!onClose) return null;

  const key = normalizeMarketplaceVerificationStatus(status, verified);
  const config = marketplaceVerificationStatuses[key];
  const Icon = config.icon;
  const note = audience === "seller" ? t(config.sellerNoteKey) : t(config.buyerNoteKey);
  const primaryLabel = t("urmall.verification.continueCarefully");
  const secondaryLabel = audience === "seller" ? t("urmall.verification.completeVerification") : t("urmall.detail.messageSellerTitle");
  const anchored = Boolean(anchorRect && typeof window !== "undefined");
  const anchoredWidth = anchored ? Math.min(420, Math.max(280, window.innerWidth - 24)) : undefined;
  const anchorStyle = anchored
    ? {
        position: "absolute",
        top: Math.max(12, Math.min((anchorRect.bottom || 0) + 8, window.innerHeight - 320)),
        left: Math.max(12, Math.min(anchorRect.left || 12, window.innerWidth - anchoredWidth - 12)),
        width: anchoredWidth,
        maxHeight: "calc(100dvh - 1.5rem)",
        overflowY: "auto",
      }
    : undefined;

  return (
    <div
      className={[
        "fixed inset-0 z-[1200] p-3",
        anchored ? "bg-gray-950/25" : "flex items-end bg-gray-950/45 sm:items-center sm:justify-center",
      ].join(" ")}
      onClick={onClose}
    >
      <section
        className="w-full rounded-2xl border border-gray-200 bg-white shadow-2xl sm:max-w-md"
        style={anchorStyle}
        onClick={(event) => event.stopPropagation()}
      >
        <div className={`rounded-t-2xl border-b p-4 ${config.panelClass}`}>
          <div className="flex items-start justify-between gap-4">
            <div className="flex min-w-0 items-start gap-3">
              <span className="mt-0.5 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/75">
                <Icon size={20} strokeWidth={2.4} />
              </span>
              <div className="min-w-0">
                <p className="text-xs font-black uppercase">{t("urmall.verification.statusEyebrow")}</p>
                <h3 className="mt-1 text-xl font-black">{t(config.labelKey)}</h3>
                <p className="mt-1 text-sm font-semibold">{t(config.shortTextKey)}</p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/80 text-gray-700 hover:bg-white"
              aria-label={t("urmall.verification.closeDetails")}
            >
              <X size={18} />
            </button>
          </div>
        </div>

        <div className="space-y-4 p-4">
          <p className="text-sm font-semibold leading-6 text-gray-700">{note}</p>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => {
                onPrimaryAction?.();
                onClose?.();
              }}
              className="h-11 rounded-xl bg-gray-950 px-3 text-sm font-black text-white hover:bg-gray-800"
            >
              {primaryLabel}
            </button>
            <button
              type="button"
              onClick={() => {
                onSecondaryAction?.();
                onClose?.();
              }}
              className="h-11 rounded-xl border border-gray-200 px-3 text-sm font-black text-gray-700 hover:bg-gray-50"
            >
              {secondaryLabel}
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}

export function MarketplaceVerificationCaution(props) {
  return (
    <MarketplaceVerificationInline {...props} />
  );
}
