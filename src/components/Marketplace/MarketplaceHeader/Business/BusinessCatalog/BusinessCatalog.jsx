import { useSellerProducts } from "../../../../../Backend/hooks/useSellerProducts";
import EmptyCatalogState from "./EmptyCatalogState";
import ProductManagementList from "./ProductManagementList";
import ProductSummaryGrid from "./ProductSummaryGrid";
import TopSellingProducts from "./TopSellingProducts";

export default function BusinessCatalog({ mode = "store" }) {
  const { summary, products, availableProducts, topSellingProducts, loading } = useSellerProducts();

  if (loading || !summary) {
    return <div className="h-64 rounded-xl bg-white shadow-sm" />;
  }

  const visibleProducts = mode === "catalog" ? availableProducts : products;
  const title = mode === "catalog" ? "Catalog" : "Store";
  const description =
    mode === "catalog"
      ? "Buyer-facing products that are available and in stock."
      : "All products, including drafts, sold out, pending review, paused, and available items.";

  return (
    <section className="space-y-4">
      <div>
        <h3 className="text-xl font-black text-gray-950">{title}</h3>
        <p className="mt-1 text-sm font-medium text-gray-500">
          {description}
        </p>
      </div>

      {mode === "store" ? <ProductSummaryGrid summary={summary} /> : null}

      {mode === "store" && topSellingProducts.length > 0 ? (
        <TopSellingProducts products={topSellingProducts} />
      ) : null}

      {visibleProducts.length === 0 ? (
        <EmptyCatalogState />
      ) : (
        <ProductManagementList products={visibleProducts} />
      )}
    </section>
  );
}
