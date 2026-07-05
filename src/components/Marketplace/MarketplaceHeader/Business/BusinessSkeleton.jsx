function SkeletonBlock({ className = "" }) {
  return <div className={`rounded-lg bg-slate-200/80 ${className}`} />;
}

function MetricSkeleton() {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <SkeletonBlock className="h-3 w-20" />
      <SkeletonBlock className="mt-4 h-7 w-24" />
      <SkeletonBlock className="mt-3 h-2 w-full rounded-full bg-slate-100" />
    </div>
  );
}

function PanelSkeleton({ rows = 3 }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <SkeletonBlock className="h-4 w-36" />
          <SkeletonBlock className="mt-3 h-3 w-56 max-w-full bg-slate-100" />
        </div>
        <SkeletonBlock className="h-9 w-9 rounded-full" />
      </div>
      <div className="mt-5 space-y-3">
        {Array.from({ length: rows }).map((_, index) => (
          <div key={index} className="flex items-center gap-3 rounded-lg bg-slate-50 p-3">
            <SkeletonBlock className="h-9 w-9 rounded-full" />
            <div className="min-w-0 flex-1">
              <SkeletonBlock className="h-3 w-3/4 bg-slate-200" />
              <SkeletonBlock className="mt-2 h-2 w-1/2 bg-slate-100" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function VerticalHeroSkeleton() {
  return (
    <section className="rounded-[28px] bg-gradient-to-br from-slate-950 via-slate-900 to-emerald-950 p-5 shadow-xl">
      <div className="flex items-start gap-4">
        <SkeletonBlock className="h-12 w-12 rounded-2xl bg-white/10" />
        <div className="min-w-0 flex-1 space-y-3">
          <SkeletonBlock className="h-3 w-36 bg-white/10" />
          <SkeletonBlock className="h-6 w-56 max-w-full bg-white/15" />
          <SkeletonBlock className="h-3 w-72 max-w-full bg-white/10" />
        </div>
      </div>
      <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {[1, 2, 3, 4].map((item) => (
          <SkeletonBlock key={item} className="h-16 rounded-2xl bg-white/10" />
        ))}
      </div>
    </section>
  );
}

function VerticalActivityStripSkeleton() {
  return (
    <section className="grid grid-cols-3 gap-2 rounded-[24px] border border-slate-200 bg-white p-3 shadow-sm">
      {[1, 2, 3].map((item) => (
        <SkeletonBlock key={item} className="h-16 rounded-2xl bg-slate-100" />
      ))}
    </section>
  );
}

function MealRowSkeleton() {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-3">
      <div className="flex gap-3">
        <SkeletonBlock className="h-20 w-20 shrink-0 rounded-xl" />
        <div className="min-w-0 flex-1 space-y-2 pt-1">
          <SkeletonBlock className="h-4 w-3/4" />
          <SkeletonBlock className="h-4 w-24 bg-slate-100" />
          <SkeletonBlock className="h-3 w-28 bg-slate-100" />
        </div>
      </div>
    </div>
  );
}

// Restaurant workspace: hero, day selector pills, activity strip, meal rows.
function RestaurantDashboardSkeleton() {
  return (
    <>
      <VerticalHeroSkeleton />
      <div className="flex gap-2 overflow-hidden">
        {[1, 2, 3, 4, 5, 6].map((item) => (
          <SkeletonBlock key={item} className="h-12 min-w-[92px] rounded-2xl bg-white" />
        ))}
      </div>
      <VerticalActivityStripSkeleton />
      <section className="rounded-[26px] border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <div className="space-y-2">
            <SkeletonBlock className="h-3 w-28 bg-slate-100" />
            <SkeletonBlock className="h-5 w-48" />
          </div>
          <SkeletonBlock className="h-11 w-28 rounded-2xl bg-orange-100" />
        </div>
        <div className="mt-5 grid gap-3 md:grid-cols-2">
          {[1, 2, 3, 4].map((item) => (
            <MealRowSkeleton key={item} />
          ))}
        </div>
      </section>
    </>
  );
}

// Hotel workspace: hero, activity strip, horizontal gallery, video block.
function HotelDashboardSkeleton() {
  return (
    <>
      <VerticalHeroSkeleton />
      <VerticalActivityStripSkeleton />
      <section className="rounded-[26px] border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <div className="space-y-2">
            <SkeletonBlock className="h-3 w-24 bg-slate-100" />
            <SkeletonBlock className="h-5 w-56" />
          </div>
          <SkeletonBlock className="h-11 w-28 rounded-2xl bg-blue-100" />
        </div>
        <div className="mt-4 flex gap-3 overflow-hidden">
          {[1, 2, 3].map((item) => (
            <SkeletonBlock key={item} className="h-40 min-w-[240px] rounded-2xl" />
          ))}
        </div>
        <SkeletonBlock className="mt-4 h-56 w-full rounded-2xl bg-slate-900/10" />
      </section>
    </>
  );
}

// Property workspace: hero, activity strip, listing cards with tall media.
function PropertyDashboardSkeleton() {
  return (
    <>
      <VerticalHeroSkeleton />
      <VerticalActivityStripSkeleton />
      <section className="rounded-[26px] border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <div className="space-y-2">
            <SkeletonBlock className="h-3 w-28 bg-slate-100" />
            <SkeletonBlock className="h-5 w-56" />
          </div>
          <SkeletonBlock className="h-11 w-32 rounded-2xl bg-violet-100" />
        </div>
        <div className="mt-5 grid gap-4 md:grid-cols-2">
          {[1, 2].map((item) => (
            <div key={item} className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
              <SkeletonBlock className="h-44 w-full rounded-none" />
              <div className="space-y-3 p-4">
                <SkeletonBlock className="h-6 w-20 rounded-full bg-violet-100" />
                <SkeletonBlock className="h-5 w-3/4" />
                <SkeletonBlock className="h-3 w-1/2 bg-slate-100" />
                <SkeletonBlock className="h-3 w-2/3 bg-slate-100" />
              </div>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}

const VERTICAL_SKELETONS = {
  restaurant: RestaurantDashboardSkeleton,
  hotel: HotelDashboardSkeleton,
  property_agent: PropertyDashboardSkeleton,
};

export default function BusinessSkeleton({ kind = "retail" }) {
  const VerticalSkeleton = VERTICAL_SKELETONS[kind];

  if (VerticalSkeleton) {
    return (
      <div className="min-h-screen bg-slate-50 text-slate-950" aria-busy="true" aria-label={`Loading ${kind.replace("_", " ")} workspace`}>
        <div className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur">
          <div className="flex h-16 items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
            <div className="flex min-w-0 items-center gap-3">
              <SkeletonBlock className="h-11 w-11 rounded-2xl" />
              <div className="min-w-0 space-y-2">
                <SkeletonBlock className="h-3 w-20" />
                <SkeletonBlock className="h-4 w-40 max-w-[42vw]" />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <SkeletonBlock className="h-10 w-10 rounded-xl" />
              <SkeletonBlock className="hidden h-10 w-24 rounded-xl sm:block" />
            </div>
          </div>
        </div>
        <main className="w-full animate-pulse space-y-6 px-4 py-5 sm:px-6 lg:px-8">
          <VerticalSkeleton />
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-950" aria-busy="true" aria-label="Loading seller dashboard">
      <div className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="flex h-16 items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <SkeletonBlock className="h-11 w-11 rounded-2xl" />
            <div className="min-w-0 space-y-2">
              <SkeletonBlock className="h-3 w-20" />
              <SkeletonBlock className="h-4 w-40 max-w-[42vw]" />
            </div>
          </div>
          <SkeletonBlock className="hidden h-10 max-w-md flex-1 rounded-xl bg-slate-100 md:block" />
          <div className="flex items-center gap-2">
            <SkeletonBlock className="h-10 w-10 rounded-xl" />
            <SkeletonBlock className="hidden h-10 w-24 rounded-xl sm:block" />
          </div>
        </div>
      </div>

      <main className="w-full animate-pulse px-4 py-5 sm:px-6 lg:px-8">
        <div className="space-y-5">
          <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-start gap-4">
                <SkeletonBlock className="h-16 w-16 rounded-2xl" />
                <div className="min-w-0 flex-1">
                  <SkeletonBlock className="h-5 w-48 max-w-full" />
                  <SkeletonBlock className="mt-3 h-3 w-72 max-w-full bg-slate-100" />
                  <div className="mt-4 flex flex-wrap gap-2">
                    <SkeletonBlock className="h-7 w-24 rounded-full" />
                    <SkeletonBlock className="h-7 w-28 rounded-full bg-slate-100" />
                  </div>
                </div>
              </div>
              <div className="mt-5 grid gap-3 sm:grid-cols-3">
                <SkeletonBlock className="h-16 rounded-xl bg-slate-100" />
                <SkeletonBlock className="h-16 rounded-xl bg-slate-100" />
                <SkeletonBlock className="h-16 rounded-xl bg-slate-100" />
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <SkeletonBlock className="h-4 w-32" />
              <div className="mt-5 flex items-end gap-4">
                <SkeletonBlock className="h-20 w-20 rounded-full" />
                <div className="min-w-0 flex-1 space-y-3">
                  <SkeletonBlock className="h-3 w-full bg-slate-100" />
                  <SkeletonBlock className="h-3 w-4/5 bg-slate-100" />
                  <SkeletonBlock className="h-3 w-2/3 bg-slate-100" />
                </div>
              </div>
            </div>
          </section>

          <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <MetricSkeleton />
            <MetricSkeleton />
            <MetricSkeleton />
            <MetricSkeleton />
          </section>

          <div className="rounded-xl border border-slate-200 bg-white p-2 shadow-sm">
            <div className="grid grid-cols-4 gap-2">
              <SkeletonBlock className="h-11 rounded-lg" />
              <SkeletonBlock className="h-11 rounded-lg bg-slate-100" />
              <SkeletonBlock className="h-11 rounded-lg bg-slate-100" />
              <SkeletonBlock className="h-11 rounded-lg bg-slate-100" />
            </div>
          </div>

          <section className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
            <div className="space-y-5">
              <PanelSkeleton rows={3} />
              <PanelSkeleton rows={2} />
            </div>
            <div className="space-y-5">
              <PanelSkeleton rows={4} />
              <PanelSkeleton rows={2} />
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}
