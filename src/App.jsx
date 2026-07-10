import { lazy, Suspense, useCallback, useEffect, useRef, useState } from "react";

import { useAuth } from "./Backend/hooks/useAuth";
import { useOnboarding } from "./Backend/hooks/useOnboarding";
import BottomTabs from "./components/BottomTabs";
import OnboardingFlow from "./components/onboarding/OnboardingFlow";
import Login from "./Login";
import { PageTransition } from "./components/shared/motion";
import { stopAllExploreMedia } from "./components/Explore/shared/singleMediaPlayback";
import { clearExploreScreenStack } from "./Backend/services/explore/navigationService";
import { setNotificationSeenUser } from "./Backend/services/notificationSeenStore";
import { getCurrentAccountControl, subscribeToAccountControl } from "./Backend/services/accountControlService";
import { markSessionContinuity, readSessionContinuity } from "./Backend/services/sessionService";
import AccountRestrictionNotice from "./components/shared/AccountRestrictionNotice";
import GuestGateCard from "./components/shared/GuestGateCard";
import NotificationBannerHost from "./components/shared/NotificationBannerHost";
import { endGuestVisit, isGuestMode } from "./Backend/services/guestModeService";
import supabase from "./Backend/lib/supabaseClient";

const PAGE_ORDER = ["explore", "marketplace", "transport"];
const LAST_PAGE_KEY = "kuntai-last-page";
const PAGE_VISITS_KEY = "kuntai-main-page-visits";
const MARKETPLACE_NAV_KEY = "kuntai-marketplace-nav";
const loadExplore = () => import("./components/Explore/Explore");
const loadMarketplace = () => import("./components/Marketplace/Marketplace");
const loadTransport = () => import("./components/transport/Transport");
const PAGE_LOADERS = {
  explore: loadExplore,
  marketplace: loadMarketplace,
  transport: loadTransport,
};
const Explore = lazy(loadExplore);
const Marketplace = lazy(loadMarketplace);
const Transport = lazy(loadTransport);

function normalizeMainPage(value) {
  const page = String(value || "").toLowerCase();
  if (page === "urmall") return "marketplace";
  return PAGE_ORDER.includes(page) ? page : "";
}

function getMainPageFromHash(hashValue = "") {
  const hash = String(hashValue || "").toLowerCase();
  if (hash.includes("swip") || hash.includes("urfeed") || hash.includes("connections")) return "explore";
  if (hash.includes("marketplace") || hash.includes("urmall")) return "marketplace";
  if (hash.includes("transport")) return "transport";
  return "";
}

function readLastMainPage() {
  try {
    return normalizeMainPage(localStorage.getItem(LAST_PAGE_KEY)) || "explore";
  } catch {
    return "explore";
  }
}

function pageVisitsKey(userId = "") {
  return userId ? `${PAGE_VISITS_KEY}:${userId}` : PAGE_VISITS_KEY;
}

function readPageVisitCounts(userId = "") {
  try {
    const value = JSON.parse(localStorage.getItem(pageVisitsKey(userId)) || "{}");
    return value && typeof value === "object" && !Array.isArray(value) ? value : {};
  } catch {
    return {};
  }
}

function readFrequentMainPage(userId = "") {
  const counts = readPageVisitCounts(userId);
  const ranked = PAGE_ORDER
    .map((item) => ({ page: item, visits: Number(counts[item] || 0) }))
    .filter((item) => item.visits > 0)
    .sort((first, second) => second.visits - first.visits);
  return ranked[0]?.page || "";
}

function recordMainPageVisit(page, userId = "") {
  const normalized = normalizeMainPage(page);
  if (!normalized) return;

  try {
    const counts = readPageVisitCounts(userId);
    localStorage.setItem(pageVisitsKey(userId), JSON.stringify({
      ...counts,
      [normalized]: Number(counts[normalized] || 0) + 1,
    }));
    if (userId) {
      const globalCounts = readPageVisitCounts();
      localStorage.setItem(PAGE_VISITS_KEY, JSON.stringify({
        ...globalCounts,
        [normalized]: Number(globalCounts[normalized] || 0) + 1,
      }));
    }
    localStorage.setItem(LAST_PAGE_KEY, normalized);
  } catch {
    // Navigation should never depend on storage availability.
  }
}

function readPreferredMainPage(fallback = "", userId = "") {
  return readFrequentMainPage(userId) || readFrequentMainPage() || normalizeMainPage(fallback) || readLastMainPage();
}

function clearBrowserHash() {
  if (!window.location.hash) return;
  window.history.replaceState(window.history.state, "", window.location.pathname + window.location.search);
}

function readStoredMarketplaceNav() {
  try {
    const value = JSON.parse(sessionStorage.getItem(MARKETPLACE_NAV_KEY) || "null");
    if (value && typeof value === "object" && value.root) {
      return { root: value.root, sub: value.sub || null };
    }
  } catch {
    // Fall through to the default landing surface.
  }
  return { root: "marketplace", sub: null };
}

function AppLoading({ page = "explore" }) {
  const pageTitle = page === "marketplace" ? "UrMall" : page === "transport" ? "UrRide" : "Explore";
  const [showPatienceNotice, setShowPatienceNotice] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => setShowPatienceNotice(true), 6000);
    return () => window.clearTimeout(timer);
  }, []);

  return (
    <div className="min-h-screen bg-slate-100">
      <div className="sticky top-0 z-30 border-b border-slate-200 bg-white">
        <div className="grid h-16 grid-cols-[1fr_auto_1fr] items-center px-4">
          <div className="flex gap-2">
            <div className="h-10 w-10 animate-pulse rounded-xl bg-slate-100" />
            <div className="h-10 w-10 animate-pulse rounded-xl bg-slate-100" />
          </div>
          <div className="space-y-2 text-center">
            <div className="mx-auto h-2 w-16 animate-pulse rounded-full bg-sky-100" />
            <div className="mx-auto rounded-full bg-slate-200 px-4 py-1 text-[10px] font-black uppercase tracking-wide text-slate-400">
              {pageTitle}
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <div className="h-10 w-10 animate-pulse rounded-xl bg-slate-100" />
            <div className="h-10 w-10 animate-pulse rounded-xl bg-slate-100" />
          </div>
        </div>
      </div>

      <div className="space-y-4 px-4 py-4">
        {showPatienceNotice ? (
          <div className="kt-route-transition rounded-2xl border border-sky-200 bg-sky-50 px-4 py-4 text-center shadow-sm">
            <p className="text-sm font-black text-slate-950">This is taking a little longer than usual</p>
            <p className="mt-1 text-sm font-semibold leading-6 text-slate-600">
              We may be upgrading our services, or your network connection is unstable at the moment.
              Please hold on — KunThai will continue automatically as soon as everything is ready.
            </p>
          </div>
        ) : null}
        {page === "marketplace" ? (
          <div className="grid grid-cols-2 gap-3">
            {[1, 2, 3, 4].map((item) => (
              <div key={item} className="rounded-[22px] border border-slate-200 bg-white p-3 shadow-sm">
                <div className="aspect-square animate-pulse rounded-[18px] bg-slate-100" />
                <div className="mt-3 h-4 w-4/5 animate-pulse rounded-full bg-slate-200" />
                <div className="mt-2 h-3 w-1/2 animate-pulse rounded-full bg-emerald-100" />
              </div>
            ))}
          </div>
        ) : page === "transport" ? (
          <div className="grid gap-4">
            <div className="grid grid-cols-2 gap-3">
              {[1, 2].map((item) => (
                <div key={item} className="h-36 animate-pulse rounded-[24px] border border-slate-200 bg-white shadow-sm" />
              ))}
            </div>
            {[1, 2].map((item) => (
              <div key={item} className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm">
                <div className="h-5 w-44 animate-pulse rounded-full bg-slate-200" />
                <div className="mt-4 h-20 animate-pulse rounded-[20px] bg-slate-100" />
              </div>
            ))}
          </div>
        ) : (
          <>
            <div className="grid grid-cols-3 gap-2">
              {[1, 2, 3].map((item) => (
                <div key={item} className="h-12 animate-pulse rounded-[20px] bg-white" />
              ))}
            </div>
            {[1, 2, 3].map((item) => (
              <div key={item} className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex items-center gap-3">
                  <div className="h-12 w-12 animate-pulse rounded-full bg-slate-200" />
                  <div className="flex-1 space-y-2">
                    <div className="h-4 w-40 animate-pulse rounded-full bg-slate-200" />
                    <div className="h-3 w-24 animate-pulse rounded-full bg-slate-100" />
                  </div>
                </div>
                <div className="mt-5 h-32 animate-pulse rounded-[20px] bg-slate-100" />
              </div>
            ))}
          </>
        )}
        {!navigator.onLine ? (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-bold text-amber-800">
            Showing cached {page} layout while the connection recovers.
          </div>
        ) : null}
      </div>
    </div>
  );
}

export default function App() {
  const { user, loading } = useAuth();
  const {
    profile: onboardingProfile,
    loading: onboardingLoading,
    refresh: refreshOnboarding,
    checked: onboardingChecked,
    isComplete: onboardingComplete,
  } = useOnboarding(user);
  const [page, setPage] = useState(() => {
    // A hard refresh must land on the page the user was on, so the last
    // visited page wins over the visit-frequency preference here.
    return getMainPageFromHash(window.location.hash) || readLastMainPage();
  });
  const [mainPageDirection, setMainPageDirection] = useState("forward");
  const [exploreFullScreen, setExploreFullScreen] = useState(false);
  const [marketplaceNav, setMarketplaceNav] = useState(readStoredMarketplaceNav);
  const [marketplaceActivityOpen, setMarketplaceActivityOpen] = useState(false);
  const [transportActivityOpen, setTransportActivityOpen] = useState(false);
  const [transportAreaRequest, setTransportAreaRequest] = useState(null);
  const [mainPageBadges, setMainPageBadges] = useState({ marketplace: 0, transport: 0 });
  const [onboardingReveal, setOnboardingReveal] = useState(null);
  const [accountControl, setAccountControl] = useState(null);
  const appGestureRef = useRef(null);
  const userId = user?.id || "";
  setNotificationSeenUser(userId);

  // A guest visit lives for one tab session only. When the tab was closed and
  // the visitor returns with a leftover anonymous session, the visit ends
  // automatically: the anonymous account is deleted and Login is shown.
  useEffect(() => {
    if (user?.is_anonymous && !isGuestMode()) {
      endGuestVisit();
    }
  }, [user]);

  const updateMarketplaceBadge = useCallback((count) => {
    setMainPageBadges((current) => current.marketplace === count ? current : { ...current, marketplace: count });
  }, []);

  const updateTransportBadge = useCallback((count) => {
    setMainPageBadges((current) => current.transport === count ? current : { ...current, transport: count });
  }, []);

  useEffect(() => {
    PAGE_LOADERS[page]?.();
  }, [page]);

  useEffect(() => {
    try {
      sessionStorage.setItem(MARKETPLACE_NAV_KEY, JSON.stringify(marketplaceNav));
    } catch {
      // Navigation should never depend on storage availability.
    }
  }, [marketplaceNav]);

  useEffect(() => {
    stopAllExploreMedia();
    setMarketplaceActivityOpen(false);
    setTransportActivityOpen(false);
    recordMainPageVisit(page, userId);
    if (page !== "explore" && /#\/?(swip|urfeed|connections)/i.test(window.location.hash || "")) {
      window.history.replaceState(window.history.state, "", window.location.pathname + window.location.search);
    }
  }, [page, userId]);

  useEffect(() => {
    if (!userId || !onboardingComplete) return;

    // A hard refresh in the same tab keeps the continuity marker, so the
    // user stays exactly where they were. Only a fresh sign-in (or account
    // switch) resets navigation and picks a landing page.
    const sameBrowserSession = readSessionContinuity() === userId;
    markSessionContinuity(userId);
    if (sameBrowserSession) return;

    stopAllExploreMedia();
    clearExploreScreenStack();
    setExploreFullScreen(false);
    setMarketplaceNav({ root: "marketplace", sub: null });
    setMarketplaceActivityOpen(false);
    setTransportActivityOpen(false);
    setTransportAreaRequest(null);
    const hashPage = getMainPageFromHash(window.location.hash);
    const revealSurface = onboardingReveal ? normalizeMainPage(onboardingProfile?.primarySurface) : "";
    const preferredPage = revealSurface || hashPage || readPreferredMainPage(onboardingProfile?.primarySurface, userId);
    setPage(preferredPage);
    if (!hashPage) clearBrowserHash();
  }, [onboardingComplete, onboardingProfile?.primarySurface, onboardingReveal, userId]);

  useEffect(() => {
    let active = true;
    if (!userId) {
      setAccountControl(null);
      return undefined;
    }
    const unsubscribe = subscribeToAccountControl(userId, (control) => {
      if (active) setAccountControl(control);
    });
    getCurrentAccountControl(userId)
      .then((control) => { if (active) setAccountControl(control); })
      .catch(() => { if (active) setAccountControl(null); });
    return () => {
      active = false;
      unsubscribe();
    };
  }, [userId]);

  useEffect(() => {
    if (!onboardingReveal || !onboardingComplete) return undefined;
    const timeout = window.setTimeout(() => setOnboardingReveal(null), 900);
    return () => window.clearTimeout(timeout);
  }, [onboardingComplete, onboardingReveal]);

  useEffect(() => {
    function cleanupMedia() {
      stopAllExploreMedia();
    }

    window.addEventListener("hashchange", cleanupMedia);
    window.addEventListener("popstate", cleanupMedia);
    document.addEventListener("visibilitychange", cleanupMedia);
    return () => {
      window.removeEventListener("hashchange", cleanupMedia);
      window.removeEventListener("popstate", cleanupMedia);
      document.removeEventListener("visibilitychange", cleanupMedia);
      stopAllExploreMedia();
    };
  }, []);

  useEffect(() => {
    function handleOpenAreaView(event) {
      const detail = event.detail || {};
      if (!detail.destination && !detail.returnTo && !detail.action) return;

      setMarketplaceNav({ root: "marketplace", sub: null });
      setMarketplaceActivityOpen(false);
      window.dispatchEvent(new CustomEvent("marketplace-close-buyer-surfaces"));

      setTransportAreaRequest({
        ...detail,
        requestedAt: Date.now(),
      });

      setPage("transport");
    }

    window.addEventListener("kuntai-open-area-view", handleOpenAreaView);
    function handleReturnMainPage(event) {
      const nextPage = normalizeMainPage(event.detail?.page);
      if (!nextPage) return;
      setPage(nextPage);
    }

    window.addEventListener("kuntai-return-main-page", handleReturnMainPage);
    return () => {
      window.removeEventListener("kuntai-open-area-view", handleOpenAreaView);
      window.removeEventListener("kuntai-return-main-page", handleReturnMainPage);
    };
  }, [page]);

  const guestSession = Boolean(user?.is_anonymous);

  if (loading || (user && !guestSession && (!onboardingChecked || onboardingLoading) && !onboardingReveal)) {
    // Users heading into onboarding get the onboarding backdrop instead of an
    // app skeleton that never matches the screen that follows.
    if (user && !guestSession && !user.user_metadata?.onboarding_complete) {
      return (
        <div
          className="min-h-screen bg-[linear-gradient(180deg,#f7fafc_0%,#eff6ff_28%,#f8fafc_100%)]"
          aria-label="Loading KunThai onboarding"
        />
      );
    }
    return <AppLoading page={page} />;
  }
  if (!user) {
    return <Login />;
  }

  if (!guestSession && !onboardingComplete && !onboardingReveal) {
    return (
      <OnboardingFlow
        profile={onboardingProfile}
        onComplete={(origin, finishedProfile) => {
          setOnboardingReveal(origin);
          const chosenSurface = normalizeMainPage(finishedProfile?.primarySurface);
          if (chosenSurface) {
            setPage(chosenSurface);
            recordMainPageVisit(chosenSurface, userId);
          }
          refreshOnboarding();
        }}
      />
    );
  }

  const restrictedSectors = accountControl?.restricted_sectors || ["all"];
  const blocksEverything = ["suspended", "banned"].includes(accountControl?.status);
  const blocksCurrentPage = accountControl?.status === "restricted"
    && (restrictedSectors.includes("all") || restrictedSectors.includes(page));
  if (blocksEverything || blocksCurrentPage) {
    const availablePage = blocksEverything ? "" : PAGE_ORDER.find((item) => !restrictedSectors.includes(item));
    return (
      <AccountRestrictionNotice
        control={accountControl}
        availablePage={availablePage}
        onOpenAvailablePage={() => availablePage && setPage(availablePage)}
        onSignOut={() => supabase.auth.signOut()}
      />
    );
  }

  const bottomTabsHidden =
    (page === "explore" && exploreFullScreen) ||
    (page === "marketplace" && (Boolean(marketplaceNav.sub) || marketplaceActivityOpen)) ||
    (page === "transport" && transportActivityOpen);

  function changePage(nextPage) {
    if (!nextPage || nextPage === page) {
      return;
    }

    const currentIndex = PAGE_ORDER.indexOf(page);
    const nextIndex = PAGE_ORDER.indexOf(nextPage);
    setMainPageDirection(nextIndex >= currentIndex ? "forward" : "backward");
    setPage(nextPage);
  }

  function handleAppTouchStart(event) {
    if (page === "explore" || bottomTabsHidden || event.touches.length !== 1) {
      appGestureRef.current = null;
      return;
    }

    const target = event.target;
    if (target?.closest?.("input, textarea, select, [contenteditable='true']")) {
      appGestureRef.current = null;
      return;
    }

    const touch = event.touches[0];
    appGestureRef.current = {
      startX: touch.clientX,
      startY: touch.clientY,
      lastX: touch.clientX,
      lastY: touch.clientY,
    };
  }

  function handleAppTouchMove(event) {
    if (!appGestureRef.current || event.touches.length !== 1) {
      return;
    }

    const touch = event.touches[0];
    appGestureRef.current.lastX = touch.clientX;
    appGestureRef.current.lastY = touch.clientY;
  }

  function handleAppTouchEnd() {
    const gesture = appGestureRef.current;
    appGestureRef.current = null;

    if (!gesture || page === "explore" || bottomTabsHidden) {
      return;
    }

    const deltaX = gesture.lastX - gesture.startX;
    const deltaY = gesture.lastY - gesture.startY;
    const horizontal = Math.abs(deltaX);
    const vertical = Math.abs(deltaY);

    if (horizontal < 72 || horizontal < vertical * 1.25 || vertical > 112) {
      return;
    }

    if (deltaX < 0 && page === "marketplace") {
      changePage("transport");
      return;
    }

    if (deltaX > 0 && page === "transport") {
      changePage("marketplace");
      return;
    }

    if (deltaX > 0 && page === "marketplace") {
      changePage("explore");
    }
  }

  function pagePanelClass(targetPage) {
    if (page !== targetPage) {
      return "hidden";
    }

    return `${mainPageDirection === "backward" ? "kt-main-slide-backward" : "kt-main-slide-forward"} block min-h-screen`;
  }

  return (
    <div
      className={`min-h-screen w-full max-w-full overflow-x-clip bg-slate-100 ${onboardingReveal ? "kt-main-grow-from-onboarding" : ""}`}
      style={onboardingReveal ? {
        "--kt-transition-x": onboardingReveal.x,
        "--kt-transition-y": onboardingReveal.y,
      } : undefined}
      onTouchStart={handleAppTouchStart}
      onTouchMove={handleAppTouchMove}
      onTouchEnd={handleAppTouchEnd}
      onTouchCancel={() => {
        appGestureRef.current = null;
      }}
    >
      <PageTransition active className="min-h-screen">
        <Suspense fallback={<AppLoading page={page} />}>
          {page === "explore" ? (
            <section className={pagePanelClass("explore")} aria-hidden={false}>
              <Explore
                active
                onNavigateMain={changePage}
                onScreenModeChange={setExploreFullScreen}
                user={user}
                authLoading={loading}
              />
            </section>
          ) : null}

          {page === "marketplace" ? (
            <section className={pagePanelClass("marketplace")} aria-hidden={false}>
              <Marketplace
                nav={marketplaceNav}
                setNav={setMarketplaceNav}
                onActivityChange={setMarketplaceActivityOpen}
                active
                onNotificationCountChange={updateMarketplaceBadge}
              />
            </section>
          ) : null}

          {page === "transport" ? (
            <section className={pagePanelClass("transport")} aria-hidden={false}>
              <Transport
                onActivityChange={setTransportActivityOpen}
                areaViewRequest={transportAreaRequest}
                onAreaViewRequestHandled={setTransportAreaRequest}
                active
                onNotificationCountChange={updateTransportBadge}
              />
            </section>
          ) : null}
        </Suspense>
      </PageTransition>

      {!bottomTabsHidden ? <BottomTabs badges={mainPageBadges} page={page} setPage={changePage} /> : null}
      {guestSession ? <GuestGateCard /> : null}
      <NotificationBannerHost userId={userId} />
    </div>
  );
}
