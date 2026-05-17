import { useMemo, useState } from "react";
import { Filter, MapPin, Search, SlidersHorizontal, Truck, X } from "lucide-react";

const SORT_OPTIONS = [
  { value: "newest", label: "Newest" },
  { value: "popular", label: "Popular" },
  { value: "price-low", label: "Price: low to high" },
  { value: "price-high", label: "Price: high to low" },
  { value: "discount", label: "Biggest deals" },
];

export default function BuyerDiscoveryBar({ filters, setFilters, categories = [], locations = [], onClear }) {
  const [filtersOpen, setFiltersOpen] = useState(false);
  const activeFilters = useMemo(
    () => [
      filters.category !== "all" ? filters.category : "",
      filters.location,
      filters.delivery !== "all" ? filters.delivery === "delivery" ? "Delivery" : "Pickup" : "",
      filters.minPrice ? `Min ${filters.minPrice}` : "",
      filters.maxPrice ? `Max ${filters.maxPrice}` : "",
      filters.sort !== "newest" ? SORT_OPTIONS.find((option) => option.value === filters.sort)?.label : "",
    ].filter(Boolean),
    [filters],
  );

  function updateField(field, value) {
    setFilters((current) => ({ ...current, [field]: value }));
  }

  function renderFilterControls() {
    return (
      <>
      <label className="flex h-11 items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 text-sm font-bold text-gray-600">
        <Filter size={16} className="text-emerald-700" />
        <select
          value={filters.category}
          onChange={(event) => updateField("category", event.target.value)}
          className="min-w-0 flex-1 bg-transparent outline-none"
        >
          <option value="all">All categories</option>
          {categories.map((category) => (
            <option key={category} value={category}>
              {category}
            </option>
          ))}
        </select>
      </label>

      <label className="flex h-11 items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 text-sm font-bold text-gray-600">
        <MapPin size={16} className="text-emerald-700" />
        <select
          value={filters.location}
          onChange={(event) => updateField("location", event.target.value)}
          className="min-w-0 flex-1 bg-transparent outline-none"
        >
          <option value="">All locations</option>
          {locations.map((location) => (
            <option key={location} value={location}>
              {location}
            </option>
          ))}
        </select>
      </label>

      <label className="flex h-11 items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 text-sm font-bold text-gray-600">
        <Truck size={16} className="text-emerald-700" />
        <select
          value={filters.delivery}
          onChange={(event) => updateField("delivery", event.target.value)}
          className="min-w-0 flex-1 bg-transparent outline-none"
        >
          <option value="all">Delivery or pickup</option>
          <option value="delivery">Delivery available</option>
          <option value="pickup">Pickup available</option>
        </select>
      </label>

      <label className="flex h-11 items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 text-sm font-bold text-gray-600">
        <SlidersHorizontal size={16} className="text-emerald-700" />
        <select
          value={filters.sort}
          onChange={(event) => updateField("sort", event.target.value)}
          className="min-w-0 flex-1 bg-transparent outline-none"
        >
          {SORT_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
      </>
    );
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

        <button
          type="button"
          onClick={() => setFiltersOpen(true)}
          className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-gray-950 px-4 text-sm font-black text-white lg:hidden"
        >
          <SlidersHorizontal size={17} />
          Filters
        </button>

        <div className="hidden grid-cols-2 gap-2 sm:grid-cols-4 lg:grid lg:flex-none">
          {renderFilterControls()}
        </div>
      </div>

      <div className="mt-3 hidden grid-cols-2 gap-2 sm:flex sm:items-center lg:flex">
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

      {activeFilters.length ? (
        <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
          {activeFilters.map((filter) => (
            <span key={filter} className="shrink-0 rounded-full bg-emerald-50 px-3 py-1 text-xs font-black text-emerald-700">
              {filter}
            </span>
          ))}
        </div>
      ) : null}

      {filtersOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button type="button" aria-label="Close filters" onClick={() => setFiltersOpen(false)} className="absolute inset-0 bg-gray-950/45" />
          <div className="absolute inset-x-0 bottom-0 rounded-t-2xl bg-white p-4 shadow-2xl">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-black uppercase text-emerald-700">UrMall</p>
                <h3 className="text-lg font-black text-gray-950">Filter products</h3>
              </div>
              <button
                type="button"
                onClick={() => setFiltersOpen(false)}
                className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-gray-100 text-gray-700"
                aria-label="Close filters"
              >
                <X size={18} />
              </button>
            </div>
            <div className="mt-4 grid gap-2">{renderFilterControls()}</div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <input
                value={filters.minPrice}
                onChange={(event) => updateField("minPrice", event.target.value)}
                inputMode="decimal"
                placeholder="Min price"
                className="h-11 rounded-lg border border-gray-200 px-3 text-sm font-semibold outline-none focus:border-emerald-500"
              />
              <input
                value={filters.maxPrice}
                onChange={(event) => updateField("maxPrice", event.target.value)}
                inputMode="decimal"
                placeholder="Max price"
                className="h-11 rounded-lg border border-gray-200 px-3 text-sm font-semibold outline-none focus:border-emerald-500"
              />
            </div>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <button type="button" onClick={onClear} className="h-11 rounded-lg border border-gray-200 text-sm font-black text-gray-700">
                Clear
              </button>
              <button type="button" onClick={() => setFiltersOpen(false)} className="h-11 rounded-lg bg-emerald-600 text-sm font-black text-white">
                Show products
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
