import { useI18n, t } from "../../../../../i18n";
import SuggestedProductCard from "./SuggestedProductCard";

export default function SuggestedProducts({ onPromote, products }) {
  useI18n();
  return (
    <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <h3 className="text-lg font-black text-gray-950">{t("urmall.biz.promo.suggestedTitle")}</h3>
      <p className="mt-1 text-sm font-medium text-gray-500">
        {t("urmall.biz.promo.suggestedSubtitle")}
      </p>

      <div className="mt-4 grid gap-3 md:grid-cols-3">
        {products.map((product) => (
          <SuggestedProductCard key={product.id} onPromote={onPromote} product={product} />
        ))}
      </div>
    </section>
  );
}
