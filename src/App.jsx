import { useEffect, useState } from "react";

import { useAuth } from "./Backend/hooks/useAuth";
import { useOnboarding } from "./Backend/hooks/useOnboarding";
import BottomTabs from "./components/BottomTabs";
import Explore from "./components/Explore/Explore";
import Marketplace from "./components/Marketplace/Marketplace";
import OnboardingFlow from "./components/onboarding/OnboardingFlow";
import Transport from "./components/transport/Transport";
import Login from "./Login";
import { stopAllExploreMedia } from "./components/Explore/shared/singleMediaPlayback";

function AppLoading({ page = "explore" }) {
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
            <div className="mx-auto h-3 w-20 animate-pulse rounded-full bg-slate-200" />
          </div>
          <div className="flex justify-end gap-2">
            <div className="h-10 w-10 animate-pulse rounded-xl bg-slate-100" />
            <div className="h-10 w-10 animate-pulse rounded-xl bg-slate-100" />
          </div>
        </div>
      </div>

      <div className="space-y-4 px-4 py-4">
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
    isComplete: onboardingComplete,
  } = useOnboarding(user);
  const [page, setPage] = useState(() => localStorage.getItem("kuntai-last-page") || "explore");
  const [exploreFullScreen, setExploreFullScreen] = useState(false);
  const [marketplaceNav, setMarketplaceNav] = useState({ root: "marketplace", sub: null });

  useEffect(() => {
    stopAllExploreMedia();
    localStorage.setItem("kuntai-last-page", page);
  }, [page]);

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

  if (loading || (user && onboardingLoading)) {
    return <AppLoading page={page} />;
  }

  if (!user) {
    return <Login />;
  }

  if (!onboardingComplete) {
    return <OnboardingFlow profile={onboardingProfile} onComplete={refreshOnboarding} />;
  }

  const bottomTabsHidden = exploreFullScreen || marketplaceNav.sub;

  return (
    <div className="min-h-screen w-full max-w-full overflow-x-clip bg-slate-100">
      {page === "explore" && <Explore onScreenModeChange={setExploreFullScreen} />}
      {page === "marketplace" && <Marketplace nav={marketplaceNav} setNav={setMarketplaceNav} />}
      {page === "transport" && <Transport />}

      {!bottomTabsHidden ? <BottomTabs page={page} setPage={setPage} /> : null}
    </div>
  );
}
