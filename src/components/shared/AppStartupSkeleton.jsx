function SkeletonBlock({ className = "" }) {
  return <div className={`kt-startup-shimmer ${className}`} aria-hidden="true" />;
}

function AppShellHeader({ dark = false, compact = false }) {
  return (
    <header
      className={`sticky top-0 z-20 border-b px-4 pb-3 pt-[calc(var(--kt-safe-area-top)+0.75rem)] ${
        dark
          ? "border-slate-800 bg-slate-950"
          : "border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950"
      }`}
    >
      <div className="flex items-center gap-3">
        <SkeletonBlock className={`${compact ? "h-10 w-10 rounded-2xl" : "h-11 w-11 rounded-full"} shrink-0`} />
        <div className="min-w-0 flex-1 space-y-2">
          <SkeletonBlock className="h-2.5 w-16 rounded-full" />
          <SkeletonBlock className="h-4 w-28 rounded-full" />
        </div>
        <div className="flex gap-2">
          <SkeletonBlock className="h-10 w-10 rounded-2xl" />
          <SkeletonBlock className="h-10 w-10 rounded-2xl" />
          <SkeletonBlock className="hidden h-10 w-10 rounded-2xl min-[360px]:block" />
        </div>
      </div>
    </header>
  );
}

function FeedCardSkeleton({ mediaHeight = "h-44" }) {
  return (
    <article className="rounded-[24px] border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div className="flex items-center gap-3">
        <SkeletonBlock className="h-11 w-11 shrink-0 rounded-full" />
        <div className="flex-1 space-y-2">
          <SkeletonBlock className="h-3.5 w-2/5 rounded-full" />
          <SkeletonBlock className="h-2.5 w-1/4 rounded-full" />
        </div>
        <SkeletonBlock className="h-8 w-8 rounded-full" />
      </div>
      <div className="mt-4 space-y-2">
        <SkeletonBlock className="h-3 w-full rounded-full" />
        <SkeletonBlock className="h-3 w-4/5 rounded-full" />
      </div>
      <SkeletonBlock className={`mt-4 w-full rounded-[20px] ${mediaHeight}`} />
      <div className="mt-4 grid grid-cols-3 gap-3">
        <SkeletonBlock className="h-9 rounded-xl" />
        <SkeletonBlock className="h-9 rounded-xl" />
        <SkeletonBlock className="h-9 rounded-xl" />
      </div>
    </article>
  );
}

function ExploreSkeleton() {
  return (
    <>
      <AppShellHeader />
      <main className="px-4 pb-28 pt-3 sm:px-5">
        <div className="grid grid-cols-3 gap-2 rounded-[22px] bg-white p-1.5 shadow-sm dark:bg-slate-900">
          <SkeletonBlock className="h-11 rounded-[18px]" />
          <SkeletonBlock className="h-11 rounded-[18px]" />
          <SkeletonBlock className="h-11 rounded-[18px]" />
        </div>
        <div className="mt-4 space-y-4">
          {[0, 1, 2].map((item) => <FeedCardSkeleton key={item} mediaHeight={item === 1 ? "h-36" : "h-44"} />)}
        </div>
      </main>
    </>
  );
}

function ProductCardSkeleton() {
  return (
    <article className="overflow-hidden rounded-[20px] border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <SkeletonBlock className="aspect-[4/3] w-full rounded-none" />
      <div className="space-y-2.5 p-3">
        <SkeletonBlock className="h-4 w-4/5 rounded-full" />
        <SkeletonBlock className="h-3 w-3/5 rounded-full" />
        <SkeletonBlock className="h-5 w-1/2 rounded-full" />
        <div className="flex items-center justify-between gap-2 pt-1">
          <SkeletonBlock className="h-3 w-2/5 rounded-full" />
          <SkeletonBlock className="h-9 w-9 rounded-xl" />
        </div>
      </div>
    </article>
  );
}

function MarketplaceBuyerSkeleton() {
  return (
    <>
      <AppShellHeader dark compact />
      <main className="pb-28">
        <div className="border-b border-slate-200 bg-white px-3 py-3 dark:border-slate-800 dark:bg-slate-950">
          <div className="flex gap-2 overflow-hidden rounded-full border border-slate-200 bg-slate-100 p-1.5 dark:border-slate-700 dark:bg-slate-900">
            {["w-24", "w-28", "w-28", "w-24"].map((width, index) => (
              <SkeletonBlock key={index} className={`h-10 shrink-0 rounded-full ${width}`} />
            ))}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3 px-3 py-4 sm:grid-cols-3 lg:grid-cols-4">
          {Array.from({ length: 8 }, (_, index) => <ProductCardSkeleton key={index} />)}
        </div>
      </main>
    </>
  );
}

function MarketplaceSellerSkeleton() {
  return (
    <>
      <AppShellHeader dark compact />
      <main className="space-y-4 px-4 pb-28 pt-4">
        <section className="rounded-[24px] border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          <SkeletonBlock className="h-4 w-36 rounded-full" />
          <SkeletonBlock className="mt-3 h-8 w-52 max-w-full rounded-xl" />
          <div className="mt-5 grid grid-cols-2 gap-3">
            {Array.from({ length: 4 }, (_, index) => (
              <div key={index} className="rounded-2xl border border-slate-100 p-3 dark:border-slate-800">
                <SkeletonBlock className="h-3 w-16 rounded-full" />
                <SkeletonBlock className="mt-3 h-7 w-20 rounded-lg" />
              </div>
            ))}
          </div>
        </section>
        <FeedCardSkeleton mediaHeight="h-32" />
      </main>
    </>
  );
}

function TransportSkeleton() {
  return (
    <>
      <AppShellHeader />
      <main className="space-y-4 px-4 pb-28 pt-4">
        <SkeletonBlock className="h-40 rounded-[28px]" />
        <div className="grid grid-cols-2 gap-3">
          {Array.from({ length: 4 }, (_, index) => (
            <div key={index} className="rounded-[22px] border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
              <SkeletonBlock className="h-11 w-11 rounded-2xl" />
              <SkeletonBlock className="mt-4 h-4 w-3/4 rounded-full" />
              <SkeletonBlock className="mt-2 h-3 w-1/2 rounded-full" />
            </div>
          ))}
        </div>
        <FeedCardSkeleton mediaHeight="h-24" />
      </main>
    </>
  );
}

function BottomShellSkeleton({ activePage }) {
  return (
    <div className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white/95 px-4 pb-[calc(var(--kt-safe-area-bottom)+0.5rem)] pt-2 backdrop-blur dark:border-slate-800 dark:bg-slate-950/95">
      <div className="mx-auto grid max-w-lg grid-cols-4 gap-2">
        {["explore", "marketplace", "transport", "alerts"].map((item) => (
          <div key={item} className={`grid h-14 place-items-center rounded-2xl ${item === activePage ? "bg-slate-100 dark:bg-slate-900" : ""}`}>
            <SkeletonBlock className="h-8 w-8 rounded-xl" />
          </div>
        ))}
      </div>
    </div>
  );
}

export default function AppStartupSkeleton({ page = "explore", marketplaceSub = "", notice = null }) {
  return (
    <div
      className="kt-mobile-viewport relative overflow-x-hidden bg-slate-100 text-slate-950 dark:bg-slate-950 dark:text-white"
      data-startup-skeleton={page}
      aria-busy="true"
      aria-label={`${page} loading`}
    >
      {notice ? <div className="relative z-40 px-4 pt-3">{notice}</div> : null}
      {page === "marketplace"
        ? marketplaceSub === "business"
          ? <MarketplaceSellerSkeleton />
          : <MarketplaceBuyerSkeleton />
        : page === "transport"
          ? <TransportSkeleton />
          : <ExploreSkeleton />}
      <BottomShellSkeleton activePage={page} />
    </div>
  );
}
