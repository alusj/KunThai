// src/explore/connections/skeletons/ConnectionsSkeleton.jsx
export default function ConnectionsSkeleton() {
  return (
    <div className="w-full animate-pulse space-y-3">
      {[1, 2, 3, 4].map((item) => (
        <div key={item} className="flex items-center gap-3 rounded-[24px] border border-slate-200 bg-white px-4 py-4 shadow-sm">
          <div className="h-12 w-12 rounded-full bg-slate-200" />
          <div className="min-w-0 flex-1 space-y-2">
            <div className="h-4 w-40 rounded-full bg-slate-200" />
            <div className="h-3 w-28 rounded-full bg-slate-100" />
          </div>
          <div className="hidden h-10 w-24 rounded-2xl bg-slate-100 sm:block" />
        </div>
      ))}
    </div>
  );
}
