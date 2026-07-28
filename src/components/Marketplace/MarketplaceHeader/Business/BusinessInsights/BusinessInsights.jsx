import { useSellerInsights } from "../../../../../Backend/hooks/useSellerInsights";
import { useI18n, t } from "../../../../../i18n";
import InsightMetricsGrid from "./InsightMetricsGrid";
import ProductSignals from "./ProductSignals";
import SearchTermList from "./SearchTermList";
import TrafficSources from "./TrafficSources";

export default function BusinessInsights() {
  useI18n();
  const { metrics, trafficSources, searchTerms, productSignals, loading } = useSellerInsights();

  if (loading || !metrics || !productSignals) return null;

  return (
    <section className="space-y-4 rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <div>
        <p className="text-sm font-black uppercase text-emerald-700">{t("urmall.biz.ins.kicker")}</p>
        <h3 className="mt-1 text-xl font-black text-gray-950">
          {t("urmall.biz.ins.title")}
        </h3>
        <p className="mt-1 text-sm font-medium text-gray-500">
          {t("urmall.biz.ins.subtitle")}
        </p>
      </div>

      <InsightMetricsGrid metrics={metrics} />
      <TrafficSources sources={trafficSources} />
      <SearchTermList terms={searchTerms} />
      <ProductSignals signals={productSignals} />
    </section>
  );
}
