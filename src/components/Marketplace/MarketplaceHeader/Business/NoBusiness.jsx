// Shown when user has no registered business

export default function NoBusiness() {
  return (
    <div className="bg-white rounded-lg p-6 text-center shadow-sm">

      <h3 className="font-semibold text-lg text-gray-800">
        You don’t have a business yet
      </h3>

      <p className="text-gray-600 mt-2">
        Create a business to start selling products on UrSalone.
      </p>

      <button className="mt-4 bg-emerald-600 text-white px-6 py-2 rounded-lg text-sm">
        Create Business
      </button>

    </div>
  );
}
