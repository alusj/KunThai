import { FiClock } from "react-icons/fi";

export default function TourHistory({ onClick, count = 0, loading = false }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group h-40 rounded-3xl border border-indigo-200 bg-indigo-50/70 p-5 text-left shadow-lg shadow-indigo-100/70 transition hover:-translate-y-0.5 hover:bg-indigo-50 hover:shadow-xl"
    >
      <div className="flex h-full flex-col justify-between">
        <span>
          <span className="block text-lg font-black text-slate-900">Active Trips</span>
          <span className="mt-1 block text-xs font-black uppercase tracking-wide text-indigo-700">
            {loading ? "Loading..." : `${count} live`}
          </span>
        </span>
        <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white text-indigo-600 shadow-sm transition group-hover:scale-105">
          <FiClock size={24} />
        </span>
      </div>
    </button>
  );
}
