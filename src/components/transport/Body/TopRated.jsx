import { FiStar } from "react-icons/fi";

export default function TopRated({ onClick, count = 0, loading = false }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group h-40 rounded-3xl border border-amber-200 bg-amber-50/70 p-5 text-left shadow-lg shadow-amber-100/70 transition hover:-translate-y-0.5 hover:bg-amber-50 hover:shadow-xl"
    >
      <div className="flex h-full flex-col justify-between">
        <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white text-amber-600 shadow-sm transition group-hover:scale-105">
          <FiStar size={25} />
        </span>
        <span>
          <span className="block text-lg font-black text-slate-900">Top Rated</span>
          <span className="mt-1 block text-xs font-black uppercase tracking-wide text-amber-700">
            {loading ? "Loading..." : `${count} live fleets`}
          </span>
        </span>
      </div>
    </button>
  );
}
