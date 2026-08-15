import { lazy, Suspense, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { HiOutlineCamera, HiOutlineLightBulb, HiOutlineXMark } from "react-icons/hi2";

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
import { initNativeOAuth } from "./Backend/services/nativeOAuthService";
import AccountRestrictionNotice from "./components/shared/AccountRestrictionNotice";
import ReturningUserIntro from "./components/shared/ReturningUserIntro";
import TwoFactorGate from "./components/auth/TwoFactorGate";
import GuestGateCard from "./components/shared/GuestGateCard";
import NotificationBannerHost from "./components/shared/NotificationBannerHost";
import CrossServiceActivityHost from "./components/shared/CrossServiceActivityHost";
import ScreenshotVoiceCard from "./components/shared/ScreenshotVoiceCard";
import { endGuestVisit, isGuestMode } from "./Backend/services/guestModeService";
import {
  captureVisibilityInviteFromLocation,
  clearFlutterwavePaymentReturn,
  finalizeStoredVisibilityInvite,
  readFlutterwavePaymentReturn,
  verifyFlutterwavePaymentReturn,
} from "./Backend/services/visibilityCreditService";
import { showToast } from "./Backend/services/toastService";
import { haptics } from "./Backend/services/feedbackService";
import { hasUnstableNetwork, areGlobalNetworkToastsSuppressed, runConnectivityChecks } from "./Backend/services/networkService";
import {
  markReturningUserActivity,
  readReturningUserActivity,
  shouldShowReturningUserIntro,
} from "./Backend/services/returningUserIntroService";
import supabase from "./Backend/lib/supabaseClient";
import { t as i18nText } from "./i18n/index";

const PAGE_ORDER = ["explore", "marketplace", "transport"];
const LAST_PAGE_KEY = "kuntai-last-page";
const PAGE_VISITS_KEY = "kuntai-main-page-visits";
const MARKETPLACE_NAV_KEY = "kuntai-marketplace-nav";
const SCREENSHOT_PROMPT_AUTO_HIDE_MS = 12_000;
const SCREENSHOT_PROMPT_EXIT_MS = 280;
const SCREENSHOT_RETURN_WINDOW_MS = 2_200;
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
  const [showPatienceNotice, setShowPatienceNotice] = useState(false);
  const [offline, setOffline] = useState(() => typeof navigator !== "undefined" && navigator.onLine === false);
  // Distinguishes a genuine connectivity fault from a page that is merely slow
  // to render. Only a confirmed fault (browser offline, or multiple same-origin
  // probes failing) turns the notice into a network warning; otherwise the copy
  // stays neutral so a slow chunk load is never mislabelled "Network unstable".
  const [connectivityFault, setConnectivityFault] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => setShowPatienceNotice(true), 6000);
    return () => window.clearTimeout(timer);
  }, []);

  // Once we have waited long enough to surface a notice, actually check the
  // network rather than assuming a stalled render means it is down.
  useEffect(() => {
    if (!showPatienceNotice) return undefined;

    let cancelled = false;
    if (import.meta.env?.DEV) {
      console.debug("[AppLoading] patience notice shown; verifying connectivity");
    }
    runConnectivityChecks().then((reachable) => {
      if (!cancelled) setConnectivityFault(!reachable);
    });

    return () => {
      cancelled = true;
    };
  }, [showPatienceNotice]);

  useEffect(() => {
    function syncNetworkState() {
      const isOffline = typeof navigator !== "undefined" && navigator.onLine === false;
      setOffline(isOffline);
      // A confirmed online transition clears any stale fault immediately.
      if (!isOffline) setConnectivityFault(false);
    }

    window.addEventListener("online", syncNetworkState);
    window.addEventListener("offline", syncNetworkState);
    return () => {
      window.removeEventListener("online", syncNetworkState);
      window.removeEventListener("offline", syncNetworkState);
    };
  }, []);

  const networkFault = offline || connectivityFault;

  return (
    <div className="min-h-screen bg-slate-100">
      {/* A neutral header bar stands in for the real header. The old EXPLORE /
          URMALL / URRIDE title pill was removed — it only labelled the wait
          without representing any real UI. */}
      <div className="sticky top-0 z-30 h-16 border-b border-slate-200 bg-white" aria-hidden="true" />

      <div className="space-y-4 px-4 py-4">
        {showPatienceNotice ? (
          <div className="kt-route-transition rounded-2xl border border-sky-200 bg-sky-50 px-4 py-4 text-center shadow-sm">
            <p className="text-sm font-black text-slate-950">
              {offline ? i18nText("ui.literals.k78bc44dac752") : networkFault ? i18nText("ui.literals.k5668eeef0e08") : i18nText("ui.literals.k28f19756579e")}
            </p>
            <p className="mt-1 text-sm font-semibold leading-6 text-slate-600">
              {networkFault
                ? i18nText("ui.literals.k4955eabca5a9")
                : i18nText("ui.literals.ke92c26e43495")}
            </p>
          </div>
        ) : null}
        {page === "explore" ? (
          // Explore shows only the tab rail while loading: fake post cards and
          // header icons made the skeleton feel heavier than the real screen.
          <div className="grid grid-cols-3 gap-2">
            {[1, 2, 3].map((item) => (
              <div key={item} className="h-12 animate-pulse rounded-[20px] bg-white" />
            ))}
          </div>
        ) : null}
        {!navigator.onLine ? (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-bold text-amber-800">
            {i18nText("ui.literals.kd1d9af29fa05")} {page} {i18nText("ui.literals.k0ba189b0877f")}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function TwoFactorPassed({ onPassed }) {
  useEffect(() => {
    onPassed();
  }, [onPassed]);
  return null;
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
  // The landing surface the user picked on the last onboarding step. Held in a
  // ref so it survives the reveal effect re-running before the refreshed
  // profile metadata arrives, which otherwise fell back to Explore.
  const pendingLandingRef = useRef("");
  const paymentReturnHandledRef = useRef(false);
  const [accountControl, setAccountControl] = useState(null);
  const [twoFactorPending, setTwoFactorPending] = useState(null);
  const [returningIntroOpen, setReturningIntroOpen] = useState(false);
  const appGestureRef = useRef(null);
  const pagePanelRef = useRef(null);
  const userId = user?.id || "";
  const guestSession = Boolean(user?.is_anonymous);
  setNotificationSeenUser(userId);

  useLayoutEffect(() => {
    setReturningIntroOpen(false);
    if (!userId || guestSession || !onboardingComplete || twoFactorPending !== false) return undefined;

    const now = Date.now();
    if (shouldShowReturningUserIntro(userId, now)) {
      setReturningIntroOpen(true);
    }
    markReturningUserActivity(userId, now);

    let backgroundedAt = 0;

    function markAway() {
      backgroundedAt = Date.now();
      markReturningUserActivity(userId, backgroundedAt);
    }

    function handleVisibilityChange() {
      if (document.hidden) {
        markAway();
        return;
      }

      const returnedAt = Date.now();
      const lastActivity = backgroundedAt || readReturningUserActivity(userId);
      if (shouldShowReturningUserIntro(userId, returnedAt, lastActivity)) {
        setReturningIntroOpen(true);
      }
      markReturningUserActivity(userId, returnedAt);
      backgroundedAt = 0;
    }

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("pagehide", markAway);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("pagehide", markAway);
    };
  }, [guestSession, onboardingComplete, twoFactorPending, userId]);

  useEffect(() => {
    captureVisibilityInviteFromLocation();
  }, []);

  useEffect(() => {
    const paymentReturn = readFlutterwavePaymentReturn();
    if (!paymentReturn || !userId || guestSession || paymentReturnHandledRef.current) return;
    paymentReturnHandledRef.current = true;

    if (!["successful", "succeeded", "completed"].includes(paymentReturn.status)) {
      clearFlutterwavePaymentReturn();
      showToast(i18nText("ui.literals.k84d8affea148"), "warning", {
        title: i18nText("ui.literals.k21fd7cb6e40c"),
      });
      return;
    }

    verifyFlutterwavePaymentReturn(paymentReturn)
      .then((result) => {
        window.dispatchEvent(new CustomEvent("kuntai-visibility-credits-updated"));
        showToast(i18nText("ui.literals.kb17e3e2167e5", { value0: Number(result.credits || 0) }), "success", {
          title: i18nText("ui.literals.k43a3f3cba1c4"),
        });
      })
      .catch((error) => {
        showToast(error.message || i18nText("ui.literals.k2d184a7f2980"), error.pending ? "warning" : "danger", {
          title: error.pending ? "Payment processing" : "Payment verification",
        });
      })
      .finally(() => clearFlutterwavePaymentReturn());
  }, [guestSession, userId]);

  useEffect(() => {
    const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
    let previousOnline = navigator.onLine;
    let previousUnstable = hasUnstableNetwork(connection);

    function announceNetworkState({ initial = false } = {}) {
      const online = navigator.onLine;
      const unstable = online && hasUnstableNetwork(connection);

      // A screen with its own contextual network toasts (Area View) suppresses
      // the global one. Keep the trackers current so no stale transition fires
      // once suppression lifts.
      if (areGlobalNetworkToastsSuppressed()) {
        previousOnline = online;
        previousUnstable = unstable;
        return;
      }

      if (!online && (initial || previousOnline)) {
        showToast(i18nText("ui.literals.k5c9fe986a7bd"), "warning", {
          title: i18nText("ui.literals.kd589e58dce1b"),
          duration: 2800,
          origin: false,
        });
      } else if (online && previousOnline === false) {
        showToast(i18nText("ui.literals.k44b2cd5f7f58"), "success", {
          title: i18nText("ui.literals.kd589e58dce1b"),
          duration: 2600,
          origin: false,
        });
      } else if (unstable && (initial || !previousUnstable)) {
        showToast(i18nText("ui.literals.k131cd2aeb63b"), "warning", {
          title: i18nText("ui.literals.kd589e58dce1b"),
          duration: 2800,
          origin: false,
        });
      }

      previousOnline = online;
      previousUnstable = unstable;
    }

    announceNetworkState({ initial: true });
    window.addEventListener("online", announceNetworkState);
    window.addEventListener("offline", announceNetworkState);
    connection?.addEventListener?.("change", announceNetworkState);
    return () => {
      window.removeEventListener("online", announceNetworkState);
      window.removeEventListener("offline", announceNetworkState);
      connection?.removeEventListener?.("change", announceNetworkState);
    };
  }, []);

  // Each new sign-in re-checks whether the account needs its authenticator code.
  useEffect(() => {
    setTwoFactorPending(null);
  }, [userId]);

  // The inviter's credit is only granted once the invited account is fully
  // created and has landed on a dashboard (onboarding complete). Gating the
  // finalize call on onboardingComplete — not just sign-in — enforces that on
  // the client; the server RPC re-checks the same condition.
  useEffect(() => {
    if (!userId || guestSession || !onboardingComplete) return;

    finalizeStoredVisibilityInvite(userId)
      .then((result) => {
        if (result?.status === "credited" && Number(result.creditsAwarded || 0) > 0) {
          showToast(i18nText("ui.literals.k91f1a63c2e7b", { value0: result.inviterName || i18nText("ui.literals.k8df5482fdfac") }), "success", {
            title: i18nText("ui.literals.kc4f06bac9541"),
          });
        }
      })
      .catch(() => {});
  }, [guestSession, userId, onboardingComplete]);

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
    // The freshly chosen landing surface wins over everything, even if the
    // refreshed profile metadata has not propagated yet.
    const pendingLanding = pendingLandingRef.current;
    // On a fresh sign-in honor the user's explicit "open first" choice
    // (primarySurface) ahead of the most-frequented-page heuristic — the first
    // app render records an Explore visit that would otherwise always win.
    const chosenSurface = normalizeMainPage(onboardingProfile?.primarySurface);
    const preferredPage = pendingLanding || hashPage || chosenSurface || readPreferredMainPage("", userId);
    if (pendingLanding) pendingLandingRef.current = "";
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

  // Bind the native OAuth deep-link handlers once for the whole app session
  // (no-op on the web). Registering here — not in Login — means the callback is
  // still handled if the OS terminated the app while the provider browser was
  // open and relaunched it through app.kunthai.mobile://auth/callback.
  useEffect(() => {
    initNativeOAuth();
  }, []);

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

  // While auth is still resolving we do not yet know whether this leads to the
  // login screen, onboarding, or the app - so show a plain backdrop rather than
  // the app skeleton, which never matches the login or onboarding screens.
  if (loading) {
    return <div className="min-h-screen bg-slate-100" aria-label={i18nText("ui.literals.k721d964bf95b")} />;
  }

  if (user && !guestSession && (!onboardingChecked || onboardingLoading) && !onboardingReveal) {
    // Users heading into onboarding get the onboarding backdrop; only a
    // returning, onboarded user waiting for their page keeps the app skeleton.
    if (!user.user_metadata?.onboarding_complete) {
      return (
        <div
          className="min-h-screen bg-[linear-gradient(180deg,#f7fafc_0%,#eff6ff_28%,#f8fafc_100%)]"
          aria-label={i18nText("ui.literals.k1467547ea632")}
        />
      );
    }
    return <AppLoading page={page} />;
  }
  if (!user) {
    return <Login />;
  }

  if (!guestSession && twoFactorPending !== false) {
    return (
      <TwoFactorGate key={userId} user={user}>
        <TwoFactorPassed onPassed={() => setTwoFactorPending(false)} />
      </TwoFactorGate>
    );
  }

  if (!guestSession && !onboardingComplete && !onboardingReveal) {
    return (
      <OnboardingFlow
        profile={onboardingProfile}
        onComplete={(origin, finishedProfile) => {
          setOnboardingReveal(origin);
          const chosenSurface = normalizeMainPage(finishedProfile?.primarySurface);
          if (chosenSurface) {
            pendingLandingRef.current = chosenSurface;
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
        onSignOut={() => supabase.auth.signOut({ scope: "local" })}
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

    // A short vibration confirms every move between the three main screens
    // (Explore / UrMall / UrRide), whether by bottom tab or swipe.
    haptics.light();

    const currentIndex = PAGE_ORDER.indexOf(page);
    const nextIndex = PAGE_ORDER.indexOf(nextPage);
    setMainPageDirection(nextIndex >= currentIndex ? "forward" : "backward");
    setPage(nextPage);
  }

  function getSwipeTargetPage(deltaX) {
    if (deltaX < 0 && page === "marketplace") return "transport";
    if (deltaX > 0 && page === "transport") return "marketplace";
    if (deltaX > 0 && page === "marketplace") return "explore";
    return "";
  }

  function resetAppSwipePreview() {
    const node = pagePanelRef.current;
    if (!node) return;
    node.style.transition = "transform 160ms ease-out";
    node.style.transform = "translate3d(0, 0, 0)";
    window.setTimeout(() => {
      node.style.transition = "";
      node.style.transform = "";
    }, 190);
  }

  function handleAppTouchStart(event) {
    if (event.touches.length !== 1) {
      appGestureRef.current = null;
      resetAppSwipePreview();
      return;
    }

    if (page === "explore" || bottomTabsHidden) {
      appGestureRef.current = null;
      return;
    }

    const target = event.target;
    if (
      target?.closest?.("input, textarea, select, [contenteditable='true']") ||
      target?.closest?.(".overflow-x-auto, .overflow-x-scroll") ||
      target?.closest?.("[data-suppress-app-swipe]")
    ) {
      appGestureRef.current = null;
      return;
    }

    const touch = event.touches[0];
    appGestureRef.current = {
      startX: touch.clientX,
      startY: touch.clientY,
      lastX: touch.clientX,
      lastY: touch.clientY,
      axis: null,
    };
  }

  function handleAppTouchMove(event) {
    const gesture = appGestureRef.current;
    if (event.touches.length !== 1) {
      // A pinch may begin after a valid one-finger swipe start. Invalidate the
      // whole sequence so lifting either finger can never commit a page change.
      appGestureRef.current = null;
      if (gesture) resetAppSwipePreview();
      return;
    }
    if (!gesture) {
      return;
    }

    const touch = event.touches[0];
    gesture.lastX = touch.clientX;
    gesture.lastY = touch.clientY;

    const deltaX = gesture.lastX - gesture.startX;
    const deltaY = gesture.lastY - gesture.startY;

    if (!gesture.axis) {
      if (Math.abs(deltaX) < 14 && Math.abs(deltaY) < 14) {
        return;
      }
      gesture.axis = Math.abs(deltaX) > Math.abs(deltaY) * 1.35 ? "x" : "y";
    }

    if (gesture.axis !== "x" || !getSwipeTargetPage(deltaX)) {
      return;
    }

    // The neighbouring page is not mounted, so the active page tracks the
    // finger with light resistance for immediate feedback and the switch
    // itself commits on release.
    const node = pagePanelRef.current;
    if (node) {
      node.style.transition = "none";
      node.style.transform = `translate3d(${deltaX * 0.35}px, 0, 0)`;
    }
  }

  function handleAppTouchEnd(event) {
    const gesture = appGestureRef.current;
    appGestureRef.current = null;

    // If another finger is still touching the screen, this release belongs to
    // a multi-touch gesture—not to main navigation.
    if (event?.touches?.length) {
      resetAppSwipePreview();
      return;
    }

    if (!gesture || page === "explore" || bottomTabsHidden) {
      return;
    }

    const node = pagePanelRef.current;
    if (node && gesture.axis === "x") {
      node.style.transition = "transform 190ms ease-out";
      node.style.transform = "translate3d(0, 0, 0)";
      window.setTimeout(() => {
        node.style.transition = "";
        node.style.transform = "";
      }, 220);
    }

    const deltaX = gesture.lastX - gesture.startX;
    const deltaY = gesture.lastY - gesture.startY;
    const horizontal = Math.abs(deltaX);
    const vertical = Math.abs(deltaY);

    if (gesture.axis !== "x" || horizontal < 72 || horizontal < vertical * 1.25) {
      return;
    }

    const targetPage = getSwipeTargetPage(deltaX);
    if (targetPage) {
      changePage(targetPage);
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
        resetAppSwipePreview();
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
            <section ref={pagePanelRef} className={pagePanelClass("marketplace")} aria-hidden={false}>
              <Marketplace
                nav={marketplaceNav}
                setNav={setMarketplaceNav}
                onActivityChange={setMarketplaceActivityOpen}
              />
            </section>
          ) : null}

          {page === "transport" ? (
            <section ref={pagePanelRef} className={pagePanelClass("transport")} aria-hidden={false}>
              <Transport
                onActivityChange={setTransportActivityOpen}
                areaViewRequest={transportAreaRequest}
                onAreaViewRequestHandled={setTransportAreaRequest}
                userId={userId}
                active
              />
            </section>
          ) : null}
        </Suspense>
      </PageTransition>

      {!bottomTabsHidden ? <BottomTabs badges={mainPageBadges} page={page} setPage={changePage} /> : null}
      <ScreenshotVoicePrompt page={page} />
      {guestSession ? <GuestGateCard /> : null}
      {!guestSession ? (
        <CrossServiceActivityHost
          onMarketplaceCountChange={updateMarketplaceBadge}
          onTransportCountChange={updateTransportBadge}
          userId={userId}
        />
      ) : null}
      <NotificationBannerHost userId={userId} />
      {returningIntroOpen ? <ReturningUserIntro onComplete={() => setReturningIntroOpen(false)} /> : null}
    </div>
  );
}

function ScreenshotVoicePrompt({ page }) {
  const [prompt, setPrompt] = useState({ open: false, closing: false, capturedAt: 0 });
  const [voiceCardOpen, setVoiceCardOpen] = useState(false);
  const hideTimerRef = useRef(null);
  const closeTimerRef = useRef(null);
  const blurAtRef = useRef(0);
  const hiddenAtRef = useRef(0);
  const lastRevealAtRef = useRef(0);
  const suppressUntilRef = useRef(0);

  useEffect(() => () => {
    window.clearTimeout(hideTimerRef.current);
    window.clearTimeout(closeTimerRef.current);
  }, []);

  useEffect(() => {
    function revealPrompt() {
      const now = Date.now();
      if (now < suppressUntilRef.current) return;
      if (now - lastRevealAtRef.current < 1_200) return;
      lastRevealAtRef.current = now;
      window.clearTimeout(hideTimerRef.current);
      window.clearTimeout(closeTimerRef.current);
      setPrompt({ open: true, closing: false, capturedAt: now });
      hideTimerRef.current = window.setTimeout(closePrompt, SCREENSHOT_PROMPT_AUTO_HIDE_MS);
    }

    function closePrompt() {
      setPrompt((current) => {
        if (!current.open || current.closing) return current;
        return { ...current, closing: true };
      });
      window.clearTimeout(closeTimerRef.current);
      closeTimerRef.current = window.setTimeout(() => {
        setPrompt({ open: false, closing: false, capturedAt: 0 });
      }, SCREENSHOT_PROMPT_EXIT_MS);
    }

    function handleKeyDown(event) {
      const key = String(event.key || "").toLowerCase();
      const printScreen = key === "printscreen";
      const desktopScreenshotCombo = (event.metaKey || event.ctrlKey) && event.shiftKey && ["3", "4", "5", "s"].includes(key);
      if (printScreen || desktopScreenshotCombo) revealPrompt();
    }

    function handleKeyUp(event) {
      if (String(event.key || "").toLowerCase() === "printscreen") revealPrompt();
    }

    function handleBlur() {
      blurAtRef.current = Date.now();
    }

    function handleFocus() {
      const elapsed = Date.now() - blurAtRef.current;
      if (elapsed > 120 && elapsed < SCREENSHOT_RETURN_WINDOW_MS) revealPrompt();
    }

    function handleVisibilityChange() {
      if (document.hidden) {
        hiddenAtRef.current = Date.now();
        return;
      }

      const elapsed = Date.now() - hiddenAtRef.current;
      if (elapsed > 120 && elapsed < SCREENSHOT_RETURN_WINDOW_MS) revealPrompt();
    }

    function handleSuppressPrompt(event) {
      const duration = Math.max(0, Number(event.detail?.durationMs || 3_000));
      suppressUntilRef.current = Math.max(suppressUntilRef.current, Date.now() + duration);
    }

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    window.addEventListener("blur", handleBlur);
    window.addEventListener("focus", handleFocus);
    window.addEventListener("kuntai-suppress-screenshot-prompt", handleSuppressPrompt);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
      window.removeEventListener("blur", handleBlur);
      window.removeEventListener("focus", handleFocus);
      window.removeEventListener("kuntai-suppress-screenshot-prompt", handleSuppressPrompt);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, []);

  const category = page === "marketplace" ? "marketplace" : page === "transport" ? "transport" : "explore";
  const currentScreen = page === "marketplace" ? "UrMall" : page === "transport" ? "Transport" : "Explore";
  const motionClass = prompt.closing ? "kt-toast-collapse-out" : "kt-toast-expand-in";

  // The floating card replaces the old navigation to the Your Voice menu, so
  // the user can complain (with the screenshot) without leaving this screen.
  if (voiceCardOpen) {
    return (
      <ScreenshotVoiceCard
        category={category}
        currentScreen={currentScreen}
        onClose={() => setVoiceCardOpen(false)}
      />
    );
  }

  if (!prompt.open) return null;

  function addToYourVoice() {
    window.clearTimeout(hideTimerRef.current);
    window.clearTimeout(closeTimerRef.current);
    setPrompt({ open: false, closing: false, capturedAt: 0 });
    setVoiceCardOpen(true);
  }

  function dismiss() {
    setPrompt((current) => ({ ...current, closing: true }));
    window.clearTimeout(closeTimerRef.current);
    closeTimerRef.current = window.setTimeout(() => {
      setPrompt({ open: false, closing: false, capturedAt: 0 });
    }, SCREENSHOT_PROMPT_EXIT_MS);
  }

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+5.25rem)] z-[1350] flex justify-center px-4 sm:bottom-5">
      <div className={`${motionClass} pointer-events-auto flex w-full max-w-sm items-center gap-2 rounded-[24px] border border-sky-100 bg-white/95 p-2 shadow-2xl shadow-slate-950/18 backdrop-blur-xl`}>
        <button
          type="button"
          onClick={addToYourVoice}
          className="kt-pressable flex min-w-0 flex-1 items-center gap-3 rounded-[20px] bg-slate-950 px-3 py-3 text-left text-white"
        >
          <span className="grid h-10 w-10 flex-none place-items-center rounded-2xl bg-sky-400 text-slate-950">
            <HiOutlineCamera className="text-xl" />
          </span>
          <span className="min-w-0">
            <span className="flex items-center gap-1.5 text-sm font-black">
              <HiOutlineLightBulb className="text-base text-sky-200" />
              {i18nText("ui.literals.k8443fc46e9fd")}
            </span>
            <span className="mt-0.5 block truncate text-xs font-bold text-slate-300">
              {i18nText("ui.literals.kd47362fc1297")}
            </span>
          </span>
        </button>
        <button
          type="button"
          onClick={dismiss}
          className="grid h-11 w-11 flex-none place-items-center rounded-[18px] bg-slate-100 text-slate-600 hover:bg-slate-200"
          aria-label={i18nText("ui.literals.kd9371b9a4bd2")}
        >
          <HiOutlineXMark className="text-xl" />
        </button>
      </div>
    </div>
  );
}
