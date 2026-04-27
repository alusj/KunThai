import { useEffect, useState } from "react";

import supabase from "./Backend/lib/supabaseClient.js";
import { useOnboarding } from "./Backend/hooks/useOnboarding.js";
import Login from "./Login.jsx";
import BottomTabs from "./components/BottomTabs.jsx";
import Explore from "./components/Explore/Explore.jsx";
import Marketplace from "./components/Marketplace/Marketplace.jsx";
import OnboardingFlow from "./components/onboarding/OnboardingFlow.jsx";
import Transport from "./components/transport/Transport";

function getStoredNavigation() {
  const saved = localStorage.getItem("appNavigation");

  if (!saved) {
    return null;
  }

  try {
    return JSON.parse(saved);
  } catch {
    return null;
  }
}

export default function App() {
  const [session, setSession] = useState(null);
  const [authReady, setAuthReady] = useState(false);
  const { profile, loading: onboardingLoading, isComplete, refresh } = useOnboarding(session);

  const [nav, setNav] = useState(() => getStoredNavigation() ?? { root: "explore", sub: null });
  const [rootScreenOpen, setRootScreenOpen] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session: currentSession } }) => {
      setSession(currentSession ?? null);
      setAuthReady(true);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession ?? null);
    });

    return () => listener.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    localStorage.setItem("appNavigation", JSON.stringify(nav));
  }, [nav]);

  useEffect(() => {
    if (!profile?.primarySurface) {
      return;
    }

    const saved = getStoredNavigation();
    if (!saved) {
      setNav({ root: profile.primarySurface, sub: null });
    }
  }, [profile?.primarySurface]);

  useEffect(() => {
    setRootScreenOpen(false);
  }, [nav.root, nav.sub]);

  if (!authReady) {
    return <div className="grid min-h-screen place-items-center text-gray-600">Loading...</div>;
  }

  if (!session) {
    return <Login />;
  }

  if (onboardingLoading) {
    return (
      <div className="grid min-h-screen place-items-center bg-slate-100 text-slate-600">
        Preparing your KunThai experience...
      </div>
    );
  }

  if (!isComplete) {
    return <OnboardingFlow profile={profile} onComplete={refresh} />;
  }

  const showBottomTabs = nav.sub === null && !rootScreenOpen;

  return (
    <div className={`min-h-screen bg-slate-100 ${showBottomTabs ? "pb-20" : ""}`}>
      {nav.root === "explore" && <Explore onScreenModeChange={setRootScreenOpen} />}
      {nav.root === "marketplace" && <Marketplace nav={nav} setNav={setNav} />}
      {nav.root === "transport" && <Transport nav={nav} setNav={setNav} />}

      {showBottomTabs && (
        <BottomTabs
          page={nav.root}
          setPage={(root) => {
            setNav({ root, sub: null });
          }}
        />
      )}
    </div>
  );
}
