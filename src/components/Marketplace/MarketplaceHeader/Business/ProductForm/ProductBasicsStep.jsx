import ProductFormField from "./ProductFormField";
import ProductFormInput from "./ProductFormInput";

const CONDITIONS = ["new", "used", "refurbished"];

export default function ProductBasicsStep({ productForm }) {
  const { form, options, errors, updateSection } = productForm;

  return (
    <div className="space-y-5">
      <ProductFormField label="Product name" error={errors.name}>
        <ProductFormInput
          value={form.basics.name}
          onChange={(event) => updateSection("basics", { name: event.target.value })}
          placeholder="Wireless Headphones"
        />
      </ProductFormField>

      <ProductFormField label="Category" error={errors.category}>
        <select
          value={form.basics.category}
          onChange={(event) => updateSection("basics", { category: event.target.value })}
          className="h-11 w-full rounded-lg border border-gray-300 px-3 text-sm font-medium outline-none focus:border-blue-500"
        >
          {options.categories.map((category) => (
            <option key={category} value={category}>{category}</option>
          ))}
        </select>
      </ProductFormField>

      <ProductFormField label="Short product description" error={errors.description}>
        <textarea
          value={form.basics.description}
          onChange={(event) => updateSection("basics", { description: event.target.value })}
          rows={4}
          placeholder="Describe the product, condition, key features, and what buyers should know."
          className="w-full rounded-lg border border-gray-300 px-3 py-3 text-sm font-medium outline-none focus:border-blue-500"
        />
      </ProductFormField>

      <div>
        <p className="text-sm font-black text-gray-800">Condition</p>
        <div className="mt-2 grid gap-3 sm:grid-cols-3">
          {CONDITIONS.map((condition) => (
            <button
              key={condition}
              type="button"
              onClick={() => updateSection("basics", { condition })}
              className={`rounded-lg border p-4 text-left font-black capitalize ${
                form.basics.condition === condition
                  ? "border-blue-600 bg-blue-50 text-blue-800"
                  : "border-gray-200 bg-white text-gray-700"
              }`}
            >
              {condition}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <ProductFormField label="Brand optional">
          <ProductFormInput
            value={form.basics.brand}
            onChange={(event) => updateSection("basics", { brand: event.target.value })}
            placeholder="Sony"
          />
        </ProductFormField>
        <ProductFormField label="Model optional">
          <ProductFormInput
            value={form.basics.model}
            onChange={(event) => updateSection("basics", { model: event.target.value })}
            placeholder="WH-1000"
          />
        </ProductFormField>
      </div>
    </div>
  );
}
