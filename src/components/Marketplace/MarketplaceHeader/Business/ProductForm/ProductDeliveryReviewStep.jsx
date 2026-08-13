import { getActiveCountryProfile } from "../../../../../data/globalCountryProfiles";
import {
  MINIMUM_VISIBILITY_CREDITS,
  normalizeVisibilityCreditSpend,
} from "../../../../../Backend/services/visibilityCreditService";
import ProductFormField from "./ProductFormField";
import ProductFormInput from "./ProductFormInput";
import ProductToggle from "./ProductToggle";
import { useI18n, t } from "../../../../../i18n";
import { t as i18nText } from "../../../../../i18n/index";

export default function ProductDeliveryReviewStep({ productForm }) {
  useI18n();
  const { form, errors, updateSection } = productForm;
  const countryProfile = getActiveCountryProfile();
  const currencySymbol = countryProfile.currency?.symbol || "Le";
  const tierPricing = Array.isArray(form.details.tierPricing)
    ? form.details.tierPricing.filter((tier) => Number(tier.price) > 0 && (Number(tier.minQty) > 0 || Number(tier.maxQty) > 0))
    : [];
  const promotionCredits = normalizeVisibilityCreditSpend(
    form.pricing.promotionCredits,
    MINIMUM_VISIBILITY_CREDITS,
  );
  const estimatedPromotionDays = Math.max(1, Math.min(30, Math.ceil(promotionCredits / MINIMUM_VISIBILITY_CREDITS) * 3));

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2">
        <ProductToggle
          label={t("urmall.biz.board.delivery.deliveryTitle")}
          checked={form.delivery.deliveryAvailable}
          onChange={(checked) => updateSection("delivery", { deliveryAvailable: checked })}
        />
        <ProductToggle
          label={t("urmall.biz.board.delivery.pickupTitle")}
          checked={form.delivery.pickupAvailable}
          onChange={(checked) => updateSection("delivery", { pickupAvailable: checked })}
        />
      </div>
      {errors.fulfillment ? <p className="text-xs font-bold text-red-600">{errors.fulfillment}</p> : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <ProductFormField label={t("urmall.biz.pform.estDeliveryTime")}>
          <ProductFormInput
            value={form.delivery.deliveryTime}
            onChange={(event) => updateSection("delivery", { deliveryTime: event.target.value })}
            placeholder={t("urmall.biz.pform.deliveryTimePh")}
          />
        </ProductFormField>
        <ProductFormField label={t("urmall.biz.pform.productLocation")}>
          <ProductFormInput
            value={form.delivery.location}
            onChange={(event) => updateSection("delivery", { location: event.target.value })}
            placeholder={t("urmall.biz.pform.locationPh")}
          />
        </ProductFormField>
      </div>

      <section className="rounded-xl border border-gray-200 bg-white p-4">
        <h3 className="font-black text-gray-950">{t("urmall.biz.pform.reviewTitle")}</h3>
        <div className="mt-3 space-y-2 text-sm font-medium text-gray-600">
          <p>{t("urmall.biz.pform.rowName", { value: form.basics.name || t("urmall.biz.pform.missing") })}</p>
          <p>{t("urmall.biz.pform.rowCategory", { value: form.basics.category || t("urmall.biz.pform.missing") })}</p>
          <p>{t("urmall.biz.pform.rowCondition", { value: form.basics.condition || t("urmall.biz.pform.missing") })}</p>
          {form.details.size || form.details.color || form.details.variants ? (
            <p>
              {t("urmall.biz.pform.rowDetails", { value: [form.details.size, form.details.color, form.details.variants].filter(Boolean).join(" - ") })}
            </p>
          ) : null}
          {tierPricing.length ? (
            <p>
              {t("urmall.biz.pform.rowBulk", { value: tierPricing
                .map((tier) => `${tier.minQty || 1}-${tier.maxQty || "+"} ${currencySymbol} ${tier.price}`)
                .join("; ") })}
            </p>
          ) : null}
          <p>{t("urmall.biz.pform.rowPrice", { value: form.pricing.price || t("urmall.biz.pform.missing") })}</p>
          <p>{t("urmall.biz.pform.rowStock", { value: form.pricing.stock || t("urmall.biz.pform.missing") })}</p>
          <p>{t("urmall.biz.pform.rowCover", { value: form.media.coverImageName || (form.media.coverImageUrl ? t("urmall.biz.pform.currentCoverImage") : t("urmall.biz.pform.missing")) })}</p>
          <p>{t("urmall.biz.pform.rowStatus", { value: form.pricing.publishStatus === "promoted" ? t("urmall.biz.pform.pubPromote") : form.pricing.publishStatus === "active" ? t("urmall.biz.pform.pubNow") : t("urmall.biz.pform.pubDraft") })}</p>
          {form.pricing.publishStatus === "promoted" ? (
            <>
              <p>{t("urmall.biz.pform.rowPromoCredits", { n: promotionCredits })}</p>
              <p>{t("urmall.biz.pform.rowPromoAudience", { value: form.pricing.promotionAudience || i18nText("ui.literals.kd2e6e5f60e8d") })}</p>
              <p>{t(estimatedPromotionDays === 1 ? "urmall.biz.pform.rowWindowOne" : "urmall.biz.pform.rowWindowMany", { n: estimatedPromotionDays })}</p>
            </>
          ) : null}
        </div>
      </section>
    </div>
  );
}
