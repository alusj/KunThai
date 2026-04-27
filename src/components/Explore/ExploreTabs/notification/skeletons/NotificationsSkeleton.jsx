export default function NotificationsSkeleton() {
  return (
    <div className="w-full space-y-3 px-4 pt-4 sm:px-5">
      {[1, 2, 3, 4].map((item) => (
        <div key={item} className="animate-pulse rounded-[22px] border border-slate-200 bg-white px-4 py-4 shadow-sm">
          <div className="flex gap-3">
            <div className="h-11 w-11 rounded-2xl bg-slate-200" />
            <div className="flex-1 space-y-2">
              <div className="h-4 w-3/4 rounded-full bg-slate-200" />
              <div className="h-3 w-1/2 rounded-full bg-slate-100" />
              <div className="h-3 w-24 rounded-full bg-slate-100" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
