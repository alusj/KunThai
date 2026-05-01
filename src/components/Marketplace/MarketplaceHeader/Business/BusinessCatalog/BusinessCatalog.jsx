import { useSellerProducts } from "../../../../../Backend/hooks/useSellerProducts";
import EmptyCatalogState from "./EmptyCatalogState";
import ProductManagementList from "./ProductManagementList";
import ProductSummaryGrid from "./ProductSummaryGrid";
import TopSellingProducts from "./TopSellingProducts";

export default function BusinessCatalog() {
  const { summary, products, topSellingProducts, loading } = useSellerProducts();

  if (loading || !summary) {
    return <div className="h-64 rounded-xl bg-white shadow-sm" />;
  }

  return (
    <section className="space-y-4">
      <div>
        <h3 className="text-xl font-black text-gray-950">Products & Inventory</h3>
        <p className="mt-1 text-sm font-medium text-gray-500">
          Manage product status, stock health, performance, and quick actions.
        </p>
      </div>

      <ProductSummaryGrid summary={summary} />

      {topSellingProducts.length > 0 ? (
        <TopSellingProducts products={topSellingProducts} />
      ) : null}

      {products.length === 0 ? (
        <EmptyCatalogState />
      ) : (
        <ProductManagementList products={products} />
      )}
    </section>
  );
}
