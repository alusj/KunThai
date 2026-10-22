import { t } from "../../../i18n";

// "This product is already boosted until …": a live boost is never changed or
// charged again. Shared by retail/vendor products (sellerProductService) and
// meals/properties (marketplaceVerticalService), so every business type says
// the same thing. `livePromotion` is { id, endsAt }.
export function alreadyBoostedError(livePromotion) {
  const endsAt = livePromotion?.endsAt ? new Date(livePromotion.endsAt) : null;
  const error = new Error(
    endsAt && !Number.isNaN(endsAt.getTime())
      ? t("promoFix.alreadyBoosted", { date: endsAt.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) })
      : t("promoFix.alreadyBoostedNoEnd"),
  );
  error.code = "PROMO_ALREADY_ACTIVE";
  return error;
}
