import { useI18n, t } from "../../../../../i18n";
import ProductSignalCard from "./ProductSignalCard";

export default function ProductSignals({ signals }) {
  useI18n();
  return (
    <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <h3 className="text-base font-black text-gray-950">{t("urmall.biz.ins.signalsTitle")}</h3>
      <p className="mt-1 text-sm font-medium text-gray-500">
        {t("urmall.biz.ins.signalsSubtitle")}
      </p>

      <div className="mt-4 grid gap-3">
        <ProductSignalCard
          title={t("urmall.biz.ins.mostViewed")}
          product={signals.mostViewed}
          tone="green"
        />
        <ProductSignalCard
          title={t("urmall.biz.ins.mostAbandoned")}
          product={signals.mostAbandoned}
          tone="amber"
        />
      </div>
    </section>
  );
}
