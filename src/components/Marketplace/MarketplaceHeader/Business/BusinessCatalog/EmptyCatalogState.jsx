export default function EmptyCatalogState({ title = "No products yet", description = "Add your first product to start selling." }) {
  return (
    <div className="rounded-xl border bg-gray-50 p-6 text-center">
      <p className="font-medium">{title}</p>
      <p className="text-sm text-gray-600">{description}</p>
    </div>
  );
}
