import ProductFormField from "./ProductFormField";
import ProductFormInput from "./ProductFormInput";
import ProductToggle from "./ProductToggle";
import { getActiveCountryProfile } from "../../../../../data/westAfricanCountryProfiles";

export default function ProductDeliveryReviewStep({ productForm }) {
  const { form, errors, updateSection } = productForm;
  const countryProfile = getActiveCountryProfile();

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2">
        <ProductToggle
          label="Delivery available"
          checked={form.delivery.deliveryAvailable}
          onChange={(checked) => updateSection("delivery", { deliveryAvailable: checked })}
        />
        <ProductToggle
          label="Pickup available"
          checked={form.delivery.pickupAvailable}
          onChange={(checked) => updateSection("delivery", { pickupAvailable: checked })}
        />
      </div>
      {errors.fulfillment ? <p className="text-xs font-bold text-red-600">{errors.fulfillment}</p> : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <ProductFormField label="Estimated delivery time">
          <ProductFormInput
            value={form.delivery.deliveryTime}
            onChange={(event) => updateSection("delivery", { deliveryTime: event.target.value })}
            placeholder="Same day, 1-2 days"
          />
        </ProductFormField>
        <ProductFormField label="Product location">
          <ProductFormInput
            value={form.delivery.location}
            onChange={(event) => updateSection("delivery", { location: event.target.value })}
            placeholder={`${countryProfile.cityPlaceholder}, ${countryProfile.name}`}
          />
        </ProductFormField>
      </div>

      <section className="rounded-xl border border-gray-200 bg-white p-4">
        <h3 className="font-black text-gray-950">Review before publishing</h3>
        <div className="mt-3 space-y-2 text-sm font-medium text-gray-600">
          <p>Name: {form.basics.name || "Missing"}</p>
          <p>Category: {form.basics.category || "Missing"}</p>
          <p>Condition: {form.basics.condition || "Missing"}</p>
          {form.details.size || form.details.color || form.details.variants ? (
            <p>
              Details: {[form.details.size, form.details.color, form.details.variants].filter(Boolean).join(" · ")}
            </p>
          ) : null}
          <p>Price: {form.pricing.price || "Missing"}</p>
          <p>Stock: {form.pricing.stock || "Missing"}</p>
          <p>Cover image: {form.media.coverImageName || (form.media.coverImageUrl ? "Current cover image" : "Missing")}</p>
          <p>Status: {form.pricing.publishStatus === "active" ? "Publish now" : "Save as draft"}</p>
        </div>
      </section>
    </div>
  );
}
