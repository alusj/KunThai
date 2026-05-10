import ProductFormField from "./ProductFormField";
import ProductFormInput from "./ProductFormInput";

export default function ProductDetailsStep({ productForm }) {
  const { form, updateSection } = productForm;

  function updateDetails(patch) {
    updateSection("details", patch);
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
