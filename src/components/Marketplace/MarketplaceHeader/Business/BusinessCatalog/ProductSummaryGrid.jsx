import ProductSummaryCard from "./ProductSummaryCard";

export default function ProductSummaryGrid({ summary }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
      <ProductSummaryCard label="Active" value={summary.active} tone="green" />
      <ProductSummaryCard label="Drafts" value={summary.draft} />
      <ProductSummaryCard label="Out of stock" value={summary.outOfStock} tone="red" />
      <ProductSummaryCard label="Low stock" value={summary.lowStock} tone="amber" />
      <ProductSummaryCard label="Pending review" value={summary.pendingReview} tone="blue" />
      <ProductSummaryCard label="No views/sales" value={summary.noViewsOrSales} tone="amber" />
    </div>
  );
}
