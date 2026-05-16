import { AlertTriangle, BadgeCheck, Clock, Info, ShieldCheck, X } from "lucide-react";

export const marketplaceVerificationStatuses = {
  notVerified: {
    label: "Not verified",
    shortText: "No trust checks completed",
    icon: AlertTriangle,
    colorClass: "border-red-200 bg-red-50 text-red-700",
    panelClass: "border-red-200 bg-red-50 text-red-900",
    buyerNote: "Caution: this seller has not completed marketplace verification. Confirm the seller, product, and payment details before sending money.",
    sellerNote: "Your store is not verified yet. Buyers may avoid paying until your identity and business details are checked.",
    actions: ["Choose verified sellers", "Message seller first", "Report concern"],
  },
  pending: {
    label: "Pending",
    shortText: "Documents under review",
    icon: Clock,
    colorClass: "border-amber-200 bg-amber-50 text-amber-800",
    panelClass: "border-amber-200 bg-amber-50 text-amber-950",
    buyerNote: "Caution: this seller has started verification, but KunThai has not finished review. Continue carefully before paying.",
    sellerNote: "Your verification is pending. Keep documents accurate and wait for review before asking buyers to send money.",
    actions: ["Continue carefully", "Message seller", "Use protected payment"],
  },
  verified: {
    label: "Verified",
    shortText: "Basic checks passed",
    icon: BadgeCheck,
    colorClass: "border-blue-200 bg-blue-50 text-blue-700",
    panelClass: "border-blue-200 bg-blue-50 text-blue-950",
    buyerNote: "KunThai has checked the seller's required marketplace details. Still confirm the product and payment instructions before purchase.",
    sellerNote: "Your store has passed basic marketplace checks. Keep product details and payment instructions clear for buyers.",
    actions: ["Order product", "Message seller"],
  },
  recommended: {
    label: "Verified recommended",
    shortText: "Trusted marketplace seller",
    icon: ShieldCheck,
    colorClass: "border-emerald-200 bg-emerald-50 text-emerald-700",
    panelClass: "border-emerald-200 bg-emerald-50 text-emerald-950",
    buyerNote: "This seller has completed verification and is recommended by KunThai marketplace trust checks.",
    sellerNote: "Your store is verified and recommended. Maintain strong fulfillment, clear pricing, and safe payment practices.",
    actions: ["Order product", "Message seller"],
  },
};

export function normalizeMarketplaceVerificationStatus(status, verified) {
  const value = String(status || "").toLowerCase();
  if (["recommended", "verified_recommended", "verify-recommended", "verified recommended"].includes(value)) return "recommended";
  if (["verified", "verify", "approved"].includes(value) || verified === true) return "verified";
  if (["submitted", "pending", "verification_pending", "under_review"].includes(value)) return "pending";
  return "notVerified";
}

export function MarketplaceVerificationBadge({ status, verified, onClick }) {
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
      {config.label}
      <Info size={12} strokeWidth={2.4} />
    </button>
  );
}

export function MarketplaceVerificationInline({ status, verified, audience = "buyer", onReadMore }) {
  const key = normalizeMarketplaceVerificationStatus(status, verified);
  const config = marketplaceVerificationStatuses[key];
  const note = audience === "seller"
    ? `Your verification is ${config.label}`
    : `This seller's verification is ${config.label}`;

  return (
    <div className={`flex min-w-0 flex-wrap items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-bold ${config.panelClass}`}>
      <span className="min-w-0 truncate">{note}</span>
      <button type="button" onClick={onReadMore} className="shrink-0 font-black underline">
        Read more
      </button>
    </div>
  );
}

export function MarketplaceVerificationModal({
  status,
  verified,
  audience = "buyer",
  onClose,
  onPrimaryAction,
  onSecondaryAction,
}) {
  if (!onClose) return null;

  const key = normalizeMarketplaceVerificationStatus(status, verified);
  const config = marketplaceVerificationStatuses[key];
  const Icon = config.icon;
  const note = audience === "seller" ? config.sellerNote : config.buyerNote;
  const primaryLabel = audience === "seller" ? "Continue carefully" : "Continue carefully";
  const secondaryLabel = audience === "seller" ? "Complete verification" : "Message seller";

  return (
    <div className="fixed inset-0 z-[1200] flex items-end bg-gray-950/45 p-3 sm:items-center sm:justify-center">
      <section className="w-full rounded-2xl border border-gray-200 bg-white shadow-2xl sm:max-w-md">
        <div className={`rounded-t-2xl border-b p-4 ${config.panelClass}`}>
          <div className="flex items-start justify-between gap-4">
            <div className="flex min-w-0 items-start gap-3">
              <span className="mt-0.5 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/75">
                <Icon size={20} strokeWidth={2.4} />
              </span>
              <div className="min-w-0">
                <p className="text-xs font-black uppercase">Verification status</p>
                <h3 className="mt-1 text-xl font-black">{config.label}</h3>
                <p className="mt-1 text-sm font-semibold">{config.shortText}</p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/80 text-gray-700 hover:bg-white"
              aria-label="Close verification details"
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
