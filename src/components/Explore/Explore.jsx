// src/Explore/Explore.jsx
import { useEffect, useState } from "react";
import { useAuth } from "../../Backend/hooks/useAuth";
import { useBrowserBack } from "../../Backend/hooks/useBrowserBack";
import { useExploreNavigation } from "../../Backend/hooks/useExploreNavigation";
import { useScrollHidden } from "../../Backend/hooks/useScrollHidden";
import { buildExploreProfileFromUser, fetchExploreProfile } from "../../Backend/services/exploreService";

// Pages (PARENT TAB CONTENT)
import UrFeed from "./ExploreTabs/urfeed/UrFeed";
import Swip from "./ExploreTabs/swip/Swip";
import Connections from "./ExploreTabs/connections/Connections"
import Notifications from "./ExploreTabs/notification/Notifications";
import ActivityScreen from "./SocialMenu/activity/ActivityScreen";
import FutureFeaturesScreen from "./SocialMenu/future/FutureFeaturesScreen";
import MessagesScreen from "./SocialMenu/messages/MessagesScreen";
import MyPostsScreen from "./SocialMenu/myPosts/MyPostsScreen";
import PrivacyScreen from "./SocialMenu/privacy/PrivacyScreen";
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
      <div className="kuntai-card p-6 text-center">
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
  const [messageRecipient, setMessageRecipient] = useState(null);
  const exploreNav = useExploreNavigation(MENU_SCREENS);
  const navHidden = useScrollHidden();
  const { user } = useAuth();
  const profile = profileOverride || buildExploreProfileFromUser(user);
  const { activeTab, activeMenuScreen, menuScreen } = exploreNav;

  useBrowserBack(exploreNav.isFullScreen, exploreNav.goBackMenuScreen, `explore-${activeMenuScreen || "screen"}`);

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

  function openSearchResult(result) {
    if (!result) {
      return;
    }

    if (result.type === "people") {
      openViewedProfile({
        userId: result.userId || "",
        displayName: result.title || "KunThai User",
        username: result.username || "",
        avatarUrl: result.avatarUrl || "",
        accountType: result.accountType || "personal",
      });
      return;
    }

    if (result.type === "hashtag") {
      exploreNav.setActiveTab("UrFeed");
      return;
    }

    if (result.postId) {
      exploreNav.setActiveTab(result.type === "swip" ? "Swip" : "UrFeed");
      setTimeout(() => {
        document.getElementById(`post-${result.postId}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
      }, 250);
    }
  }

  function startChat(recipient) {
    setMessageRecipient(recipient);
    exploreNav.openMenuScreen("Messages");
  }

  function openMenuScreen(screen) {
    if (screen === "Messages") {
      setMessageRecipient(null);
    }
    exploreNav.openMenuScreen(screen);
  }

  function renderMenuScreen() {
    if (!activeMenuScreen) {
      return null;
    }

    if (activeMenuScreen === "Profile") {
      return (
        <ProfileScreen
          profile={profile}
          currentUserId={profile.userId}
          hideHeader
          editable
          onOpenNotification={openNotificationTarget}
          onProfileUpdate={setProfileOverride}
          onStartChat={startChat}
        />
      );
    }

    if (activeMenuScreen === "ViewedProfile") {
      return (
        <ProfileScreen
          profile={viewedProfile || profile}
          currentUserId={profile.userId}
          hideHeader
          editable={viewedProfile?.userId === profile.userId}
          onOpenNotification={openNotificationTarget}
          onProfileUpdate={setProfileOverride}
          onStartChat={startChat}
        />
      );
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

    if (activeMenuScreen === "Messages") {
      return <MessagesScreen currentProfile={profile} hideHeader initialRecipient={messageRecipient} />;
    }

    if (activeMenuScreen === "Connections") {
      return <Connections currentUserId={profile.userId} onViewProfile={openViewedProfile} />;
    }

    if (activeMenuScreen === "Privacy") {
      return <PrivacyScreen hideHeader />;
    }

    if (activeMenuScreen === "FutureFeatures") {
      return <FutureFeaturesScreen />;
    }

    return <PlaceholderMenuScreen screen={menuScreen} />;
  }

  if (exploreNav.isFullScreen) {
    return (
      <div className="min-h-screen w-full overflow-x-hidden bg-slate-100 kuntai-safe-bottom">
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
    <div className="min-h-screen w-full overflow-x-hidden bg-slate-100 kuntai-safe-bottom">

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
          onNavigate={openMenuScreen}
          onCreateSelect={exploreNav.openComposer}
          onSearchResult={openSearchResult}
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
