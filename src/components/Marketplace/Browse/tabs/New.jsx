import { useI18n } from "../../../../i18n";
import BuyerProductGrid from "../BuyerProductGrid";

export default function New({
  products = [],
  loading = false,
  error = "",
  savedIds,
  onProductSelect,
  onAddToCart,
  onToggleSaved,
  supplementalContent,
  priorityCategory,
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
      priorityCategory={priorityCategory}
      emptyTitle={t("urmall.browse.emptyNewTitle")}
      emptyBody={t("urmall.browse.emptyNewBody")}
    />
  );
}
