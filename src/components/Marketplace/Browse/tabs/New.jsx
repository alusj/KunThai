/* =========================
   New.jsx
   Shows newly added products
========================= */

import BuyerProductGrid from "../BuyerProductGrid";

export default function New({
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
      emptyTitle="No products yet"
      emptyBody="Active seller products with stock will appear here for buyers."
    />
  );
}
