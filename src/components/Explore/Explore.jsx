// src/Explore/Explore.jsx
import { useEffect, useLayoutEffect, useRef, useState } from "react";
//import { useAuth } from "../../Backend/hooks/useAuth";
import { useBackSwipe } from "../../Backend/hooks/useBackSwipe";
import { useBrowserBack } from "../../Backend/hooks/useBrowserBack";
import { useExploreNavigation } from "../../Backend/hooks/useExploreNavigation";
import { useScrollHidden } from "../../Backend/hooks/useScrollHidden";
import { buildExploreProfileFromUser, ensureExploreProfile, fetchExploreProfile } from "../../Backend/services/exploreService";
import {
  clearPostingNotice,
  getPostingNoticeClearDelay,
  POSTING_NOTICE_EVENT,
  readPostingNotice,
  writePostingNotice,
} from "../../Backend/services/explore/postingProgressService";
import { resumePendingVideoReviewJobs } from "../../Backend/services/explore/videoReviewService";

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
import ProfileEditScreen from "./SocialMenu/profile/ProfileEditScreen";
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
import PostingStatusBanner from "./shared/PostingStatusBanner";
import { stopAllExploreMedia } from "./shared/singleMediaPlayback";

const EXPLORE_TAB_ORDER = ["UrFeed", "Swip", "Connections"];
const EXPLORE_STACK_ANIMATION_MS = 280;
const LEFT_SIDE_MENU_SCREENS = new Set(["Menu", "Messages"]);

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

export default function Explore({ active = true, onScreenModeChange, user = null, authLoading = false }) {
  const [profileOverride, setProfileOverride] = useState(null);
  const [profileLoading, setProfileLoading] = useState(true);
  const [profileError, setProfileError] = useState("");
  const [profileFetched, setProfileFetched] = useState(false);
  const [viewedProfile, setViewedProfile] = useState(null);
  const [messageRecipient, setMessageRecipient] = useState(null);
  const [messageConversationActive, setMessageConversationActive] = useState(false);
  const [postingNotice, setPostingNotice] = useState(() => readPostingNotice());
  const [topChromeHeight, setTopChromeHeight] = useState(0);
  const [tabSlideDirection, setTabSlideDirection] = useState("forward");
  const [visibleMenuStack, setVisibleMenuStack] = useState([]);
  const [menuStackAction, setMenuStackAction] = useState("idle");
  const topChromeRef = useRef(null);
  const tabScrollRef = useRef({});
  const previousMenuStackRef = useRef([]);
  const stackCleanupTimerRef = useRef(null);
  const postingNoticeClearTimerRef = useRef(null);
  const exploreNav = useExploreNavigation(MENU_SCREENS);
  const navHidden = useScrollHidden();
  const authProfile = buildExploreProfileFromUser(user);
  const profile = profileOverride || authProfile;
  const currentUserId = profile?.userId || user?.id || "";
  const { activeTab, activeMenuScreen, menuStack } = exploreNav;
  const isSwipTab = activeTab === "Swip";
  const profileExists = !authLoading && Boolean(user?.id && profile);
  const showProfileSkeleton = false;
  const menuOverlayVisible = exploreNav.isFullScreen || visibleMenuStack.length > 0;

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
    onScreenModeChange?.(active && (menuOverlayVisible || isSwipTab || Boolean(activeMenuScreen)));

    stopAllExploreMedia();

    return () => {
      onScreenModeChange?.(false);
    };
  }, [active, menuOverlayVisible, activeMenuScreen, activeTab, isSwipTab, onScreenModeChange]);

  useEffect(() => {
    if (!active) {
      stopAllExploreMedia();
    }
  }, [active]);

  useEffect(() => {
    if (!menuOverlayVisible) return undefined;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [menuOverlayVisible]);

  useEffect(() => {
    const previousStack = previousMenuStackRef.current;
    const nextStack = menuStack;

    window.clearTimeout(stackCleanupTimerRef.current);

    if (nextStack.length > previousStack.length) {
      setMenuStackAction("push");
      setVisibleMenuStack(nextStack);
      stackCleanupTimerRef.current = window.setTimeout(() => {
        setMenuStackAction("idle");
      }, EXPLORE_STACK_ANIMATION_MS);
    } else if (nextStack.length < previousStack.length) {
      const closingScreens = previousStack.slice(nextStack.length);
      setMenuStackAction("pop");
      setVisibleMenuStack([...nextStack, ...closingScreens]);

      stackCleanupTimerRef.current = window.setTimeout(() => {
        setVisibleMenuStack(nextStack);
        setMenuStackAction("idle");
      }, EXPLORE_STACK_ANIMATION_MS);
    } else if (nextStack.join("|") !== previousStack.join("|")) {
      setMenuStackAction("push");
      setVisibleMenuStack(nextStack);
      stackCleanupTimerRef.current = window.setTimeout(() => {
        setMenuStackAction("idle");
      }, EXPLORE_STACK_ANIMATION_MS);
    } else {
      setMenuStackAction("idle");
      setVisibleMenuStack(nextStack);
    }

    previousMenuStackRef.current = nextStack;

    return () => window.clearTimeout(stackCleanupTimerRef.current);
  }, [menuStack]);

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
  return undefined;
}

    if (!user?.id) {
      setProfileOverride(null);
      setProfileLoading(false);
      setProfileFetched(true);
      return undefined;
    }

    let alive = true;
    if (!profileOverride) {
  setProfileLoading(true);
  setProfileFetched(false);
}

setProfileError("");

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
    function handleOpenTab(event) {
      const tab = event.detail?.tab;
      if (tab) {
        exploreNav.setActiveTab(tab);
      }
    }

    window.addEventListener("explore-open-tab", handleOpenTab);
    return () => window.removeEventListener("explore-open-tab", handleOpenTab);
  }, [exploreNav]);

  useEffect(() => {
    function scheduleNoticeClear(notice) {
      window.clearTimeout(postingNoticeClearTimerRef.current);
      const delay = getPostingNoticeClearDelay(notice);

      if (delay === null) {
        return;
      }

      postingNoticeClearTimerRef.current = window.setTimeout(() => {
        clearPostingNotice(notice?.id);
        setPostingNotice((current) => (current?.id === notice?.id ? null : current));
      }, delay);
    }

    const savedNotice = readPostingNotice();
    if (savedNotice) {
      setPostingNotice(savedNotice);
      scheduleNoticeClear(savedNotice);
    }

    function handlePostingUpdate(event) {
      const notice = writePostingNotice(event.detail || {});
      setPostingNotice(notice);
      scheduleNoticeClear(notice);
    }

    window.addEventListener(POSTING_NOTICE_EVENT, handlePostingUpdate);
    return () => {
      window.clearTimeout(postingNoticeClearTimerRef.current);
      window.removeEventListener(POSTING_NOTICE_EVENT, handlePostingUpdate);
    };
  }, []);

  useEffect(() => {
    if (!currentUserId) {
      clearPostingNotice();
      setPostingNotice(null);
      return;
    }

    resumePendingVideoReviewJobs(currentUserId);
  }, [currentUserId]);

  function dismissPostingNotice() {
    clearPostingNotice(postingNotice?.id);
    setPostingNotice(null);
  }

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
    if (!MENU_SCREENS[screen]) {
      return;
    }

    if (menuStack.at(-1) === screen) {
      return;
    }

    window.clearTimeout(stackCleanupTimerRef.current);
    setMenuStackAction("push");
    if (screen === "Messages") {
      setMessageRecipient(null);
    }
    exploreNav.openMenuScreen(screen, options);
  }

  function switchExploreTab(tab) {
    if (tab === activeTab) {
      return;
    }

    const currentIndex = EXPLORE_TAB_ORDER.indexOf(activeTab);
    const nextIndex = EXPLORE_TAB_ORDER.indexOf(tab);
    setTabSlideDirection(nextIndex >= currentIndex ? "forward" : "backward");
    tabScrollRef.current[activeTab] = window.scrollY || 0;
    exploreNav.setActiveTab(tab);
    const nextScroll = tabScrollRef.current[tab] || 0;
    requestAnimationFrame(() => {
      requestAnimationFrame(() => window.scrollTo({ top: nextScroll, behavior: "instant" }));
    });
  }

  function renderMenuScreen(screenKey) {
    if (!screenKey) {
      return null;
    }

    if (screenKey === "Menu") {
      return (
        <div className="min-h-[calc(100vh-72px)] bg-slate-100">
          <aside className="flex min-h-[calc(100vh-72px)] w-full flex-col bg-white shadow-sm">
            <SocialMenuContent onNavigate={openMenuScreen} />
          </aside>
        </div>
      );
    }

    if (screenKey === "Profile") {
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
          onEditProfile={() => openMenuScreen("EditProfile")}
          onOpenNotification={openNotificationTarget}
          onProfileUpdate={setProfileOverride}
          onStartChat={startChat}
        />
      );
    }

    if (screenKey === "EditProfile") {
      return (
        <ProfileEditScreen
          authProfile={authProfile}
          currentUserId={currentUserId}
          onProfileUpdate={setProfileOverride}
          profile={profile}
        />
      );
    }

    if (screenKey === "ViewedProfile") {
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

    if (screenKey === "MyPosts") {
      return <MyPostsScreen currentUserId={currentUserId} hideHeader />;
    }

    if (screenKey === "SavedPosts") {
      return <SavedPostsScreen currentUserId={currentUserId} hideHeader />;
    }

    if (screenKey === "Activity") {
      return <ActivityScreen hideHeader onOpenNotification={openNotificationTarget} />;
    }

    if (screenKey === "Notifications") {
      return <Notifications currentUserId={currentUserId} onOpenNotification={openNotificationTarget} />;
    }

    if (screenKey === "Messages") {
      return (
        <MessagesScreen keepAlive
          currentProfile={profile}
          hideHeader
          initialRecipient={messageRecipient}
          onConversationActiveChange={setMessageConversationActive}
          onViewProfile={openViewedProfile}
        />
      );
    }

    if (screenKey === "Connections") {
      return <Connections currentUserId={currentUserId} onViewProfile={openViewedProfile} />;
    }

    if (screenKey === "Privacy") {
      return <PrivacyScreen hideHeader />;
    }

    if (screenKey === "Settings") {
      return <SettingsScreen hideHeader />;
    }

    if (screenKey === "HelpCenter") {
      return <HelpCenterScreen hideHeader />;
    }

    if (screenKey === "TermsPolicies") {
      return <TermsPoliciesScreen hideHeader />;
    }

    return <PlaceholderMenuScreen screen={MENU_SCREENS[screenKey]} />;
  }

  function renderMenuStack() {
    const previousStack = previousMenuStackRef.current;
    const stackToRender =
      menuStack.length > visibleMenuStack.length ||
      (menuStack.length > 0 && menuStack.length >= visibleMenuStack.length && menuStack.join("|") !== visibleMenuStack.join("|"))
        ? menuStack
        : visibleMenuStack;
    const stackAction =
      menuStack.length > previousStack.length ||
      (menuStack.length > 0 && menuStack.length === previousStack.length && menuStack.join("|") !== previousStack.join("|"))
        ? "push"
        : menuStack.length < previousStack.length
          ? "pop"
          : menuStackAction;
    const activeIndex = menuStack.length - 1;

    return stackToRender.map((screenKey, index) => {
      const screen = MENU_SCREENS[screenKey];
      if (!screen) return null;

      const active = index === activeIndex;
      const exiting = index >= menuStack.length;
      const pushedBehind = index < activeIndex;
      const hideScreenHeader = screenKey === "Messages" && messageConversationActive && active;
      const enteringOnPush = active && stackAction === "push";
      const usesLeftSideMotion = LEFT_SIDE_MENU_SCREENS.has(screenKey);
      const motionClass = exiting
        ? usesLeftSideMotion
          ? "kt-explore-stack-leave-left"
          : "kt-explore-stack-leave-right"
        : enteringOnPush
          ? usesLeftSideMotion
            ? "kt-explore-stack-enter-left"
            : "kt-explore-stack-enter"
          : "";
      const placementClass = motionClass
        ? ""
        : pushedBehind
          ? "translate-x-0 opacity-100"
          : active
            ? "translate-x-0 opacity-100"
            : "translate-x-full opacity-100";

      return (
        <section
          key={`${screenKey}-${index}`}
          aria-hidden={!active || exiting}
          className={`kt-urmall-screen-panel absolute inset-0 flex h-full w-full transform flex-col bg-slate-100 shadow-2xl ${
            placementClass
          } ${motionClass} ${active && !exiting ? "pointer-events-auto" : "pointer-events-none"}`}
          style={{ zIndex: index + 1 }}
        >
          {hideScreenHeader ? null : (
            <SocialScreenHeader
              title={screen.title}
              subtitle={screen.subtitle}
              onBack={active || exiting ? (active ? goBackFullScreen : () => {}) : undefined}
            />
          )}
          <div className="min-h-0 flex-1 overflow-y-auto">
            {renderMenuScreen(screenKey)}
          </div>
        </section>
      );
    });
  }

  return (
    <>
    <div
      className={`block min-h-screen w-full max-w-full touch-pan-y overscroll-x-none overflow-x-clip bg-slate-100 ${isSwipTab ? "" : "kuntai-safe-bottom"}`}
      style={{ "--explore-top-chrome-height": `${topChromeHeight}px` }}
    >
      <PostingStatusBanner notice={postingNotice} onDismiss={dismissPostingNotice} />

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
              onAlertsClick={() => openMenuScreen("Notifications")}
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
          slideDirection={tabSlideDirection}
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
    {activeTab === "UrFeed" && (
      <UrFeed
        profile={profile}
        onViewProfile={openViewedProfile}
      />
    )}

    {activeTab === "Swip" && (
      <Swip
        active
        currentUserId={profile.userId}
        onViewProfile={openViewedProfile}
      />
    )}

    {activeTab === "Connections" && (
      <Connections
        currentUserId={profile.userId}
        onViewProfile={openViewedProfile}
      />
    )}
  </>
) : null}
      </div>

    </div>
    {menuOverlayVisible ? (
      <div
        ref={fullScreenSwipeRef}
        className="fixed inset-0 z-[80] h-screen min-h-screen w-full max-w-full touch-pan-y overscroll-x-none overflow-hidden bg-transparent kuntai-safe-bottom"
      >
        {renderMenuStack()}
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
