import { useSellerAttention } from "../../../../../Backend/hooks/useSellerAttention";
import AttentionEmptyState from "./AttentionEmptyState";
import AttentionItem from "./AttentionItem";
import AttentionSummary from "./AttentionSummary";

export default function BusinessAttention() {
  const { items, summary, loading } = useSellerAttention();

  if (loading) {
    return <div className="h-56 rounded-xl bg-white shadow-sm" />;
  }

  return (
    <section className="space-y-4">
      <div className="flex flex-col gap-3 rounded-xl border border-gray-200 bg-white p-5 shadow-sm lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="text-sm font-black uppercase text-red-600">Attention Center</p>
          <h3 className="mt-1 text-xl font-black text-gray-950">
            {summary.total} seller task{summary.total === 1 ? "" : "s"} need review
          </h3>
          <p className="mt-1 text-sm font-medium text-gray-500">
            Handle urgent work before it affects sales, payouts, or buyer trust.
          </p>
        </div>

        <AttentionSummary summary={summary} />
      </div>

      {items.length === 0 ? (
        <AttentionEmptyState />
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {items.map((item) => (
            <AttentionItem key={item.id} item={item} />
          ))}
        </div>
      )}
    </section>
  );
}
