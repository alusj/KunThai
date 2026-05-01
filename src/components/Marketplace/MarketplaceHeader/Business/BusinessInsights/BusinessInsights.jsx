import { useSellerInsights } from "../../../../../Backend/hooks/useSellerInsights";
import InsightMetricsGrid from "./InsightMetricsGrid";
import ProductSignals from "./ProductSignals";
import SearchTermList from "./SearchTermList";
import TrafficSources from "./TrafficSources";

export default function BusinessInsights() {
  const { metrics, trafficSources, searchTerms, productSignals, loading } = useSellerInsights();

  if (loading || !metrics || !productSignals) {
    return <div className="h-80 rounded-xl bg-white shadow-sm" />;
  }

  return (
    <section className="space-y-4 rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <div>
        <p className="text-sm font-black uppercase text-emerald-700">Business Insights</p>
        <h3 className="mt-1 text-xl font-black text-gray-950">
          Buyer behavior and discovery
        </h3>
        <p className="mt-1 text-sm font-medium text-gray-500">
          See how buyers find, click, and convert on your products.
        </p>
      </div>

      <InsightMetricsGrid metrics={metrics} />
      <TrafficSources sources={trafficSources} />
      <SearchTermList terms={searchTerms} />
      <ProductSignals signals={productSignals} />
    </section>
  );
}
