import { useSellerProducts } from "../../../../../Backend/hooks/useSellerProducts";
import EmptyCatalogState from "./EmptyCatalogState";
import ProductManagementList from "./ProductManagementList";
import ProductSummaryGrid from "./ProductSummaryGrid";
import TopSellingProducts from "./TopSellingProducts";

export default function BusinessCatalog({ mode = "store", onEditProduct, onPromoteProduct, onViewProduct }) {
  const {
    summary,
    products,
    availableProducts,
    draftProducts,
    topSellingProducts,
    actionMessage,
    actionError,
    handleProductAction,
    loading,
  } = useSellerProducts();

  if (loading || !summary) return <SectionSkeleton title="Loading catalog" />;

  const storeProducts = products.filter((product) => product.status !== "draft");
  const visibleProducts = mode === "catalog" ? availableProducts : mode === "drafts" ? draftProducts : storeProducts;
  const title = mode === "catalog" ? "Catalog" : mode === "drafts" ? "Draft" : "Store";
  const description =
    mode === "catalog"
      ? "Buyer-facing products that are available and in stock."
      : mode === "drafts"
        ? "Saved products waiting to be finished or published."
      : "All live store products, including sold out, pending review, paused, and available items.";
  const emptyState =
    mode === "catalog"
      ? {
        title: "No catalog products",
        description: "Publish active products with stock so buyers can see them here.",
      }
      : mode === "drafts"
        ? {
          title: "No drafts",
          description: "Draft listings you save for later will appear here.",
        }
        : {
          title: "No store products",
          description: "Add your first product to start selling.",
        };

  return (
    <section className="space-y-4">
      <div>
        <h3 className="text-xl font-black text-gray-950">{title}</h3>
        <p className="mt-1 text-sm font-medium text-gray-500">
          {description}
        </p>
      </div>

      {mode === "store" ? <ProductSummaryGrid summary={summary} /> : null}

      {actionMessage ? (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm font-bold text-emerald-700">
          {actionMessage}
        </div>
      ) : null}
      {actionError ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm font-bold text-red-700">
          {actionError}
        </div>
      ) : null}

      {mode === "store" && topSellingProducts.length > 0 ? (
        <TopSellingProducts products={topSellingProducts} />
      ) : null}

      {visibleProducts.length === 0 ? (
        <EmptyCatalogState title={emptyState.title} description={emptyState.description} />
      ) : (
        <ProductManagementList
          mode={mode}
          products={visibleProducts}
          onViewProduct={onViewProduct}
          onAction={(product, action) => {
            if (action === "view-product") {
              onViewProduct?.(product);
              return;
            }
            if (action === "edit-listing") {
              onEditProduct?.(product);
              return;
            }
            if (action === "promote") {
              onPromoteProduct?.(product);
              return;
            }
            handleProductAction(product, action);
          }}
        />
      )}
    </section>
  );
}

function SectionSkeleton({ title }) {
  return (
    <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm" aria-busy="true">
      <p className="text-sm font-black text-gray-500">{title}</p>
      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {[0, 1, 2].map((item) => (
          <div key={item} className="h-28 animate-pulse rounded-lg bg-gray-100" />
        ))}
      </div>
    </section>
  );
}
