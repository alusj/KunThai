// Displayed when the seller has no products yet

export default function EmptyCatalogState() {
  return (
    <div className="rounded-xl border bg-gray-50 p-6 text-center">
      <p className="font-medium">No products yet</p>
      <p className="text-sm text-gray-600">
        Add your first product to start selling.
      </p>
    </div>
  );
}
