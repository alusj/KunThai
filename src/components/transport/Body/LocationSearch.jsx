import { FiMapPin, FiNavigation, FiSearch, FiSliders } from "react-icons/fi";

export default function LocationSearch() {
  return (
    <section className="mb-5 rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
      <div className="grid gap-3 lg:grid-cols-[1fr_auto] lg:items-center">
        <label className="relative block">
          <span className="sr-only">Find nearby locations</span>
          <FiSearch
            size={19}
            className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400"
          />
          <input
            type="search"
            placeholder="Where are you going?"
            className="h-12 w-full rounded-2xl border border-gray-200 bg-gray-50 pl-11 pr-4 text-sm font-medium text-gray-900 outline-none transition placeholder:text-gray-400 focus:border-green-500 focus:bg-white focus:ring-4 focus:ring-green-100"
          />
        </label>

        <div className="grid grid-cols-3 gap-2 sm:flex">
          <button
            type="button"
            className="h-12 rounded-2xl border border-gray-200 px-3 text-sm font-semibold text-gray-700 hover:border-green-200 hover:bg-green-50 transition flex items-center justify-center gap-2"
          >
            <FiNavigation size={17} />
            <span className="hidden sm:inline">Nearby</span>
          </button>
          <button
            type="button"
            className="h-12 rounded-2xl border border-gray-200 px-3 text-sm font-semibold text-gray-700 hover:border-green-200 hover:bg-green-50 transition flex items-center justify-center gap-2"
          >
            <FiMapPin size={17} />
            <span className="hidden sm:inline">Pickup</span>
          </button>
          <button
            type="button"
            aria-label="Transport filters"
            className="h-12 rounded-2xl border border-gray-200 px-3 text-sm font-semibold text-gray-700 hover:border-green-200 hover:bg-green-50 transition flex items-center justify-center gap-2"
          >
            <FiSliders size={17} />
            <span className="hidden sm:inline">Filters</span>
          </button>
        </div>
      </div>
    </section>
  );
}
