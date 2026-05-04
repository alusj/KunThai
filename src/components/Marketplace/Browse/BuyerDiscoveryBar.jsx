import { Filter, Search, SlidersHorizontal, X } from "lucide-react";

const SORT_OPTIONS = [
  { value: "newest", label: "Newest" },
  { value: "popular", label: "Popular" },
  { value: "price-low", label: "Price: low to high" },
  { value: "price-high", label: "Price: high to low" },
  { value: "discount", label: "Biggest deals" },
];

export default function BuyerDiscoveryBar({ filters, setFilters, categories = [], locations = [], onClear }) {
  function updateField(field, value) {
    setFilters((current) => ({ ...current, [field]: value }));
  }

  return (
    <section className="rounded-lg border border-gray-200 bg-white p-3 shadow-sm">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        <div className="flex min-h-11 flex-1 items-center gap-2 rounded-lg bg-gray-100 px-3 text-gray-500">
          <Search size={18} />
          <input
            value={filters.search}
            onChange={(event) => updateField("search", event.target.value)}
            placeholder="Search products, categories, or locations"
            className="h-11 min-w-0 flex-1 bg-transparent text-sm font-semibold text-gray-900 outline-none placeholder:text-gray-500"
          />
        </div>

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:flex lg:flex-none">
          <label className="flex h-11 items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 text-sm font-bold text-gray-600">
            <Filter size={16} className="text-emerald-700" />
            <select
              value={filters.category}
              onChange={(event) => updateField("category", event.target.value)}
              className="min-w-0 bg-transparent outline-none"
            >
              <option value="all">All categories</option>
              {categories.map((category) => (
                <option key={category} value={category}>
                  {category}
                </option>
              ))}
            </select>
          </label>

          <select
            value={filters.location}
            onChange={(event) => updateField("location", event.target.value)}
            className="h-11 rounded-lg border border-gray-200 bg-white px-3 text-sm font-bold text-gray-600 outline-none"
          >
            <option value="">All locations</option>
            {locations.map((location) => (
              <option key={location} value={location}>
                {location}
              </option>
            ))}
          </select>

          <select
            value={filters.delivery}
            onChange={(event) => updateField("delivery", event.target.value)}
            className="h-11 rounded-lg border border-gray-200 bg-white px-3 text-sm font-bold text-gray-600 outline-none"
          >
            <option value="all">Delivery or pickup</option>
            <option value="delivery">Delivery available</option>
            <option value="pickup">Pickup available</option>
          </select>

          <label className="flex h-11 items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 text-sm font-bold text-gray-600">
            <SlidersHorizontal size={16} className="text-emerald-700" />
            <select
              value={filters.sort}
              onChange={(event) => updateField("sort", event.target.value)}
              className="min-w-0 bg-transparent outline-none"
            >
              {SORT_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 sm:flex sm:items-center">
        <input
          value={filters.minPrice}
          onChange={(event) => updateField("minPrice", event.target.value)}
          inputMode="decimal"
          placeholder="Min price"
          className="h-10 rounded-lg border border-gray-200 px-3 text-sm font-semibold outline-none focus:border-emerald-500"
        />
        <input
          value={filters.maxPrice}
          onChange={(event) => updateField("maxPrice", event.target.value)}
          inputMode="decimal"
          placeholder="Max price"
          className="h-10 rounded-lg border border-gray-200 px-3 text-sm font-semibold outline-none focus:border-emerald-500"
        />
        <button
          type="button"
          onClick={onClear}
          className="col-span-2 inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-gray-950 px-4 text-sm font-black text-white transition hover:bg-emerald-700 sm:col-span-1"
        >
          <X size={15} />
          Clear
        </button>
      </div>
    </section>
  );
}
