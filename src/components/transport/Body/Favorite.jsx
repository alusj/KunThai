import { FiHeart } from "react-icons/fi";

export default function Favorite({ onClick, count = 0, loading = false }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group h-40 rounded-3xl border border-rose-200 bg-rose-50/70 p-5 text-left shadow-lg shadow-rose-100/70 transition hover:-translate-y-0.5 hover:bg-rose-50 hover:shadow-xl"
    >
      <div className="flex h-full flex-col justify-between">
        <span>
          <span className="block text-lg font-black text-slate-900">Saved Operators</span>
          <span className="mt-1 block text-xs font-black uppercase tracking-wide text-rose-700">
            {loading ? "Loading..." : `${count} saved`}
          </span>
        </span>
        <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white text-rose-600 shadow-sm transition group-hover:scale-105">
          <FiHeart size={24} />
        </span>
      </div>
    </button>
  );
}
