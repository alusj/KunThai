import { Plus, Trash2 } from "lucide-react";

import { getActiveCountryProfile } from "../../../../../data/globalCountryProfiles";
import ProductFormField from "./ProductFormField";
import ProductFormInput from "./ProductFormInput";
import { useI18n, t } from "../../../../../i18n";

const VENDOR_SELLING_UNITS = ["item", "pack", "carton", "bag", "kilogram", "tonne", "litre", "pallet", "roll", "box"];

export default function ProductDetailsStep({ productForm }) {
  useI18n();
  const { form, options, errors, updateSection } = productForm;
  const isVendor = options.businessKind === "vendor";
  const currencySymbol = getActiveCountryProfile().currency?.symbol || "Le";
  const tierPricing = Array.isArray(form.details.tierPricing) ? form.details.tierPricing : [];

  function updateDetails(patch) {
    updateSection("details", patch);
  }

  function updateTierPricing(index, patch) {
    updateDetails({
      tierPricing: tierPricing.map((tier, tierIndex) =>
        tierIndex === index ? { ...tier, ...patch } : tier,
      ),
    });
  }

  function addTierPricing() {
    updateDetails({
      tierPricing: [...tierPricing, { minQty: "", maxQty: "", price: "" }],
    });
  }

  function removeTierPricing(index) {
    updateDetails({
      tierPricing: tierPricing.filter((_, tierIndex) => tierIndex !== index),
    });
  }

  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
        <p className="text-sm font-black text-gray-950">{t("urmall.biz.pform.detailsOptTitle")}</p>
        <p className="mt-1 text-sm font-semibold leading-6 text-gray-600">
          {t("urmall.biz.pform.detailsOptHint")}
        </p>
      </div>

      {isVendor ? (
        <section className="space-y-4 rounded-xl border border-emerald-100 bg-emerald-50/60 p-4">
          <div>
            <p className="text-sm font-black text-emerald-950">Wholesale terms</p>
            <p className="mt-1 text-xs font-bold leading-5 text-emerald-800">
              Tell buyers exactly how this product is packed, ordered, and prepared.
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <ProductFormField label="Selling unit" error={errors.sellingUnit}>
              <select
                value={form.details.sellingUnit}
                onChange={(event) => updateDetails({ sellingUnit: event.target.value })}
                className="h-11 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm font-bold capitalize outline-none focus:border-emerald-500"
              >
                <option value="">Choose a unit</option>
                {VENDOR_SELLING_UNITS.map((unit) => <option key={unit} value={unit}>{unit}</option>)}
              </select>
            </ProductFormField>
            <ProductFormField label="Pack size">
              <ProductFormInput
                value={form.details.packSize}
                onChange={(event) => updateDetails({ packSize: event.target.value })}
                placeholder="For example: 24 bottles"
              />
            </ProductFormField>
            <ProductFormField label="Minimum order quantity" error={errors.minimumOrderQuantity}>
              <ProductFormInput
                type="number"
                min="1"
                step="1"
                inputMode="numeric"
                value={form.details.minimumOrderQuantity}
                onChange={(event) => updateDetails({ minimumOrderQuantity: event.target.value })}
              />
            </ProductFormField>
            <ProductFormField label="Lead time (days)" error={errors.leadTimeDays}>
              <ProductFormInput
                type="number"
                min="0"
                step="1"
                inputMode="numeric"
                value={form.details.leadTimeDays}
                onChange={(event) => updateDetails({ leadTimeDays: event.target.value })}
              />
            </ProductFormField>
            <ProductFormField label="Barcode or manufacturer code">
              <ProductFormInput
                value={form.details.barcode}
                onChange={(event) => updateDetails({ barcode: event.target.value })}
                placeholder="Optional"
              />
            </ProductFormField>
          </div>
        </section>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <ProductFormField label={t("urmall.biz.pform.sizeOpt")}>
          <ProductFormInput value={form.details.size} onChange={(event) => updateDetails({ size: event.target.value })} placeholder={t("urmall.biz.pform.sizePh")} />
        </ProductFormField>
        <ProductFormField label={t("urmall.biz.pform.colorOpt")}>
          <ProductFormInput value={form.details.color} onChange={(event) => updateDetails({ color: event.target.value })} placeholder={t("urmall.biz.pform.colorPh")} />
        </ProductFormField>
        <ProductFormField label={t("urmall.biz.pform.materialOpt")}>
          <ProductFormInput value={form.details.material} onChange={(event) => updateDetails({ material: event.target.value })} placeholder={t("urmall.biz.pform.materialPh")} />
        </ProductFormField>
        <ProductFormField label={t("urmall.biz.pform.weightOpt")}>
          <ProductFormInput value={form.details.weight} onChange={(event) => updateDetails({ weight: event.target.value })} placeholder={t("urmall.biz.pform.weightPh")} />
        </ProductFormField>
        <ProductFormField label={t("urmall.biz.pform.dimensionsOpt")}>
          <ProductFormInput value={form.details.dimensions} onChange={(event) => updateDetails({ dimensions: event.target.value })} placeholder={t("urmall.biz.pform.dimensionsPh")} />
        </ProductFormField>
        <ProductFormField label={t("urmall.biz.pform.warrantyOpt")}>
          <ProductFormInput value={form.details.warranty} onChange={(event) => updateDetails({ warranty: event.target.value })} placeholder={t("urmall.biz.pform.warrantyPh")} />
        </ProductFormField>
      </div>

      <ProductFormField label={t("urmall.biz.pform.variantsOpt")}>
        <ProductFormInput
          value={form.details.variants}
          onChange={(event) => updateDetails({ variants: event.target.value })}
          placeholder={t("urmall.biz.pform.variantsPh")}
        />
      </ProductFormField>

      <section className="rounded-xl border border-gray-200 bg-white p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm font-black text-gray-950">{t("urmall.biz.pform.tiersTitle")}</p>
            <p className="mt-1 text-xs font-bold text-gray-500">{t("urmall.biz.pform.tiersExample", { sym: currencySymbol })}</p>
          </div>
          <button
            type="button"
            onClick={addTierPricing}
            className="inline-flex h-10 shrink-0 items-center gap-2 rounded-lg bg-gray-950 px-3 text-sm font-black text-white transition hover:bg-gray-800"
          >
            <Plus size={16} />
            {t("urmall.biz.pform.add")}
          </button>
        </div>

        {tierPricing.length ? (
          <div className="mt-4 space-y-3">
            {tierPricing.map((tier, index) => (
              <div key={`tier-${index}`} className="rounded-xl border border-gray-100 bg-gray-50 p-3">
                <div className="grid gap-3 sm:grid-cols-[1fr_1fr_1.2fr_auto]">
                  <ProductFormField label={t("urmall.biz.pform.from")}>
                    <ProductFormInput
                      type="number"
                      min="1"
                      inputMode="numeric"
                      value={tier.minQty}
                      onChange={(event) => updateTierPricing(index, { minQty: event.target.value })}
                      placeholder="1"
                    />
                  </ProductFormField>
                  <ProductFormField label={t("urmall.biz.pform.to")}>
                    <ProductFormInput
                      type="number"
                      min="1"
                      inputMode="numeric"
                      value={tier.maxQty}
                      onChange={(event) => updateTierPricing(index, { maxQty: event.target.value })}
                      placeholder="10"
                    />
                  </ProductFormField>
                  <ProductFormField label={t("urmall.biz.pform.priceSym", { sym: currencySymbol })}>
                    <ProductFormInput
                      type="number"
                      min="0"
                      inputMode="decimal"
                      value={tier.price}
                      onChange={(event) => updateTierPricing(index, { price: event.target.value })}
                      placeholder="5000"
                    />
                  </ProductFormField>
                  <button
                    type="button"
                    onClick={() => removeTierPricing(index)}
                    className="mt-7 flex h-11 w-11 items-center justify-center rounded-lg border border-red-100 bg-white text-red-600 transition hover:bg-red-50"
                    aria-label={t("urmall.biz.pform.removeTier")}
                  >
                    <Trash2 size={18} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : null}
      </section>

      <ProductFormField label={t("urmall.biz.pform.extraSpecsOpt")}>
        <textarea
          value={form.details.specifications}
          onChange={(event) => updateDetails({ specifications: event.target.value })}
          rows={4}
          placeholder={t("urmall.biz.pform.extraSpecsPh")}
          className="w-full rounded-lg border border-gray-300 px-3 py-3 text-sm font-medium outline-none focus:border-blue-500"
        />
      </ProductFormField>
    </div>
  );
}
