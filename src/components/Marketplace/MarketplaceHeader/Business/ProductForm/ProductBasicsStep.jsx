import ProductFormField from "./ProductFormField";
import ProductFormInput from "./ProductFormInput";
import { useI18n, t } from "../../../../../i18n";

const CONDITION_KEYS = { new: "condNew", used: "condUsed", refurbished: "condRefurbished" };
const CONDITIONS = ["new", "used", "refurbished"];

export default function ProductBasicsStep({ productForm }) {
  useI18n();
  const { form, options, errors, updateSection } = productForm;

  return (
    <div className="space-y-5">
      <ProductFormField label={t("urmall.biz.pform.productName")} error={errors.name}>
        <ProductFormInput
          value={form.basics.name}
          onChange={(event) => updateSection("basics", { name: event.target.value })}
          placeholder={t("urmall.biz.pform.productNamePlaceholder")}
        />
      </ProductFormField>

      <ProductFormField label={t("urmall.biz.cat.category")} error={errors.category}>
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

      <ProductFormField label={t("urmall.biz.pform.shortDesc")} error={errors.description}>
        <textarea
          value={form.basics.description}
          onChange={(event) => updateSection("basics", { description: event.target.value })}
          rows={4}
          placeholder={t("urmall.biz.pform.descPlaceholder")}
          className="w-full rounded-lg border border-gray-300 px-3 py-3 text-sm font-medium outline-none focus:border-blue-500"
        />
      </ProductFormField>

      <div>
        <ProductFormField label={t("urmall.biz.cat.specCondition")}>
          <select
            value={form.basics.condition}
            onChange={(event) => updateSection("basics", { condition: event.target.value })}
            className="h-11 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm font-medium capitalize outline-none focus:border-blue-500"
          >
            {CONDITIONS.map((condition) => (
              <option key={condition} value={condition}>
                {t(`urmall.biz.pform.${CONDITION_KEYS[condition]}`)}
              </option>
            ))}
          </select>
        </ProductFormField>
      </div>

      <div className="rounded-xl border border-blue-100 bg-blue-50 p-4">
        <p className="text-sm font-black text-blue-900">{t("urmall.biz.pform.detailsNextTitle")}</p>
        <p className="mt-1 text-sm font-semibold leading-6 text-blue-700">
          {t("urmall.biz.pform.detailsNextHint")}
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <ProductFormField label={t("urmall.biz.pform.brandOptional")}>
          <ProductFormInput
            value={form.basics.brand}
            onChange={(event) => updateSection("basics", { brand: event.target.value })}
            placeholder={t("urmall.biz.pform.brandPlaceholder")}
          />
        </ProductFormField>
        <ProductFormField label={t("urmall.biz.pform.modelOptional")}>
          <ProductFormInput
            value={form.basics.model}
            onChange={(event) => updateSection("basics", { model: event.target.value })}
            placeholder={t("urmall.biz.pform.modelPlaceholder")}
          />
        </ProductFormField>
      </div>
    </div>
  );
}
