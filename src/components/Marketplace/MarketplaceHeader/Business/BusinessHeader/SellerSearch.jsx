import { Search } from "lucide-react";

export default function SellerSearch({ query, onQueryChange, results }) {
  return (
    <div className="relative hidden w-full max-w-md xl:block">
      <Search
        className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
        size={18}
        strokeWidth={2.2}
      />
      <input
        type="search"
        value={query}
        onChange={(event) => onQueryChange(event.target.value)}
        placeholder="Search products, orders, tools"
        className="h-10 w-full rounded-lg border border-gray-200 bg-gray-50 pl-10 pr-3 text-sm font-medium text-gray-800 outline-none transition placeholder:text-gray-400 focus:border-gray-300 focus:bg-white"
      />

      {query && results.length > 0 ? (
        <div className="absolute left-0 right-0 top-12 rounded-lg border border-gray-200 bg-white p-2 shadow-lg">
          {results.map((item) => (
            <button
              type="button"
              key={item}
              className="block w-full rounded-md px-3 py-2 text-left text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              {item}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
