// src/Explore/Explore.jsx
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useAuth } from "../../Backend/hooks/useAuth";
import { useBackSwipe } from "../../Backend/hooks/useBackSwipe";
import { useBrowserBack } from "../../Backend/hooks/useBrowserBack";
import { useExploreNavigation } from "../../Backend/hooks/useExploreNavigation";
import { useScrollHidden } from "../../Backend/hooks/useScrollHidden";
import { buildExploreProfileFromUser, ensureExploreProfile, fetchExploreProfile } from "../../Backend/services/exploreService";

// Pages (PARENT TAB CONTENT)
import UrFeed from "./ExploreTabs/urfeed/UrFeed";
import Swip from "./ExploreTabs/swip/Swip";
import Connections from "./ExploreTabs/connections/Connections"
import Notifications from "./ExploreTabs/notification/Notifications";
import ActivityScreen from "./SocialMenu/activity/ActivityScreen";
import HelpCenterScreen from "./SocialMenu/help/HelpCenterScreen";
import MessagesScreen from "./SocialMenu/messages/MessagesScreen";
import MyPostsScreen from "./SocialMenu/myPosts/MyPostsScreen";
import PrivacyScreen from "./SocialMenu/privacy/PrivacyScreen";
import ProfileScreen from "./SocialMenu/profile/ProfileScreen";
import SavedPostsScreen from "./SocialMenu/savedPosts/SavedPostsScreen";
import SettingsScreen from "./SocialMenu/settings/SettingsScreen";
import SocialScreenHeader from "./SocialMenu/shared/SocialScreenHeader";
import TermsPoliciesScreen from "./SocialMenu/terms/TermsPoliciesScreen";
import { MENU_SCREENS } from "./config/menuScreens";

// UI Components
import ExploreHeader from "./components/header/ExploreHeader";
import { SocialMenuContent } from "./components/header/HeaderMenu";
import ExploreTabs from "./ExploreTabs/ExploreTabs";
import { postingStages } from "./ExploreTabs/urfeed/feed/composer/postReviewPipeline";
import { stopAllExploreMedia } from "./shared/singleMediaPlayback";

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
  const [profileLoading, setProfileLoading] = useState(true);
  const [profileError, setProfileError] = useState("");
  const [profileFetched, setProfileFetched] = useState(false);
  const [viewedProfile, setViewedProfile] = useState(null);
  const [messageRecipient, setMessageRecipient] = useState(null);
  const [messageConversationActive, setMessageConversationActive] = useState(false);
  const [postingNotice, setPostingNotice] = useState(null);
  const [topChromeHeight, setTopChromeHeight] = useState(0);
  const topChromeRef = useRef(null);
  const tabScrollRef = useRef({});
  const exploreNav = useExploreNavigation(MENU_SCREENS);
  const navHidden = useScrollHidden();
  const { user, loading: authLoading } = useAuth();
  const authProfile = buildExploreProfileFromUser(user);
  const profile = profileOverride;
  const currentUserId = profile?.userId || user?.id || "";
  const { activeTab, activeMenuScreen, menuScreen } = exploreNav;
  const isSwipTab = activeTab === "Swip";
  const profileExists = !authLoading && profileFetched && Boolean(profile);
  const showProfileSkeleton = authLoading || profileLoading || !profileFetched;

  const goBackFullScreen = useBrowserBack(exploreNav.isFullScreen, exploreNav.goBackMenuScreen, `explore-${activeMenuScreen || "screen"}`);
  const fullScreenSwipeRef = useBackSwipe(exploreNav.isFullScreen, exploreNav.goBackMenuScreen, {
    edgeWidth: Math.min(280, Math.max(160, Math.round(window.innerWidth * 0.45))),
    minDistance: 58,
    maxVerticalDrift: 92,
  });

  useLayoutEffect(() => {
    const node = topChromeRef.current;
    if (!node) {
      return undefined;
    }

    function measure() {
      setTopChromeHeight(Math.ceil(node.getBoundingClientRect().height || 0));
    }

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    window.addEventListener("resize", measure);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [isSwipTab, navHidden]);

  useEffect(() => {
    onScreenModeChange?.(exploreNav.isFullScreen || isSwipTab || Boolean(activeMenuScreen));

    stopAllExploreMedia();

    return () => {
      onScreenModeChange?.(false);
    };
  }, [exploreNav.isFullScreen, activeMenuScreen, activeTab, isSwipTab, onScreenModeChange]);

  useEffect(() => {
    function handleVisibilityChange() {
      if (document.hidden) {
        stopAllExploreMedia();
      }
    }

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      stopAllExploreMedia();
    };
  }, []);

  useEffect(() => {
    if (authLoading) {
      setProfileOverride(null);
      setProfileLoading(true);
      setProfileError("");
      setProfileFetched(false);
      return undefined;
    }

    if (!user?.id) {
      setProfileOverride(null);
      setProfileLoading(false);
      setProfileFetched(true);
      return undefined;
    }

    let alive = true;
    setProfileLoading(true);
    setProfileError("");
    setProfileFetched(false);

    ensureExploreProfile(user)
      .then((profileData) => {
        if (alive) {
          setProfileOverride(profileData);
          setProfileFetched(true);
        }
      })
      .catch((error) => {
        if (alive) {
          setProfileError(error.message || "Unable to load your Explore profile.");
          setProfileOverride(null);
          setProfileFetched(true);
        }
      })
      .finally(() => {
        if (alive) {
          setProfileLoading(false);
        }
      });

    return () => {
      alive = false;
    };
  }, [authLoading, user]);

  useEffect(() => {
    let clearTimer;

    function handlePostingUpdate(event) {
      const detail = event.detail || {};
      clearTimeout(clearTimer);
      setPostingNotice(detail);

      if (detail.status === "complete" || detail.status === "error") {
        clearTimer = setTimeout(() => setPostingNotice(null), 4200);
      }
    }

    window.addEventListener("explore-posting-update", handlePostingUpdate);
    return () => {
      clearTimeout(clearTimer);
      window.removeEventListener("explore-posting-update", handlePostingUpdate);
    };
  }, []);

  useEffect(() => {
    function handleOpenTab(event) {
      const tab = event.detail?.tab;
      if (tab) {
        exploreNav.setActiveTab(tab);
      }
    }

    window.addEventListener("explore-open-tab", handleOpenTab);
    return () => window.removeEventListener("explore-open-tab", handleOpenTab);
  }, [exploreNav]);

  function openViewedProfile(authorProfile) {
    stopAllExploreMedia();
    exploreNav.rememberScrollPosition();
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
        userId: notification.actor_user_id || "",
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
      scrollToNotificationPost(notification.post_id);
    }
  }

  function scrollToNotificationPost(postId, attempt = 0) {
    window.setTimeout(() => {
      const node = document.getElementById(`post-${postId}`);
      if (node) {
        node.scrollIntoView({ behavior: "smooth", block: "center" });
        return;
      }

      if (attempt < 12) {
        scrollToNotificationPost(postId, attempt + 1);
      }
    }, attempt ? 220 : 260);
  }

  function openSearchResult(result) {
    if (!result) {
      return;
    }

    if (result.type === "people") {
      openViewedProfile({
        userId: result.userId || "",
        displayName: result.title || "Profile",
        username: result.username || "",
        avatarUrl: result.avatarUrl || "",
        accountType: result.accountType || "personal",
      });
      return;
    }

    if (result.type === "hashtag") {
      exploreNav.setActiveTab(result.targetType === "swip" ? "Swip" : "UrFeed");
      if (result.postId) {
        scrollToNotificationPost(result.postId);
      }
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
    stopAllExploreMedia();
    exploreNav.rememberScrollPosition();
    setMessageRecipient(recipient);
    exploreNav.openMenuScreen("Messages");
  }

  function openMenuScreen(screen, options = {}) {
    stopAllExploreMedia();
    exploreNav.rememberScrollPosition();
    if (screen === "Messages") {
      setMessageRecipient(null);
    }
    exploreNav.openMenuScreen(screen, options);
  }

  function switchExploreTab(tab) {
    tabScrollRef.current[activeTab] = window.scrollY || 0;
    exploreNav.setActiveTab(tab);
    const nextScroll = tabScrollRef.current[tab] || 0;
    requestAnimationFrame(() => {
      requestAnimationFrame(() => window.scrollTo({ top: nextScroll, behavior: "instant" }));
    });
  }

  function renderMenuScreen() {
    if (!activeMenuScreen) {
      return null;
    }

    if (activeMenuScreen === "Menu") {
      return (
        <div className="min-h-[calc(100vh-72px)] bg-slate-100">
          <aside className="flex min-h-[calc(100vh-72px)] w-full flex-col bg-white shadow-sm">
            <SocialMenuContent onNavigate={openMenuScreen} />
          </aside>
        </div>
      );
    }

    if (activeMenuScreen === "Profile") {
      return (
        <ProfileScreen
          profile={profile}
          authProfile={authProfile}
          currentUserId={currentUserId}
          hideHeader
          editable
          loading={profileLoading}
          loadError={profileError}
          profileFetched={profileFetched}
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
          authProfile={authProfile}
          currentUserId={currentUserId}
          hideHeader
          editable={viewedProfile?.userId === profile?.userId}
          loading={!viewedProfile}
          profileFetched={Boolean(viewedProfile)}
          onOpenNotification={openNotificationTarget}
          onProfileUpdate={setProfileOverride}
          onStartChat={startChat}
        />
      );
    }

    if (activeMenuScreen === "MyPosts") {
      return <MyPostsScreen currentUserId={currentUserId} hideHeader />;
    }

    if (activeMenuScreen === "SavedPosts") {
      return <SavedPostsScreen currentUserId={currentUserId} hideHeader />;
    }

    if (activeMenuScreen === "Activity") {
      return <ActivityScreen hideHeader onOpenNotification={openNotificationTarget} />;
    }

    if (activeMenuScreen === "Notifications") {
      return <Notifications currentUserId={currentUserId} onOpenNotification={openNotificationTarget} />;
    }

    if (activeMenuScreen === "Messages") {
      return (
        <MessagesScreen
          currentProfile={profile}
          hideHeader
          initialRecipient={messageRecipient}
          onConversationActiveChange={setMessageConversationActive}
          onViewProfile={openViewedProfile}
        />
      );
    }

    if (activeMenuScreen === "Connections") {
      return <Connections currentUserId={currentUserId} onViewProfile={openViewedProfile} />;
    }

    if (activeMenuScreen === "Privacy") {
      return <PrivacyScreen hideHeader />;
    }

    if (activeMenuScreen === "Settings") {
      return <SettingsScreen hideHeader />;
    }

    if (activeMenuScreen === "HelpCenter") {
      return <HelpCenterScreen hideHeader />;
    }

    if (activeMenuScreen === "TermsPolicies") {
      return <TermsPoliciesScreen hideHeader />;
    }

    return <PlaceholderMenuScreen screen={menuScreen} />;
  }

  return (
    <>
    <div
      className={`${exploreNav.isFullScreen ? "hidden" : "block"} min-h-screen w-full max-w-full touch-pan-y overscroll-x-none overflow-x-clip bg-slate-100 ${isSwipTab ? "" : "kuntai-safe-bottom"}`}
      style={{ "--explore-top-chrome-height": `${topChromeHeight}px` }}
    >
      {postingNotice ? <PostingStatusBanner notice={postingNotice} /> : null}

      {/* =========================
          HEADER + PARENT TABS
      ========================= */}
      <div
        ref={topChromeRef}
        className={`sticky top-0 z-30 overflow-hidden ${
          isSwipTab
            ? "bg-slate-100/95 backdrop-blur"
            : `bg-slate-100/95 backdrop-blur transition-[max-height,opacity,transform] duration-300 ${
                navHidden ? "max-h-0 -translate-y-2 opacity-0 pointer-events-none" : "max-h-56 translate-y-0 opacity-100"
              }`
        }`}
      >
        <div
          className={
            isSwipTab
              ? `overflow-hidden transition-[max-height,opacity,transform] duration-300 ${
                  navHidden
                    ? "max-h-0 -translate-y-2 opacity-0 pointer-events-none"
                    : "max-h-40 translate-y-0 opacity-100"
                }`
              : ""
          }
        >
          {!isSwipTab ? (
            <ExploreHeader
              currentProfile={profile}
              onAlertsClick={() => exploreNav.openMenuScreen("Notifications")}
              onNavigate={openMenuScreen}
              onCreateSelect={exploreNav.openComposer}
              onSearchResult={openSearchResult}
            />
          ) : null}
        </div>

        {/* =========================
            PARENT TABS
        ========================= */}
        <ExploreTabs
          activeTab={activeTab}
          setActiveTab={switchExploreTab}
        />
      </div>

      {/* =========================
          ACTIVE PAGE
      ========================= */}
      <div className={`w-full max-w-full overflow-x-clip ${isSwipTab ? "pt-0" : "pt-2"}`}>
        {showProfileSkeleton ? <ExploreProfileSkeleton /> : null}
        {!profileLoading && profileError ? <ExploreProfileError message={profileError} /> : null}
        {profileExists ? (
          <>
            <div className={activeTab === "UrFeed" ? "block" : "hidden"} aria-hidden={activeTab !== "UrFeed"}>
              <UrFeed profile={profile} onViewProfile={openViewedProfile} />
            </div>
            <div className={activeTab === "Swip" ? "block" : "hidden"} aria-hidden={activeTab !== "Swip"}>
              <Swip active={activeTab === "Swip" && !exploreNav.isFullScreen} currentUserId={profile.userId} onViewProfile={openViewedProfile} />
            </div>
            <div className={activeTab === "Connections" ? "block" : "hidden"} aria-hidden={activeTab !== "Connections"}>
              <Connections currentUserId={profile.userId} onViewProfile={openViewedProfile} />
            </div>
          </>
        ) : null}
      </div>

    </div>
    {exploreNav.isFullScreen ? (
      <div
        ref={fullScreenSwipeRef}
        className="min-h-screen w-full max-w-full touch-pan-y overscroll-x-none overflow-x-clip bg-slate-100 kuntai-safe-bottom"
      >
        {activeMenuScreen === "Messages" && messageConversationActive ? null : (
          <SocialScreenHeader
            title={menuScreen.title}
            subtitle={menuScreen.subtitle}
            onBack={goBackFullScreen}
          />
        )}
        {renderMenuScreen()}
      </div>
    ) : null}
    </>
  );
}

function ExploreProfileSkeleton() {
  return (
    <div className="space-y-4 px-4 py-4 sm:px-5 lg:px-8">
      <div className="rounded-[24px] border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="h-11 w-11 animate-pulse rounded-full bg-slate-200" />
          <div className="flex-1 space-y-2">
            <div className="h-4 w-40 animate-pulse rounded-full bg-slate-200" />
            <div className="h-3 w-24 animate-pulse rounded-full bg-slate-100" />
          </div>
        </div>
        <div className="mt-4 h-24 animate-pulse rounded-[20px] bg-slate-100" />
      </div>
    </div>
  );
}

function ExploreProfileError({ message }) {
  return (
    <div className="px-4 py-4 sm:px-5 lg:px-8">
      <div className="rounded-[24px] border border-rose-100 bg-white p-5 text-sm font-bold text-rose-700 shadow-sm">
        {message}
      </div>
    </div>
  );
}

function PostingStatusBanner({ notice }) {
  const progress = Math.max(0, Math.min(100, notice.progress || 0));
  const isError = notice.status === "error";
  const activeIndex = Math.max(0, postingStages.findIndex((item) => item.key === notice.stage));
  const currentStage = postingStages[activeIndex] || postingStages[0];
  const title = isError ? "Post not published" : notice.status === "complete" ? "Post published" : "Publishing in background";
  const stageMessages = {
    preparing: "Locking your draft and preparing the upload.",
    "text-scan": "Scanning text for policy violations and unsafe content.",
    "media-scan": "Reviewing attached media before it reaches the feed.",
    publishing: "Publishing the approved post to Explore.",
    syncing: "Syncing the new post into your feed.",
    complete: "Your post is live on Explore.",
  };
  const message = notice.message || stageMessages[notice.stage] || "Processing your post securely.";

  return (
    <div className="fixed left-3 right-3 top-3 z-[90] mx-auto max-w-3xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl">
      <div className="px-4 py-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className={`text-[11px] font-black uppercase tracking-[0.18em] ${isError ? "text-rose-600" : "text-sky-700"}`}>{title}</p>
            <h3 className="mt-1 truncate text-sm font-black text-slate-950">{isError ? "Review stopped" : currentStage.label}</h3>
            <p className="mt-0.5 line-clamp-2 text-xs font-semibold leading-5 text-slate-600">{message}</p>
          </div>
          <span className={`rounded-full px-2.5 py-1 text-xs font-black ${isError ? "bg-rose-50 text-rose-700" : "bg-sky-50 text-sky-700"}`}>{progress}%</span>
        </div>

        {!isError ? (
          <>
            <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-100">
              <div className="h-full rounded-full bg-sky-600 transition-all duration-300" style={{ width: `${progress}%` }} />
            </div>
            <div className="mt-3 grid grid-cols-3 gap-1.5 sm:grid-cols-6">
              {postingStages.map((stage, index) => {
                const done = notice.status === "complete" || index < activeIndex;
                const active = stage.key === notice.stage && notice.status !== "complete";
                return (
                  <div
                    key={stage.key}
                    className={`h-1.5 rounded-full transition-colors ${done || active ? "bg-sky-600" : "bg-slate-200"}`}
                    title={stage.label}
                  />
                );
              })}
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}
