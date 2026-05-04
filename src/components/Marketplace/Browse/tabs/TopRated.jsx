/* =========================
   TopRated.jsx
   Highest rated products
========================= */

import BuyerProductGrid from "../BuyerProductGrid";

export default function TopRated({
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
      emptyTitle="No top-rated products yet"
      emptyBody="Active products will appear here while rating data is being built."
    />
  );
}
