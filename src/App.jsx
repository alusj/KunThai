// =======================
// src/App.jsx
// Root application component
// =======================

import { useEffect, useState } from "react";
import supabase from "./Backend/lib/supabaseClient.js";

// Screens
import BottomTabs from "./components/BottomTabs.jsx";
import Login from "./Login.jsx";
import Explore from "./components/Explore/Explore.jsx";
import Marketplace from "./components/Marketplace/Marketplace.jsx";
// ❌ Removed UrBank
import Transport from "./components/transport/Transport";

export default function App() {

  const [session, setSession] = useState(null);
  const [authReady, setAuthReady] = useState(false);

  const [nav, setNav] = useState(() => {
    const saved = localStorage.getItem("appNavigation");
    return saved
      ? JSON.parse(saved)
      : { root: "explore", sub: null };
  });

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session ?? null);
      setAuthReady(true);
    });

    const { data: listener } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setSession(session ?? null);
      }
    );

    return () => listener.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    localStorage.setItem("appNavigation", JSON.stringify(nav));
  }, [nav]);

  if (!authReady) {
    return (
      <div className="min-h-screen grid place-items-center text-gray-600">
        Loading…
      </div>
    );
  }

  if (!session) {
    return <Login />;
  }

  const showBottomTabs = nav.sub === null;

  return (
    <div className="min-h-screen bg-slate-100 pb-20">

      {nav.root === "explore" && (
        <Explore setNav={setNav} />
      )}

      {nav.root === "marketplace" && (
        <Marketplace nav={nav} setNav={setNav} />
      )}

      {nav.root === "transport" && (
        <Transport nav={nav} setNav={setNav} />
      )}

      {showBottomTabs && (
        <BottomTabs
          page={nav.root}
          setPage={(root) =>
            setNav({ root, sub: null })
          }
        />
      )}
    </div>
  );
}