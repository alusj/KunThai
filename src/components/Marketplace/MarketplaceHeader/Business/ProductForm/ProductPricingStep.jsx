import ProductFormField from "./ProductFormField";
import ProductFormInput from "./ProductFormInput";
import ProductToggle from "./ProductToggle";
import { getCountryCurrencyCode } from "../../../../../data/westAfricanCountryProfiles";

export default function ProductPricingStep({ productForm }) {
  const { form, errors, updateSection } = productForm;
  const currencyCode = getCountryCurrencyCode();

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
        <div className="mt-2 grid gap-3 sm:grid-cols-2">
          {[
            { id: "active", label: "Publish now" },
            { id: "draft", label: "Save as draft" },
          ].map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => updateSection("pricing", { publishStatus: item.id })}
              className={`rounded-lg border p-4 text-left font-black ${
                form.pricing.publishStatus === item.id
                  ? "border-blue-600 bg-blue-50 text-blue-800"
                  : "border-gray-200 bg-white text-gray-700"
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
