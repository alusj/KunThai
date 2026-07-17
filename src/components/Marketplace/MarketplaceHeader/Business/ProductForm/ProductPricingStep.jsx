import { useState } from "react";

import { useVisibilityCredits } from "../../../../../Backend/hooks/useVisibilityCredits";
import {
  MINIMUM_VISIBILITY_CREDITS,
  normalizeVisibilityCreditSpend,
  VISIBILITY_BOOST_PACKAGES,
} from "../../../../../Backend/services/visibilityCreditService";
import ProductFormField from "./ProductFormField";
import ProductFormInput from "./ProductFormInput";
import ProductToggle from "./ProductToggle";
import { getCountryCurrencyCode } from "../../../../../data/globalCountryProfiles";

const PROMOTION_AUDIENCES = [
  { id: "countrywide", label: "Country-wide", description: "Reach eligible shoppers across the current UrMall country." },
  { id: "nearby", label: "Nearby", description: "Prioritize shoppers around your product location." },
  { id: "recommended", label: "Recommended", description: "Let KunThai balance location, category, and marketplace activity." },
];

export default function ProductPricingStep({ productForm }) {
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
  const estimatedPromotionDays = Math.max(1, Math.min(30, Math.ceil(promotionCredits / MINIMUM_VISIBILITY_CREDITS) * 3));
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
      setShareFeedback("Invite link ready.");
    } catch (error) {
      setShareFeedback(error.message || "Unable to share invite link.");
    }
  }

  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <ProductFormField label={`Price (${currencyCode})`} error={errors.price}>
          <ProductFormInput
            type="number"
            min="0"
            value={form.pricing.price}
            onChange={(event) => updateSection("pricing", { price: event.target.value })}
            placeholder="120"
          />
        </ProductFormField>
        <ProductFormField label={`Discount price optional (${currencyCode})`} error={errors.discountPrice}>
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
        <ProductFormField label="Stock quantity" error={errors.stock}>
          <ProductFormInput
            type="number"
            min="0"
            value={form.pricing.stock}
            onChange={(event) => updateSection("pricing", { stock: event.target.value })}
            placeholder="20"
          />
        </ProductFormField>
        <ProductFormField label="Low-stock alert">
          <ProductFormInput
            type="number"
            min="0"
            value={form.pricing.lowStockAlert}
            onChange={(event) => updateSection("pricing", { lowStockAlert: event.target.value })}
          />
        </ProductFormField>
        <ProductFormField label="Product code optional">
          <ProductFormInput
            value={form.pricing.sku}
            onChange={(event) => updateSection("pricing", { sku: event.target.value })}
            placeholder="Example: JAY-HEADPHONE-001"
          />
          <p className="mt-2 text-xs font-bold leading-5 text-gray-500">
            This is your own tracking code for stock or receipts. You can leave it empty if you do not use product codes.
          </p>
        </ProductFormField>
      </div>

      <ProductToggle
        label="Allow negotiation"
        description="Let buyers send offers for this product."
        checked={form.pricing.allowNegotiation}
        onChange={(checked) => updateSection("pricing", { allowNegotiation: checked })}
      />

      <div>
        <p className="text-sm font-black text-gray-800">Publish option</p>
        <div className="mt-2 grid gap-3 sm:grid-cols-3">
          {[
            { id: "active", label: "Publish now", description: "Product appears in UrMall listings." },
            { id: "promoted", label: "Publish & promote", description: "Product also appears in the UrMall advert slider." },
            { id: "draft", label: "Save as draft", description: "Only you can see this product." },
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
              Share invite
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
                    <span className="text-sm font-black">{item.label}</span>
                    <span className="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-black text-gray-700">
                      {item.id === "custom" ? "Any" : item.credits}
                    </span>
                  </span>
                  <span className="mt-1 block text-xs font-semibold leading-5 text-gray-500">{item.helper}</span>
                </button>
              );
            })}
          </div>

          {selectedPromotionPackage === "custom" ? (
            <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_auto]">
              <ProductFormField label="Credits to spend" error={errors.promotionCredits}>
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
                Use all
              </button>
            </div>
          ) : errors.promotionCredits ? (
            <p className="mt-3 text-xs font-bold text-red-600">{errors.promotionCredits}</p>
          ) : null}

          <div className="mt-4">
            <p className="text-sm font-black text-gray-800">Promotion audience</p>
            <div className="mt-2 grid gap-2 sm:grid-cols-3">
              {PROMOTION_AUDIENCES.map((item) => {
                const selected = (form.pricing.promotionAudience || "countrywide") === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => updateSection("pricing", { promotionAudience: item.id })}
                    className={`rounded-lg border p-3 text-left ${
                      selected ? "border-emerald-600 bg-white text-emerald-800 shadow-sm" : "border-emerald-100 bg-white/80 text-gray-700"
                    }`}
                  >
                    <span className="block text-sm font-black">{item.label}</span>
                    <span className="mt-1 block text-xs font-semibold leading-5 text-gray-500">{item.description}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className={`mt-4 rounded-lg border p-3 text-sm font-black ${hasEnoughCredits ? "border-emerald-200 bg-white text-emerald-800" : "border-amber-200 bg-amber-50 text-amber-900"}`}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span>Selected boost: {promotionCredits} credits</span>
              <span>After boost: {hasEnoughCredits ? availableCredits - promotionCredits : availableCredits}</span>
            </div>
            <p className="mt-2 text-xs font-bold leading-5">
              Estimated promoted-card window: {estimatedPromotionDays} day{estimatedPromotionDays === 1 ? "" : "s"}.
            </p>
            {!hasEnoughCredits ? (
              <p className="mt-2 text-xs font-bold leading-5">
                You need {promotionCredits} credits for this boost. Each verified invite adds 5 credits.
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
