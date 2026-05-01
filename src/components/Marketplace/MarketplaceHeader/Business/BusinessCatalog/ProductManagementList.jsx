import ProductManagementRow from "./ProductManagementRow";

export default function ProductManagementList({ products, onAction }) {
  return (
    <section className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
      <div className="px-4 py-4">
        <h3 className="text-lg font-black text-gray-950">Product Management</h3>
        <p className="mt-1 text-sm font-medium text-gray-500">
          Review inventory, visibility, sales, and quick product actions.
        </p>
      </div>

      <div>
        {products.map((product) => (
          <ProductManagementRow key={product.id} product={product} onAction={onAction} />
        ))}
      </div>
    </section>
  );
}
