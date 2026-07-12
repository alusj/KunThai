import { Plus, Trash2 } from "lucide-react";

import { getActiveCountryProfile } from "../../../../../data/globalCountryProfiles";
import ProductFormField from "./ProductFormField";
import ProductFormInput from "./ProductFormInput";

export default function ProductDetailsStep({ productForm }) {
  const { form, updateSection } = productForm;
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
        <p className="text-sm font-black text-gray-950">Optional, but useful for serious listings</p>
        <p className="mt-1 text-sm font-semibold leading-6 text-gray-600">
          Fill only what applies. Clothes may need size and color, electronics may need warranty and specifications, and bulk items may need variants.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <ProductFormField label="Size optional">
          <ProductFormInput value={form.details.size} onChange={(event) => updateDetails({ size: event.target.value })} placeholder="Small, 42, XL, 6kg bag" />
        </ProductFormField>
        <ProductFormField label="Color optional">
          <ProductFormInput value={form.details.color} onChange={(event) => updateDetails({ color: event.target.value })} placeholder="Black, white, red" />
        </ProductFormField>
        <ProductFormField label="Material optional">
          <ProductFormInput value={form.details.material} onChange={(event) => updateDetails({ material: event.target.value })} placeholder="Cotton, leather, metal" />
        </ProductFormField>
        <ProductFormField label="Weight optional">
          <ProductFormInput value={form.details.weight} onChange={(event) => updateDetails({ weight: event.target.value })} placeholder="2 kg, 500 g" />
        </ProductFormField>
        <ProductFormField label="Dimensions optional">
          <ProductFormInput value={form.details.dimensions} onChange={(event) => updateDetails({ dimensions: event.target.value })} placeholder="30 x 20 x 10 cm" />
        </ProductFormField>
        <ProductFormField label="Warranty optional">
          <ProductFormInput value={form.details.warranty} onChange={(event) => updateDetails({ warranty: event.target.value })} placeholder="7 days, 6 months, no warranty" />
        </ProductFormField>
      </div>

      <ProductFormField label="Variants optional">
        <ProductFormInput
          value={form.details.variants}
          onChange={(event) => updateDetails({ variants: event.target.value })}
          placeholder="Black / 64GB, Blue / 128GB, Size M / Size L"
        />
      </ProductFormField>

      <section className="rounded-xl border border-gray-200 bg-white p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm font-black text-gray-950">Quantity price tiers optional</p>
            <p className="mt-1 text-xs font-bold text-gray-500">Example: 1-10 {currencySymbol} 5000, 10-50 {currencySymbol} 4500</p>
          </div>
          <button
            type="button"
            onClick={addTierPricing}
            className="inline-flex h-10 shrink-0 items-center gap-2 rounded-lg bg-gray-950 px-3 text-sm font-black text-white transition hover:bg-gray-800"
          >
            <Plus size={16} />
            Add
          </button>
        </div>

        {tierPricing.length ? (
          <div className="mt-4 space-y-3">
            {tierPricing.map((tier, index) => (
              <div key={`tier-${index}`} className="rounded-xl border border-gray-100 bg-gray-50 p-3">
                <div className="grid gap-3 sm:grid-cols-[1fr_1fr_1.2fr_auto]">
                  <ProductFormField label="From">
                    <ProductFormInput
                      type="number"
                      min="1"
                      inputMode="numeric"
                      value={tier.minQty}
                      onChange={(event) => updateTierPricing(index, { minQty: event.target.value })}
                      placeholder="1"
                    />
                  </ProductFormField>
                  <ProductFormField label="To">
                    <ProductFormInput
                      type="number"
                      min="1"
                      inputMode="numeric"
                      value={tier.maxQty}
                      onChange={(event) => updateTierPricing(index, { maxQty: event.target.value })}
                      placeholder="10"
                    />
                  </ProductFormField>
                  <ProductFormField label={`Price (${currencySymbol})`}>
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
                    aria-label="Remove quantity price tier"
                  >
                    <Trash2 size={18} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : null}
      </section>

      <ProductFormField label="Extra specifications optional">
        <textarea
          value={form.details.specifications}
          onChange={(event) => updateDetails({ specifications: event.target.value })}
          rows={4}
          placeholder="Battery life, capacity, ingredients, compatibility, package contents, care instructions, or any other useful buyer details."
          className="w-full rounded-lg border border-gray-300 px-3 py-3 text-sm font-medium outline-none focus:border-blue-500"
        />
      </ProductFormField>
    </div>
  );
}
