import { useState } from "react";

import { useAuth } from "./Backend/hooks/useAuth";
import BottomTabs from "./components/BottomTabs";
import Explore from "./components/Explore/Explore";
import Marketplace from "./components/Marketplace/Marketplace";
import Transport from "./components/transport/Transport";
import Login from "./Login";

function AppLoading() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100 px-4">
      <div className="rounded-[24px] border border-slate-200 bg-white px-5 py-4 text-sm font-bold text-slate-600 shadow-sm">
        Opening KunTai...
      </div>
    </div>
  );
}

export default function App() {
  const { user, loading } = useAuth();
  const [page, setPage] = useState("explore");
  const [exploreFullScreen, setExploreFullScreen] = useState(false);
  const [marketplaceNav, setMarketplaceNav] = useState({ root: "marketplace", sub: null });

  if (loading) {
    return <AppLoading />;
  }

  if (!user) {
    return <Login />;
  }

  const bottomTabsHidden = exploreFullScreen || marketplaceNav.sub;

  return (
    <div className="min-h-screen bg-slate-100">
      {page === "explore" && <Explore onScreenModeChange={setExploreFullScreen} />}
      {page === "marketplace" && <Marketplace nav={marketplaceNav} setNav={setMarketplaceNav} />}
      {page === "transport" && <Transport />}

      {!bottomTabsHidden ? <BottomTabs page={page} setPage={setPage} /> : null}
    </div>
  );
}
