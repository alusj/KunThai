// Loading placeholder for MyBiz

export default function BusinessSkeleton() {
  return (
    <div className="space-y-4 animate-pulse">

      <div className="h-20 bg-slate-200 rounded-lg" />

      <div className="grid grid-cols-2 gap-3">
        <div className="h-16 bg-slate-200 rounded-lg" />
        <div className="h-16 bg-slate-200 rounded-lg" />
      </div>

      <div className="h-12 bg-slate-200 rounded-lg" />
      <div className="h-20 bg-slate-200 rounded-lg" />

    </div>
  );
}
