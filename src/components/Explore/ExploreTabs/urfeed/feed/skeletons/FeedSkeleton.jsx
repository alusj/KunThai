export default function FeedSkeleton() {
  return (
    <div className="mt-4 w-full space-y-4 px-4 pb-8 sm:px-5">
      {[1, 2, 3].map((item) => (
        <div key={item} className="animate-pulse overflow-hidden rounded-[24px] border border-slate-200 bg-white shadow-sm">
          <div className="h-1 w-full bg-gradient-to-r from-sky-100 via-slate-100 to-sky-100" />
          <div className="p-5">
            <div className="flex items-center gap-3">
              <div className="h-12 w-12 rounded-full bg-slate-200" />
              <div className="min-w-0 flex-1 space-y-2">
                <div className="h-4 w-40 max-w-full rounded-full bg-slate-200" />
                <div className="h-3 w-24 max-w-full rounded-full bg-slate-100" />
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
        </div>
      ))}
    </div>
  );
}
