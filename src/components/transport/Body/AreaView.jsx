import { FiMapPin, FiNavigation } from "react-icons/fi";

export default function AreaView({ onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group relative h-40 overflow-hidden rounded-3xl border border-sky-200 bg-white text-left shadow-lg shadow-sky-100/70 transition hover:-translate-y-0.5 hover:shadow-xl"
    >
      <div className="absolute inset-0 bg-sky-50" />
      <div className="absolute inset-0 opacity-80 [background-image:linear-gradient(90deg,rgba(14,165,233,0.18)_1px,transparent_1px),linear-gradient(0deg,rgba(16,185,129,0.16)_1px,transparent_1px)] [background-size:22px_22px]" />
      <div className="absolute left-6 top-7 h-3 w-3 rounded-full bg-emerald-700 ring-4 ring-white" />
      <div className="absolute right-8 top-12 h-3 w-3 rounded-full bg-amber-500 ring-4 ring-white" />
      <div className="absolute left-10 top-14 h-1 w-[72%] rotate-[-8deg] rounded-full bg-emerald-600 shadow-sm" />
      <div className="absolute bottom-0 left-0 right-0 bg-white/90 p-4 backdrop-blur">
        <div className="flex items-center justify-between gap-3">
          <span>
            <span className="block text-base font-black text-slate-900">Nearby Area</span>
            <span className="mt-0.5 block text-xs font-bold text-slate-500">Map, routes, locations</span>
          </span>
          <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-950 text-white transition group-hover:bg-emerald-700">
            <FiNavigation size={20} />
          </span>
        </div>
      </div>
      <FiMapPin className="absolute right-12 top-16 text-sky-600" size={18} />
    </button>
  );
}
