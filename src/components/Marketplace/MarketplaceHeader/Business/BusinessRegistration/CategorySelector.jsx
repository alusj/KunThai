export default function CategorySelector({
  categories,
  selected,
  otherValue,
  error,
  otherError,
  onToggle,
  onOtherChange,
  onOtherAdd,
}) {
  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-3">
        <p className="text-sm font-black text-gray-800">Business categories</p>
        <p className="text-sm font-bold text-gray-500">{selected.length}/5 selected</p>
      </div>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {categories.map((category) => {
          const active = selected.includes(category);
          return (
            <button
              key={category}
              type="button"
              onClick={() => onToggle(category)}
              className={`rounded-lg border px-3 py-3 text-left text-sm font-bold transition ${
                active
                  ? "border-blue-600 bg-blue-50 text-blue-800"
                  : "border-gray-200 bg-white text-gray-700 hover:bg-gray-50"
              }`}
            >
              {category}
            </button>
          );
        })}
      </div>
      {selected.includes("Other") ? (
        <div className="mt-3 rounded-lg border border-gray-200 bg-gray-50 p-3">
          <p className="text-sm font-black text-gray-800">Tell us what we missed</p>
          <div className="mt-2 flex flex-col gap-2 sm:flex-row">
            <input
              value={otherValue}
              onChange={(event) => onOtherChange(event.target.value)}
              placeholder="Type your business category"
              className="h-11 flex-1 rounded-lg border border-gray-300 px-3 text-sm font-medium outline-none transition focus:border-blue-500"
            />
            <button
              type="button"
              onClick={onOtherAdd}
              className="rounded-lg bg-gray-900 px-4 py-3 text-sm font-black text-white hover:bg-gray-800"
            >
              Add Category
            </button>
          </div>
          {otherError ? <p className="mt-2 text-xs font-bold text-red-600">{otherError}</p> : null}
        </div>
      ) : null}
      {error ? <p className="mt-2 text-xs font-bold text-red-600">{error}</p> : null}
    </div>
  );
}
