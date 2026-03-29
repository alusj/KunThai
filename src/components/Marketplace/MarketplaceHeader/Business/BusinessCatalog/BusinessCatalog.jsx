// Shows a preview of the seller's products inside the dashboard

import ProductGrid from "./ProductGrid";
import EmptyCatalogState from "./EmptyCatalogState";

export default function BusinessCatalog() {
  // Mock product data (later from backend)
  const products = [
    { id: 1, name: "Headphones", price: 120, stock: 5 },
    { id: 2, name: "Speaker", price: 80, stock: 0 },
  ];

  return (
    <section className="space-y-3">
      <h3 className="text-lg font-semibold">Product Catalog</h3>

      {products.length === 0 ? (
        <EmptyCatalogState />
      ) : (
        <ProductGrid products={products} />
      )}
    </section>
  );
}
