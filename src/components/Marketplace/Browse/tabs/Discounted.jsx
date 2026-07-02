/* =========================
   Discounted.jsx
   Products with discounts
========================= */

import BuyerProductGrid from "../BuyerProductGrid";

export default function Discounted({
  products = [],
  loading = false,
  error = "",
  savedIds,
  onProductSelect,
  onAddToCart,
  onToggleSaved,
  supplementalContent,
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
      supplementalContent={supplementalContent}
      emptyTitle="No discounted products"
      emptyBody="Products with a seller discount price will show up in this section."
    />
  );
}
