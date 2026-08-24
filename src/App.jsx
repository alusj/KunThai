import { Suspense, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
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
  ensureVisibilityInviteCode,
  finalizeStoredVisibilityInvite,
  readFlutterwavePaymentReturn,
  verifyFlutterwavePaymentReturn,
} from "./Backend/services/visibilityCreditService";
import { showToast } from "./Backend/services/toastService";
import { ensureExploreProfile } from "./Backend/services/explore/profileService";
import { preloadMainDashboardData } from "./Backend/services/dashboardPreloadService";
import { haptics } from "./Backend/services/feedbackService";
import { canStartNavigationGesture, navigationGesturesLocked } from "./Backend/services/gestureArbitration";
import { hasUnstableNetwork, areGlobalNetworkToastsSuppressed, runConnectivityChecks } from "./Backend/services/networkService";
import {
  markReturningUserActivity,
  readReturningUserActivity,
  shouldShowReturningUserIntro,
} from "./Backend/services/returningUserIntroService";
import { isStartupDestinationReady } from "./Backend/services/startupRevealService";
import { readDefaultMainPage } from "./Backend/services/mainDashboardPreference";
import { lazyWithRetry } from "./Backend/utils/lazyWithRetry";
import LazyRouteBoundary from "./components/shared/LazyRouteBoundary";
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
const PRELOADED_MAIN_PAGES = new Set();

function normalizeMainPage(value) {
  const page = String(value || "").toLowerCase();
  if (page === "urmall") return "marketplace";
  return PAGE_ORDER.includes(page) ? page : "";
}

function canPreloadMainPages() {
  if (typeof navigator === "undefined" || navigator.onLine === false) return false;
  const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
  const effectiveType = String(connection?.effectiveType || "").toLowerCase();
  return connection?.saveData !== true && effectiveType !== "slow-2g" && effectiveType !== "2g";
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

// The welcome-back logo splash is only for returning users who already created
// an account and stayed logged in. A persisted Supabase session in localStorage
// (`sb-<ref>-auth-token`) is exactly that signal, and reading it synchronously
// lets us decide before first paint — so first-time users on the signup screen
// never see the splash even for a frame.
function hasStoredAuthSession() {
  try {
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i);
      if (key && key.startsWith("sb-") && key.includes("-auth-token") && localStorage.getItem(key)) {
        return true;
      }
    }
  } catch {
    // Storage unavailable (private mode): safest to skip the splash.
  }
  return false;
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
    <div className="kt-mobile-viewport bg-slate-100">
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
    // Order: an explicit deep link (hash) wins, then the user's chosen default
    // main dashboard, then the last dashboard they were on ("auto").
    return getMainPageFromHash(window.location.hash) || readDefaultMainPage() || readLastMainPage();
  });
  const [transportMounted, setTransportMounted] = useState(() => page === "transport");
  // Bumped by LazyRouteBoundary after a chunk-load failure to build fresh lazy
  // modules (React caches a failed import, so a new factory is what retries).
  const [chunkReloadKey, setChunkReloadKey] = useState(0);
  const pages = useMemo(
    () => ({
      explore: lazyWithRetry(loadExplore),
      marketplace: lazyWithRetry(loadMarketplace),
      transport: lazyWithRetry(loadTransport),
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- recreate only to retry a failed chunk
    [chunkReloadKey],
  );
  const Explore = pages.explore;
  const Marketplace = pages.marketplace;
  const Transport = pages.transport;
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
  const [twoFactorChallengeRequired, setTwoFactorChallengeRequired] = useState(null);
  // Only a returning user with a persisted session gets the boot splash; a
  // first-time / logged-out user heading to the signup screen starts with none.
  const [startupIntroOpen, setStartupIntroOpen] = useState(hasStoredAuthSession);
  const [returningIntroOpen, setReturningIntroOpen] = useState(false);
  const [activePageReady, setActivePageReady] = useState(() => PRELOADED_MAIN_PAGES.has(page));
  const appGestureRef = useRef(null);
  const pagePanelRef = useRef(null);
  const userId = user?.id || "";
  const guestSession = Boolean(user?.is_anonymous);
  const introUserIdRef = useRef(userId);
  const bootAuthSettledRef = useRef(false);
  setNotificationSeenUser(userId);

  const handleIntroComplete = useCallback(() => {
    setStartupIntroOpen(false);
    setReturningIntroOpen(false);
  }, []);

  const handleTwoFactorResolved = useCallback((required) => {
    setTwoFactorChallengeRequired(Boolean(required));
  }, []);

  useEffect(() => {
    if (page === "transport") setTransportMounted(true);
  }, [page]);

  useLayoutEffect(() => {
    const previousUserId = introUserIdRef.current;
    introUserIdRef.current = userId;

    // The splash may only be opened by the very first auth resolution at boot
    // (a restored session). Once that has settled, a userId change comes from an
    // interactive signup or login in this session — first-time users included —
    // which must never trigger the welcome-back splash.
    if (bootAuthSettledRef.current || loading) return;
    bootAuthSettledRef.current = true;
    if (userId && userId !== previousUserId) setStartupIntroOpen(true);
  }, [loading, userId]);

  useLayoutEffect(() => {
    if (!userId || guestSession || !onboardingComplete || twoFactorPending !== false) {
      setReturningIntroOpen(false);
      return undefined;
    }

    const now = Date.now();
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

  // Orange Money is now a direct in-app collection (Monime payment codes) — the
  // customer approves a prompt on their phone without leaving KunThai, so there
  // is no redirect-return URL to confirm here. ProfileHeaderCard polls the
  // purchase status itself while the sheet stays open.

  useEffect(() => {
    const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
    let previousUnstable = hasUnstableNetwork(connection);

    function announceNetworkState({ initial = false } = {}) {
      const online = navigator.onLine;
      const unstable = online && hasUnstableNetwork(connection);

      // A screen with its own contextual network toasts (Area View) suppresses
      // the global one. Keep the trackers current so no stale transition fires
      // once suppression lifts.
      if (areGlobalNetworkToastsSuppressed()) {
        previousUnstable = unstable;
        return;
      }

      // The persistent NetworkStatusBanner owns the offline and back-online
      // indicators now (a transient toast would just duplicate the strip), so
      // only the "slow / unstable connection" hint stays a toast here.
      if (unstable && (initial || !previousUnstable)) {
        showToast(i18nText("ui.literals.k131cd2aeb63b"), "warning", {
          title: i18nText("ui.literals.kd589e58dce1b"),
          duration: 2800,
          origin: false,
        });
      }

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
    setTwoFactorChallengeRequired(null);
  }, [userId]);

  // The inviter's credit is only granted once the invited account is fully
  // created and has landed on a dashboard (onboarding complete). Gating the
  // finalize call on onboardingComplete — not just sign-in — enforces that on
  // the client; the server RPC re-checks the same condition.
  useEffect(() => {
    if (!userId || guestSession || !onboardingComplete) return;

    // Warm the sharer's own invite code so every share link this session can be
    // stamped with it synchronously (see appendVisibilityReferral).
    ensureVisibilityInviteCode();

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

  // Every fully onboarded KunThai account gets one shared public identity,
  // regardless of whether its first dashboard is Explore, UrMall, or UrRide.
  // This keeps UrFeed people discovery complete for returning/legacy accounts
  // that may have reached another dashboard before Explore was initialized.
  useEffect(() => {
    if (!userId || guestSession || !onboardingComplete) return;
    ensureExploreProfile(user).catch(() => {});
  }, [guestSession, onboardingComplete, user, userId]);

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
    let active = true;
    if (!PRELOADED_MAIN_PAGES.has(page)) setActivePageReady(false);

    Promise.resolve(PAGE_LOADERS[page]?.())
      .then(() => PRELOADED_MAIN_PAGES.add(page))
      .catch(() => {
        // Suspense and the root error boundary own the visible retry path.
      })
      .finally(() => {
        if (active) setActivePageReady(true);
      });

    return () => {
      active = false;
    };
  }, [page]);

  useEffect(() => {
    if (!onboardingComplete || twoFactorPending !== false || !canPreloadMainPages()) return undefined;

    let cancelled = false;
    let startTimer = null;
    let idleHandle = null;
    const pendingPages = PAGE_ORDER.filter(
      (candidate) => candidate !== page && !PRELOADED_MAIN_PAGES.has(candidate),
    );

    const scheduleNext = () => {
      if (cancelled || !pendingPages.length || !canPreloadMainPages()) return;

      const preloadNext = () => {
        if (cancelled || document.visibilityState === "hidden") return;
        const nextPage = pendingPages.shift();
        if (!nextPage) return;

        PRELOADED_MAIN_PAGES.add(nextPage);
        Promise.resolve(PAGE_LOADERS[nextPage]?.())
          .then(() => preloadMainDashboardData(nextPage, { userId }))
          .catch(() => {
            // Navigation still has its regular Suspense/loading path if a
            // speculative preload fails.
            PRELOADED_MAIN_PAGES.delete(nextPage);
          })
          .finally(scheduleNext);
      };

      if (typeof window.requestIdleCallback === "function") {
        idleHandle = window.requestIdleCallback(preloadNext, { timeout: 2200 });
      } else {
        idleHandle = window.setTimeout(preloadNext, 650);
      }
    };

    // Give the visible dashboard priority, then fetch one inactive main chunk
    // per idle period. Hidden screens are not mounted, so they cannot start
    // subscriptions, media, GPS, or other background side effects.
    startTimer = window.setTimeout(scheduleNext, 700);

    return () => {
      cancelled = true;
      window.clearTimeout(startTimer);
      if (idleHandle == null) return;
      if (typeof window.cancelIdleCallback === "function") window.cancelIdleCallback(idleHandle);
      else window.clearTimeout(idleHandle);
    };
  }, [onboardingComplete, page, twoFactorPending, userId]);

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

  const startupDestinationReady = isStartupDestinationReady({
    activePageReady,
    authLoading: loading,
    guestSession,
    hasUser: Boolean(user),
    onboardingChecked,
    onboardingComplete,
    onboardingLoading,
    twoFactorChallengeRequired,
    twoFactorPassed: twoFactorPending === false,
  });
  const introOpen = startupIntroOpen || returningIntroOpen;

  function withStartupIntro(content) {
    return (
      <>
        {content}
        {introOpen ? (
          <ReturningUserIntro
            // A stable key per mode: including userId here used to remount the
            // splash the instant auth resolved, restarting its minimum-hold
            // timer (and reloading the logo) from that later point — which made
            // it linger. Mounting once at boot lets the hold run from boot and
            // only flips `ready` via props as the destination settles.
            key={startupIntroOpen ? "startup" : "returning"}
            ready={startupIntroOpen ? startupDestinationReady : true}
            onComplete={handleIntroComplete}
          />
        ) : null}
      </>
    );
  }

  // While auth is still resolving we do not yet know whether this leads to the
  // login screen, onboarding, or the app - so show a plain backdrop rather than
  // the app skeleton, which never matches the login or onboarding screens.
  if (loading) {
    return withStartupIntro(
      <div className="kt-mobile-viewport bg-slate-100" aria-label={i18nText("ui.literals.k721d964bf95b")} />,
    );
  }

  if (user && !guestSession && (!onboardingChecked || onboardingLoading) && !onboardingReveal) {
    // Users heading into onboarding get the onboarding backdrop; only a
    // returning, onboarded user waiting for their page keeps the app skeleton.
    if (!user.user_metadata?.onboarding_complete) {
      return withStartupIntro(
        <div
          className="kt-mobile-viewport bg-[linear-gradient(180deg,#f7fafc_0%,#eff6ff_28%,#f8fafc_100%)]"
          aria-label={i18nText("ui.literals.k1467547ea632")}
        />,
      );
    }
    return withStartupIntro(<AppLoading page={page} />);
  }
  if (!user) {
    return withStartupIntro(<Login />);
  }

  if (!guestSession && twoFactorPending !== false) {
    return withStartupIntro(
      <TwoFactorGate key={userId} user={user} onResolved={handleTwoFactorResolved}>
        <TwoFactorPassed onPassed={() => setTwoFactorPending(false)} />
      </TwoFactorGate>,
    );
  }

  if (!guestSession && !onboardingComplete && !onboardingReveal) {
    return withStartupIntro(
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
      />,
    );
  }

  const restrictedSectors = accountControl?.restricted_sectors || ["all"];
  const blocksEverything = ["suspended", "banned"].includes(accountControl?.status);
  const blocksCurrentPage = accountControl?.status === "restricted"
    && (restrictedSectors.includes("all") || restrictedSectors.includes(page));
  if (blocksEverything || blocksCurrentPage) {
    const availablePage = blocksEverything ? "" : PAGE_ORDER.find((item) => !restrictedSectors.includes(item));
    return withStartupIntro(
      <AccountRestrictionNotice
        control={accountControl}
        availablePage={availablePage}
        onOpenAvailablePage={() => availablePage && setPage(availablePage)}
        onSignOut={() => supabase.auth.signOut({ scope: "local" })}
      />,
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

    if (!canStartNavigationGesture(event.target)) {
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
    if (event.touches.length !== 1 || navigationGesturesLocked()) {
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

    if (!gesture || page === "explore" || bottomTabsHidden || navigationGesturesLocked()) {
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

  return withStartupIntro(
    <div
      className={`kt-mobile-viewport w-full max-w-full overflow-x-clip bg-slate-100 ${onboardingReveal ? "kt-main-grow-from-onboarding" : ""}`}
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
      <PageTransition active className="kt-mobile-viewport">
        <LazyRouteBoundary
          fallback={<AppLoading page={page} />}
          onRecover={() => setChunkReloadKey((key) => key + 1)}
        >
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

          {transportMounted ? (
            <section
              ref={page === "transport" ? pagePanelRef : null}
              className={pagePanelClass("transport")}
              aria-hidden={page !== "transport"}
              inert={page === "transport" ? undefined : "true"}
            >
              <Transport
                onActivityChange={setTransportActivityOpen}
                areaViewRequest={transportAreaRequest}
                onAreaViewRequestHandled={setTransportAreaRequest}
                userId={userId}
                active={page === "transport"}
              />
            </section>
          ) : null}
        </Suspense>
        </LazyRouteBoundary>
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
    </div>,
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
