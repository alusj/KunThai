/* =========================
   TopRated.jsx
   Highest rated products
========================= */

import { useI18n } from "../../../../i18n";
import BuyerProductGrid from "../BuyerProductGrid";

export default function TopRated({
  products = [],
  loading = false,
  error = "",
  savedIds,
  onProductSelect,
  onAddToCart,
  onToggleSaved,
  supplementalContent,
}) {
  const { t } = useI18n();
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
      emptyTitle={t("urmall.browse.emptyTopRatedTitle")}
      emptyBody={t("urmall.browse.emptyTopRatedBody")}
    />
  );
}
