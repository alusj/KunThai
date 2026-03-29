export default function NoBusiness() {
  return (
    <div className="p-6 text-center text-gray-600">
      {/* Guard screen: seller has no business */}
      <p className="text-lg font-medium">
        No business found.
      </p>
      <p className="mt-2 text-sm">
        Please create your business profile to access this section.
      </p>
    </div>
  );
}
