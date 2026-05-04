/* =========================
   HighDemand.jsx
   Popular & fast-selling products
========================= */

import BuyerProductGrid from "../BuyerProductGrid";

export default function HighDemand({
  products = [],
  loading = false,
  error = "",
  savedIds,
  onProductSelect,
  onAddToCart,
  onToggleSaved,
}) {
  return (
    <BuyerProductGrid
      products={products}
      loading={loading}
      error={error}
      savedIds={savedIds}
      onProductSelect={onProductSelect}
      onAddToCart={onAddToCart}
      onToggleSaved={onToggleSaved}
      emptyTitle="No high-demand products yet"
      emptyBody="Products with buyer views or sales will be ranked here."
    />
  );
}
