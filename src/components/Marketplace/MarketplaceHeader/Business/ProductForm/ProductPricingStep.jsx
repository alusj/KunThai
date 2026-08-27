import { useState } from "react";

import { useVisibilityCredits } from "../../../../../Backend/hooks/useVisibilityCredits";
import {
  getMarketplacePromotionDurationDays,
  MINIMUM_VISIBILITY_CREDITS,
  normalizeVisibilityCreditSpend,
  VISIBILITY_BOOST_PACKAGES,
} from "../../../../../Backend/services/visibilityCreditService";
import ProductFormField from "./ProductFormField";
import ProductFormInput from "./ProductFormInput";
import ProductToggle from "./ProductToggle";
import { getCountryCurrencyCode } from "../../../../../data/globalCountryProfiles";
import { uiText, useI18n, t } from "../../../../../i18n";
import { t as i18nText } from "../../../../../i18n/index";

const PROMOTION_AUDIENCES = [
  { id: "countrywide", labelKey: "audCountrywide", descKey: "audCountrywideDesc" },
  { id: "nearby", labelKey: "audNearby", descKey: "audNearbyDesc" },
  { id: "recommended", labelKey: "audRecommended", descKey: "audRecommendedDesc" },
];

export default function ProductPricingStep({ productForm }) {
  useI18n();
  const { form, errors, updateSection } = productForm;
  const currencyCode = getCountryCurrencyCode();
  const visibilityCredits = useVisibilityCredits({ enabled: form.pricing.publishStatus === "promoted" });
  const [shareFeedback, setShareFeedback] = useState("");
  const promotionCredits = normalizeVisibilityCreditSpend(
    form.pricing.promotionCredits,
    MINIMUM_VISIBILITY_CREDITS,
  );
  const selectedPromotionPackage = form.pricing.promotionCreditPackage || (
    VISIBILITY_BOOST_PACKAGES.find((item) => item.id !== "custom" && item.credits === promotionCredits)?.id || "custom"
  );
  const estimatedPromotionDays = getMarketplacePromotionDurationDays(promotionCredits);
  const availableCredits = Number(visibilityCredits.balance || 0);
  const hasEnoughCredits = availableCredits >= promotionCredits;

  function setPromotionCredits(value) {
    const normalized = normalizeVisibilityCreditSpend(value, MINIMUM_VISIBILITY_CREDITS);
    updateSection("pricing", {
      promotionCredits: String(normalized),
    });
  }

  function selectPromotionPackage(item) {
    updateSection("pricing", {
      promotionCreditPackage: item.id,
      ...(item.id === "custom" ? {} : { promotionCredits: String(item.credits) }),
    });
  }

  async function shareInvite() {
    setShareFeedback("");
    try {
      await visibilityCredits.shareInvite();
      setShareFeedback(t("urmall.biz.pform.inviteReady"));
    } catch (error) {
      setShareFeedback(error.message || t("urmall.biz.pform.inviteFailed"));
    }
  }

  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <ProductFormField label={t("urmall.biz.pform.priceCode", { code: currencyCode })} error={errors.price}>
          <ProductFormInput
            type="number"
            min="0"
            value={form.pricing.price}
            onChange={(event) => updateSection("pricing", { price: event.target.value })}
            placeholder="120"
          />
        </ProductFormField>
        <ProductFormField label={t("urmall.biz.pform.discountCode", { code: currencyCode })} error={errors.discountPrice}>
          <ProductFormInput
            type="number"
            min="0"
            value={form.pricing.discountPrice}
            onChange={(event) => updateSection("pricing", { discountPrice: event.target.value })}
            placeholder="100"
          />
        </ProductFormField>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <ProductFormField label={t("urmall.biz.pform.stockQty")} error={errors.stock}>
          <ProductFormInput
            type="number"
            min="0"
            value={form.pricing.stock}
            onChange={(event) => updateSection("pricing", { stock: event.target.value })}
            placeholder="20"
          />
        </ProductFormField>
        <ProductFormField label={t("urmall.biz.pform.lowStockAlert")}>
          <ProductFormInput
            type="number"
            min="0"
            value={form.pricing.lowStockAlert}
            onChange={(event) => updateSection("pricing", { lowStockAlert: event.target.value })}
          />
        </ProductFormField>
        <ProductFormField label={t("urmall.biz.pform.productCodeOpt")}>
          <ProductFormInput
            value={form.pricing.sku}
            onChange={(event) => updateSection("pricing", { sku: event.target.value })}
            placeholder={i18nText("ui.literals.kea34e011807f")}
          />
          <p className="mt-2 text-xs font-bold leading-5 text-gray-500">
            {t("urmall.biz.pform.productCodeHelper")}
          </p>
        </ProductFormField>
      </div>

      <ProductToggle
        label={t("urmall.biz.pform.allowNegotiation")}
        description={t("urmall.biz.pform.allowNegotiationDesc")}
        checked={form.pricing.allowNegotiation}
        onChange={(checked) => updateSection("pricing", { allowNegotiation: checked })}
      />

      <div>
        <p className="text-sm font-black text-gray-800">{t("urmall.biz.pform.publishOption")}</p>
        <div className="mt-2 grid gap-3 sm:grid-cols-3">
          {[
            { id: "active", label: t("urmall.biz.pform.pubNow"), description: t("urmall.biz.pform.pubNowDesc") },
            { id: "promoted", label: t("urmall.biz.pform.pubPromote"), description: t("urmall.biz.pform.pubPromoteDesc") },
            { id: "draft", label: t("urmall.biz.pform.pubDraft"), description: t("urmall.biz.pform.pubDraftDesc") },
          ].map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => updateSection("pricing", {
                publishStatus: item.id,
                ...(item.id === "promoted" && !form.pricing.promotionCredits
                  ? { promotionCreditPackage: "small", promotionCredits: String(MINIMUM_VISIBILITY_CREDITS) }
                  : {}),
              })}
              className={`rounded-lg border p-4 text-left ${
                form.pricing.publishStatus === item.id
                  ? item.id === "promoted"
                    ? "border-emerald-600 bg-emerald-50 text-emerald-800"
                    : "border-blue-600 bg-blue-50 text-blue-800"
                  : "border-gray-200 bg-white text-gray-700"
              }`}
            >
              <span className="block font-black">{item.label}</span>
              <span className="mt-1 block text-xs font-semibold text-gray-500">{item.description}</span>
            </button>
          ))}
        </div>
      </div>

      {form.pricing.publishStatus === "promoted" ? (
        <section className="rounded-xl border border-emerald-100 bg-emerald-50/60 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.16em] text-emerald-700">Visibility Credits</p>
              <p className="mt-1 text-2xl font-black text-gray-950">
                {visibilityCredits.loading ? "..." : availableCredits}
              </p>
            </div>
            <button
              type="button"
              onClick={shareInvite}
              className="rounded-lg bg-gray-950 px-4 py-3 text-sm font-black text-white"
            >
              {t("urmall.biz.pform.shareInvite")}
            </button>
          </div>

          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            {VISIBILITY_BOOST_PACKAGES.map((item) => {
              const selected = selectedPromotionPackage === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => selectPromotionPackage(item)}
                  className={`rounded-lg border p-3 text-left ${
                    selected ? "border-emerald-600 bg-white text-emerald-800 shadow-sm" : "border-emerald-100 bg-white/80 text-gray-700"
                  }`}
                >
                  <span className="flex items-center justify-between gap-2">
                    <span className="text-sm font-black">{uiText(item.label)}</span>
                    <span className="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-black text-gray-700">
                      {item.id === "custom" ? t("urmall.biz.pform.any") : item.credits}
                    </span>
                  </span>
                  <span className="mt-1 block text-xs font-semibold leading-5 text-gray-500">{uiText(item.helper)}</span>
                </button>
              );
            })}
          </div>

          {selectedPromotionPackage === "custom" ? (
            <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_auto]">
              <ProductFormField label={t("urmall.biz.pform.creditsToSpend")} error={errors.promotionCredits}>
                <ProductFormInput
                  type="number"
                  min={MINIMUM_VISIBILITY_CREDITS}
                  step="1"
                  value={String(promotionCredits)}
                  onChange={(event) => {
                    updateSection("pricing", { promotionCreditPackage: "custom" });
                    setPromotionCredits(event.target.value);
                  }}
                />
              </ProductFormField>
              <button
                type="button"
                onClick={() => {
                  updateSection("pricing", { promotionCreditPackage: "custom" });
                  setPromotionCredits(availableCredits);
                }}
                disabled={availableCredits < MINIMUM_VISIBILITY_CREDITS}
                className="h-12 self-end rounded-lg border border-emerald-200 bg-white px-4 text-sm font-black text-emerald-800 disabled:opacity-40"
              >
                {t("urmall.biz.pform.useAll")}
              </button>
            </div>
          ) : errors.promotionCredits ? (
            <p className="mt-3 text-xs font-bold text-red-600">{errors.promotionCredits}</p>
          ) : null}

          <div className="mt-4">
            <p className="text-sm font-black text-gray-800">{t("urmall.biz.pform.promotionAudience")}</p>
            <div className="mt-2 grid gap-2 sm:grid-cols-3">
              {PROMOTION_AUDIENCES.map((item) => {
                const selected = (form.pricing.promotionAudience || i18nText("ui.literals.kd2e6e5f60e8d")) === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => updateSection("pricing", { promotionAudience: item.id })}
                    className={`rounded-lg border p-3 text-left ${
                      selected ? "border-emerald-600 bg-white text-emerald-800 shadow-sm" : "border-emerald-100 bg-white/80 text-gray-700"
                    }`}
                  >
                    <span className="block text-sm font-black">{t(`urmall.biz.pform.${item.labelKey}`)}</span>
                    <span className="mt-1 block text-xs font-semibold leading-5 text-gray-500">{t(`urmall.biz.pform.${item.descKey}`)}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className={`mt-4 rounded-lg border p-3 text-sm font-black ${hasEnoughCredits ? "border-emerald-200 bg-white text-emerald-800" : "border-amber-200 bg-amber-50 text-amber-900"}`}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span>{t("urmall.biz.pform.selectedBoost", { n: promotionCredits })}</span>
              <span>{t("urmall.biz.pform.afterBoost", { n: hasEnoughCredits ? availableCredits - promotionCredits : availableCredits })}</span>
            </div>
            <p className="mt-2 text-xs font-bold leading-5">
              {t(estimatedPromotionDays === 1 ? "urmall.biz.pform.estWindowOne" : "urmall.biz.pform.estWindowMany", { n: estimatedPromotionDays })}
            </p>
            {!hasEnoughCredits ? (
              <p className="mt-2 text-xs font-bold leading-5">
                {t("urmall.biz.pform.needCredits", { n: promotionCredits })}
              </p>
            ) : null}
          </div>

          {shareFeedback || visibilityCredits.error ? (
            <p className="mt-3 text-xs font-black text-emerald-700">{shareFeedback || visibilityCredits.error}</p>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
