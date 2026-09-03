import {
  ArrowLeft,
  Bell,
  CarFront,
  Compass,
  Image,
  MapPin,
  Menu,
  Megaphone,
  MessageCircle,
  Mic,
  PackageCheck,
  Plus,
  Radar,
  Search,
  Send,
  ShoppingBag,
  Sparkles,
  Store,
  Truck,
  Users,
  Video,
} from "lucide-react";

import { t } from "../../i18n";
import PremiumHeader from "./PremiumHeader";

function SkeletonBlock({ className = "" }) {
  return <div className={`kt-startup-shimmer ${className}`} aria-hidden="true" />;
}

function StaticHeaderButton({ accent = "slate", icon: Icon }) {
  const activeClass = accent === "sky"
    ? "border-sky-600 bg-sky-600 text-white shadow-sky-700/20"
    : accent === "emerald"
      ? "border-emerald-600 bg-emerald-600 text-white shadow-emerald-700/20"
      : "border-slate-200 bg-white/90 text-slate-700";

  return (
    <span
      className={`kt-premium-icon-button kt-premium-icon-button-square ${activeClass}`}
      aria-hidden="true"
    >
      <Icon size={20} strokeWidth={2.25} absoluteStrokeWidth />
    </span>
  );
}

function AccountIconSkeleton() {
  return (
    <SkeletonBlock className="kt-premium-icon-button kt-premium-icon-button-square rounded-2xl border-slate-200 bg-slate-200/70" />
  );
}

function ExploreHeaderShell() {
  return (
    <div data-static-shell="explore-header">
      <PremiumHeader
        accent="sky"
        title="Explore"
        left={(
          <>
            <StaticHeaderButton icon={Menu} />
            <StaticHeaderButton icon={MessageCircle} />
          </>
        )}
        right={(
          <>
            <StaticHeaderButton icon={Search} />
            <StaticHeaderButton accent="sky" icon={Plus} />
            <StaticHeaderButton icon={Bell} />
          </>
        )}
      />
    </div>
  );
}

function MarketplaceHeaderShell() {
  return (
    <div data-static-shell="marketplace-header">
      <PremiumHeader
        accent="emerald"
        centerIcon={ShoppingBag}
        title="UrMall"
        left={<AccountIconSkeleton />}
        right={(
          <>
            <StaticHeaderButton icon={Search} />
            <StaticHeaderButton icon={MessageCircle} />
            <StaticHeaderButton icon={Bell} />
            <StaticHeaderButton icon={Menu} />
          </>
        )}
      />
    </div>
  );
}

function TransportHeaderShell() {
  return (
    <div data-static-shell="transport-header">
      <PremiumHeader
        accent="emerald"
        centerIcon={Truck}
        title="UrRide"
        left={(
          <>
            <AccountIconSkeleton />
            <StaticHeaderButton icon={Radar} />
          </>
        )}
        right={(
          <>
            <StaticHeaderButton icon={Search} />
            <StaticHeaderButton icon={Bell} />
            <StaticHeaderButton icon={Menu} />
          </>
        )}
      />
    </div>
  );
}

function SellerHeaderShell() {
  return (
    <header className="sticky top-0 z-30 border-b border-gray-200 bg-white" data-static-shell="seller-header">
      <div className="flex h-16 w-full items-center justify-between gap-2 px-4 sm:px-6 lg:px-8">
        <div className="flex min-w-0 items-center gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-gray-200 bg-white text-gray-700" aria-hidden="true">
            <ArrowLeft size={19} />
          </span>
          <span className="hidden truncate text-sm font-semibold text-gray-900 sm:block">{t("urmall.biz.header.sellerDashboard")}</span>
        </div>

        <SkeletonBlock className="h-10 w-16 shrink-0 rounded-xl border border-emerald-200" />

        <div className="flex items-center gap-2 text-gray-700" aria-hidden="true">
          <span className="grid h-10 w-10 place-items-center rounded-lg bg-gray-950 text-white"><Plus size={18} /></span>
          <span className="hidden h-10 w-10 place-items-center rounded-lg border border-gray-200 bg-white min-[390px]:grid"><PackageCheck size={18} /></span>
          <span className="hidden h-10 w-10 place-items-center rounded-lg border border-gray-200 bg-white min-[440px]:grid"><MessageCircle size={18} /></span>
          <span className="grid h-10 w-10 place-items-center rounded-lg border border-gray-200 bg-white"><Bell size={18} /></span>
          <span className="grid h-10 w-10 place-items-center rounded-lg border border-gray-200 bg-white"><Menu size={19} /></span>
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
      </div>
      <div className="mt-4 space-y-2">
        <SkeletonBlock className="h-3 w-full rounded-full" />
        <SkeletonBlock className="h-3 w-4/5 rounded-full" />
      </div>
      <SkeletonBlock className={`mt-4 w-full rounded-[20px] ${mediaHeight}`} />
    </article>
  );
}

function ExploreTabsShell() {
  const tabs = [
    { label: "UrFeed", icon: Sparkles },
    { label: "Swip", icon: Video },
    { label: t("nav.connections"), icon: Users },
  ];

  return (
    <div className="border-y border-white/70 bg-white/[0.52] px-3 py-2 shadow-sm backdrop-blur-2xl dark:border-slate-800/80 dark:bg-slate-950/70" data-static-shell="explore-tabs">
      <div className="grid grid-cols-3 gap-1 rounded-[24px] border border-white/80 bg-white/55 p-1 ring-1 ring-slate-950/5 dark:border-slate-700/60 dark:bg-slate-900/70">
        {tabs.map(({ icon: Icon, label }, index) => (
          <span
            key={label}
            className={`inline-flex min-h-10 items-center justify-center gap-1 rounded-[18px] px-1.5 text-xs font-black ${
              index === 0 ? "bg-slate-950/90 text-white dark:bg-white dark:text-slate-950" : "text-slate-600 dark:text-slate-300"
            }`}
          >
            <Icon size={15} strokeWidth={2.25} />
            <span className="whitespace-nowrap">{label}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

function ExploreComposerShell() {
  return (
    <div className="mt-4 w-full min-w-0 px-3 sm:px-5 lg:px-8" data-static-shell="explore-composer">
      <div className="flex w-full min-w-0 items-center gap-2 rounded-[20px] border border-slate-200 bg-white p-2.5 shadow-sm sm:p-3 dark:border-slate-800 dark:bg-slate-900">
        <SkeletonBlock className="h-9 w-9 shrink-0 rounded-full sm:h-10 sm:w-10" />
        <span className="flex h-10 min-w-0 flex-1 items-center truncate rounded-2xl bg-slate-50 px-3 text-sm font-medium text-slate-400 dark:bg-slate-950/70">
          {t("feed.composerPlaceholder")}
        </span>
        <div className="flex flex-none items-center gap-1.5 text-slate-500 sm:gap-2" aria-hidden="true">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-slate-100 dark:bg-slate-800"><Image size={18} /></span>
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-slate-100 dark:bg-slate-800"><Mic size={18} /></span>
          <span className="hidden h-9 w-9 place-items-center rounded-xl bg-amber-50 text-amber-700 min-[390px]:grid"><Megaphone size={17} /></span>
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-slate-950 text-white dark:bg-white dark:text-slate-950"><Send size={17} /></span>
        </div>
      </div>
    </div>
  );
}

function ExploreSkeleton() {
  return (
    <>
      <ExploreHeaderShell />
      <ExploreTabsShell />
      <main className="pb-28 pt-1">
        <ExploreComposerShell />
        <div className="mt-4 space-y-4 px-4 sm:px-5" data-loading-region="explore-posts">
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
      </div>
    </article>
  );
}

function MarketplaceTabsShell() {
  const tabs = [
    t("urmall.tabs.new"),
    t("urmall.tabs.discounted"),
    t("urmall.tabs.highDemand"),
    t("urmall.tabs.topRated"),
  ];
  return (
    <div className="border-y border-white/70 bg-white/50 px-2 py-2 shadow-sm" data-static-shell="marketplace-tabs">
      <div className="grid grid-cols-4 gap-1 rounded-[24px] border border-white/80 bg-white/55 p-1 ring-1 ring-slate-950/5">
        {tabs.map((label, index) => (
          <span key={label} className={`grid min-h-10 place-items-center rounded-[18px] px-1 text-center text-[11px] font-black leading-tight ${index === 0 ? "bg-emerald-600 text-white" : "text-gray-600"}`}>
            {label}
          </span>
        ))}
      </div>
    </div>
  );
}

function MarketplaceBuyerSkeleton() {
  return (
    <>
      <MarketplaceHeaderShell />
      <MarketplaceTabsShell />
      <main className="grid grid-cols-2 gap-3 px-3 py-4 pb-28 sm:grid-cols-3 lg:grid-cols-4" data-loading-region="marketplace-products">
        {Array.from({ length: 8 }, (_, index) => <ProductCardSkeleton key={index} />)}
      </main>
    </>
  );
}

function SellerTabsShell() {
  return (
    <nav className="grid grid-cols-3 gap-1.5 rounded-2xl border border-gray-200 bg-white p-1.5 shadow-sm" data-static-shell="seller-tabs">
      {[
        t("urmall.biz.cat.titleStore"),
        t("urmall.biz.cat.titleCatalog"),
        t("urmall.biz.cat.titleDraft"),
      ].map((label, index) => (
        <span key={label} className={`grid min-h-10 place-items-center rounded-xl px-2 text-xs font-black ${index === 0 ? "bg-slate-950 text-white" : "text-gray-500"}`}>
          {label}
        </span>
      ))}
    </nav>
  );
}

function MarketplaceSellerSkeleton() {
  return (
    <>
      <SellerHeaderShell />
      <main className="space-y-4 px-4 pb-28 pt-4">
        <SellerTabsShell />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3" data-loading-region="seller-items">
          {Array.from({ length: 6 }, (_, index) => <ProductCardSkeleton key={index} />)}
        </div>
      </main>
    </>
  );
}

function TransportSkeleton() {
  const actions = [
    { icon: MapPin, label: "Nearby" },
    { icon: CarFront, label: "Find a ride" },
    { icon: Store, label: "Operators" },
    { icon: PackageCheck, label: "Trips" },
  ];
  return (
    <>
      <TransportHeaderShell />
      <main className="space-y-4 px-4 pb-28 pt-4">
        <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900" data-static-shell="transport-actions">
          <p className="text-xs font-black uppercase tracking-wide text-emerald-700">UrRide</p>
          <h2 className="mt-1 text-xl font-black text-slate-950 dark:text-white">Where are you going?</h2>
          <div className="mt-4 grid grid-cols-2 gap-3">
            {actions.map(({ icon: Icon, label }) => (
              <span key={label} className="flex items-center gap-3 rounded-2xl border border-slate-100 bg-slate-50 p-3 text-sm font-black text-slate-700 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200">
                <span className="grid h-10 w-10 place-items-center rounded-xl bg-white text-emerald-700 dark:bg-slate-900"><Icon size={19} /></span>
                {label}
              </span>
            ))}
          </div>
        </section>
        <div data-loading-region="transport-results"><FeedCardSkeleton mediaHeight="h-24" /></div>
      </main>
    </>
  );
}

function BottomShell({ activePage }) {
  const tabs = [
    { id: "explore", label: "Explore", icon: Compass },
    { id: "marketplace", label: "UrMall", icon: ShoppingBag },
    { id: "transport", label: "UrRide", icon: Truck },
  ];

  return (
    <div className="fixed inset-x-6 bottom-3 z-30" data-static-shell="bottom-navigation">
      <div className="relative mx-auto grid max-w-md grid-cols-3 gap-1 rounded-[26px] border border-white/80 bg-white/85 p-1 shadow-2xl backdrop-blur dark:border-slate-700/60 dark:bg-slate-900/90">
        {tabs.map(({ id, icon: Icon, label }) => (
          <span key={id} className={`relative z-10 flex min-h-[48px] flex-col items-center justify-center gap-0.5 rounded-[20px] px-1.5 py-1.5 text-[11px] font-black ${id === activePage ? "bg-slate-950/90 text-white dark:bg-white dark:text-slate-950" : "text-slate-500 dark:text-slate-400"}`}>
            <Icon size={18} strokeWidth={2.25} />
            <span>{label}</span>
          </span>
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
      <BottomShell activePage={page} />
    </div>
  );
}
