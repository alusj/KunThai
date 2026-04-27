export default function FeedSkeleton() {
  return (
    <div className="mt-4 w-full space-y-4 px-4 pb-8 sm:px-5">
      {[1, 2, 3].map((item) => (
        <div key={item} className="animate-pulse rounded-[24px] border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="h-12 w-12 rounded-full bg-slate-200" />
            <div className="flex-1 space-y-2">
              <div className="h-4 w-40 rounded-full bg-slate-200" />
              <div className="h-3 w-24 rounded-full bg-slate-100" />
            </div>
          </div>

          <div className="mt-5 space-y-3">
            <div className="h-4 w-full rounded-full bg-slate-100" />
            <div className="h-4 w-4/5 rounded-full bg-slate-100" />
            <div className="h-40 w-full rounded-[20px] bg-slate-100" />
          </div>

          <div className="mt-5 grid grid-cols-3 gap-3">
            <div className="h-10 rounded-2xl bg-slate-100" />
            <div className="h-10 rounded-2xl bg-slate-100" />
            <div className="h-10 rounded-2xl bg-slate-100" />
          </div>
        </div>
      ))}
    </div>
  );
}
