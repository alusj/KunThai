// src/Explore/Explore.jsx
import { useEffect, useState } from "react";
import { useAuth } from "../../Backend/hooks/useAuth";
import { useExploreNavigation } from "../../Backend/hooks/useExploreNavigation";
import { useScrollHidden } from "../../Backend/hooks/useScrollHidden";
import { buildExploreProfileFromUser, fetchExploreProfile } from "../../Backend/services/exploreService";

// Pages (PARENT TAB CONTENT)
import UrFeed from "./ExploreTabs/urfeed/UrFeed";
import Swip from "./ExploreTabs/swip/Swip";
import Connections from "./ExploreTabs/connections/Connections"
import Notifications from "./ExploreTabs/notification/Notifications";
import ActivityScreen from "./SocialMenu/activity/ActivityScreen";
import MyPostsScreen from "./SocialMenu/myPosts/MyPostsScreen";
import ProfileScreen from "./SocialMenu/profile/ProfileScreen";
import SavedPostsScreen from "./SocialMenu/savedPosts/SavedPostsScreen";
import SocialScreenHeader from "./SocialMenu/shared/SocialScreenHeader";
import { MENU_SCREENS } from "./config/menuScreens";

// UI Components
import ExploreHeader from "./components/header/ExploreHeader";
import ExploreTabs from "./ExploreTabs/ExploreTabs";

function PlaceholderMenuScreen({ screen }) {
  return (
    <div className="px-4 py-4 sm:px-5">
      <div className="rounded-[24px] border border-slate-200 bg-white p-6 text-center shadow-sm">
        <h3 className="text-lg font-semibold text-slate-950">{screen.emptyTitle}</h3>
        <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-600">{screen.emptyMessage}</p>
      </div>
    </div>
  );
}

/*
  Explore.jsx
  -----------
  Root container for the Explore section.

  Responsibilities:
  - Renders the header
  - Controls parent tab state
  - Decides which page to show
*/

export default function Explore({ onScreenModeChange }) {
  const [profileOverride, setProfileOverride] = useState(null);
  const [viewedProfile, setViewedProfile] = useState(null);
  const exploreNav = useExploreNavigation(MENU_SCREENS);
  const navHidden = useScrollHidden();
  const { user } = useAuth();
  const profile = profileOverride || buildExploreProfileFromUser(user);
  const { activeTab, activeMenuScreen, menuScreen } = exploreNav;

  useEffect(() => {
    onScreenModeChange?.(exploreNav.isFullScreen);

    return () => {
      onScreenModeChange?.(false);
    };
  }, [exploreNav.isFullScreen, onScreenModeChange]);

  function openViewedProfile(authorProfile) {
    setViewedProfile(authorProfile);
    exploreNav.openMenuScreen("ViewedProfile");

    if (authorProfile?.userId) {
      fetchExploreProfile(authorProfile.userId)
        .then((profileData) => {
          if (profileData) {
            setViewedProfile({ ...authorProfile, ...profileData });
          }
        })
        .catch(() => {});
    }
  }

  function openNotificationTarget(notification) {
    exploreNav.closeMenuScreens();

    if (notification?.type === "follow" && notification.actor_name) {
      openViewedProfile({
        displayName: notification.actor_name,
        username: "",
        avatarUrl: notification.actor_avatar_url || "",
        accountType: "personal",
      });
      return;
    }

    if (notification?.post_id) {
      const targetTab = String(notification.media_type || "").includes("video") ? "Swip" : "UrFeed";
      exploreNav.setActiveTab(targetTab);
      setTimeout(() => {
        document.getElementById(`post-${notification.post_id}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
      }, 250);
    }
  }

  function renderMenuScreen() {
    if (!activeMenuScreen) {
      return null;
    }

    if (activeMenuScreen === "Profile") {
      return <ProfileScreen profile={profile} hideHeader editable onProfileUpdate={setProfileOverride} />;
    }

    if (activeMenuScreen === "ViewedProfile") {
      return <ProfileScreen profile={viewedProfile || profile} hideHeader editable={viewedProfile?.userId === profile.userId} onProfileUpdate={setProfileOverride} />;
    }

    if (activeMenuScreen === "MyPosts") {
      return <MyPostsScreen currentUserId={profile.userId} hideHeader />;
    }

    if (activeMenuScreen === "SavedPosts") {
      return <SavedPostsScreen currentUserId={profile.userId} hideHeader />;
    }

    if (activeMenuScreen === "Activity") {
      return <ActivityScreen hideHeader onOpenNotification={openNotificationTarget} />;
    }

    if (activeMenuScreen === "Notifications") {
      return <Notifications onOpenNotification={openNotificationTarget} />;
    }

    if (activeMenuScreen === "Connections") {
      return <Connections currentUserId={profile.userId} onViewProfile={openViewedProfile} />;
    }

    return <PlaceholderMenuScreen screen={menuScreen} />;
  }

  if (exploreNav.isFullScreen) {
    return (
      <div className="min-h-screen w-full overflow-x-hidden bg-slate-100">
        <SocialScreenHeader
          title={menuScreen.title}
          subtitle={menuScreen.subtitle}
          onBack={exploreNav.goBackMenuScreen}
        />
        {renderMenuScreen()}
      </div>
    );
  }

  return (
    <div className="min-h-screen w-full overflow-x-hidden bg-slate-100">

      {/* =========================
          HEADER (always visible)
      ========================= */}
      <div
        className={`sticky top-0 z-30 transition-transform duration-300 ${
          navHidden ? "-translate-y-full" : "translate-y-0"
        }`}
      >
        <ExploreHeader
          onAlertsClick={() => exploreNav.openMenuScreen("Notifications")}
          onNavigate={exploreNav.openMenuScreen}
          onCreateSelect={exploreNav.openComposer}
        />

        {/* =========================
            PARENT TABS
        ========================= */}
        <ExploreTabs
          activeTab={activeTab}
          setActiveTab={exploreNav.setActiveTab}
        />
      </div>

      {/* =========================
          ACTIVE PAGE
      ========================= */}
      <div className="pt-2">
        {activeTab === "UrFeed" && <UrFeed profile={profile} onViewProfile={openViewedProfile} />}
        {activeTab === "Swip" && <Swip currentUserId={profile.userId} onViewProfile={openViewedProfile} />}
        {activeTab === "Connections" && <Connections currentUserId={profile.userId} onViewProfile={openViewedProfile} />}
      </div>

    </div>
  );
}
