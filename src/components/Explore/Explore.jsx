// src/Explore/Explore.jsx
import { memo, useCallback, useDeferredValue, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
//import { useAuth } from "../../Backend/hooks/useAuth";
import { useBackSwipe } from "../../Backend/hooks/useBackSwipe";
import { useBrowserBack } from "../../Backend/hooks/useBrowserBack";
import { canStartNavigationGesture, navigationGesturesLocked } from "../../Backend/services/gestureArbitration";
import { useExploreNavigation } from "../../Backend/hooks/useExploreNavigation";
import { useScrollHidden } from "../../Backend/hooks/useScrollHidden";
import {
  buildExploreProfileFromUser,
  ensureExploreProfile,
  fetchExplorePostById,
  fetchExploreProfile,
  fetchExploreSpace,
  fetchMyExploreSpaces,
  readActiveExploreIdentity,
  readCachedExploreSpaces,
  writeCachedExploreSpaces,
  writeActiveExploreIdentity,
} from "../../Backend/services/exploreService";
import { fetchSpaceCreditWallet, setActiveSpaceInviteCode } from "../../Backend/services/visibilityCreditService";
import { guardGuestAction } from "../../Backend/services/guestModeService";
import { consumePendingExploreScreen, OPEN_EXPLORE_SCREEN_EVENT } from "../../Backend/services/notificationBannerService";
import { mapSurfacePlatformNotification, markSurfacePlatformNotificationRead } from "../../Backend/services/surfaceNotificationService";
import { openUnifiedNotification } from "../../Backend/services/unifiedNotificationService";
import { shareKunThaiLink } from "../../Backend/services/shareCtaService";
import {
  cancelPostingNotice,
  clearPostingNotice,
  getPostingNoticeClearDelay,
  POSTING_NOTICE_EVENT,
  readPostingNotice,
  writePostingNotice,
} from "../../Backend/services/explore/postingProgressService";
import { getIdentityKey } from "../../Backend/services/explore/identityService";
import { cancelPendingVideoReviewJob, resumePendingVideoReviewJobs } from "../../Backend/services/explore/videoReviewService";
import { EXPLORE_SETTINGS_EVENT, readExploreSettings } from "../../Backend/services/explore/preferencesService";
import { getExplorePostTargetTab } from "../../Backend/services/explore/notificationTargetService";
import { showToast } from "../../Backend/services/toastService";
import { useI18n } from "../../i18n";

// Pages (PARENT TAB CONTENT)
import UrFeed from "./ExploreTabs/urfeed/UrFeed";
import Swip from "./ExploreTabs/swip/Swip";
import Connections from "./ExploreTabs/connections/Connections"

import Notifications from "./ExploreTabs/notification/Notifications";
import ActivityScreen from "./SocialMenu/activity/ActivityScreen";
import AboutKunThaiScreen from "./SocialMenu/about/AboutKunThaiScreen";
import FutureFeaturesScreen from "./SocialMenu/future/FutureFeaturesScreen";
import HelpCenterScreen from "./SocialMenu/help/HelpCenterScreen";
import MessagesScreen from "./SocialMenu/messages/MessagesScreen";
import MyPostsScreen from "./SocialMenu/myPosts/MyPostsScreen";
import PrivacyScreen from "./SocialMenu/privacy/PrivacyScreen";
import PermissionsScreen from "./SocialMenu/permissions/PermissionsScreen";
import ProfileEditScreen from "./SocialMenu/profile/ProfileEditScreen";
import ProfileScreen from "./SocialMenu/profile/ProfileScreen";
import SpaceCreateScreen from "./SocialMenu/spaces/SpaceCreateScreen";
import SpaceDashboardScreen from "./SocialMenu/spaces/SpaceDashboardScreen";
import SavedPostsScreen from "./SocialMenu/savedPosts/SavedPostsScreen";
import SettingsScreen from "./SocialMenu/settings/SettingsScreen";
import InterestsScreen from "./SocialMenu/settings/InterestsScreen";
import DataMobileUseScreen from "./SocialMenu/settings/DataMobileUseScreen";
import SecurityScreen from "./SocialMenu/security/SecurityScreen";
import SafetyCenterScreen from "./SocialMenu/safety/SafetyCenterScreen";
import SocialScreenHeader from "./SocialMenu/shared/SocialScreenHeader";
import TermsPoliciesScreen from "./SocialMenu/terms/TermsPoliciesScreen";
import SwitchAccountScreen from "./SocialMenu/account/SwitchAccountScreen";
import YourVoiceScreen from "./SocialMenu/userCare/YourVoiceScreen";
import JoinKunThaiScreen from "./SocialMenu/join/JoinKunThaiScreen";
import { MENU_SCREENS } from "./config/menuScreens";
import useBodyScrollLock from "../shared/useBodyScrollLock";

// UI Components
import ExploreHeader from "./components/header/ExploreHeader";
import { SocialMenuContent } from "./components/header/HeaderMenu";
import { useSpaceActivity } from "../../Backend/hooks/useSpaceActivity";
import { EXPLORE_OPEN_SPACE_INBOX_EVENT } from "../../Backend/services/explore/messageService";
import ExploreTabs from "./ExploreTabs/ExploreTabs";
import PostingStatusBanner from "./shared/PostingStatusBanner";
import PostOutboxIndicator from "./shared/PostOutboxIndicator";
import { stopAllExploreMedia } from "./shared/singleMediaPlayback";
import { uiText as translateUi, useI18n as useUiLocale } from "../../i18n/index.js";
import { inlineErrorMessage, isConnectionFailure } from "../../Backend/services/friendlyErrorService";
import { announceConnectionTrouble } from "../../Backend/services/networkService";
import { NAV_TRANSITION_MS } from "../shared/navigationMotion";
import { settleReplayedAnimations } from "../shared/settleReplayedAnimations";
import { haptics } from "../../Backend/services/feedbackService";

import { useLifecycleAudit } from "../../Backend/services/lifecycleAudit";
// The three tabs only re-render when their own props change. Opening a menu
// screen (Messages, a profile) re-renders Explore several times during the
// slide, and re-rendering the whole feed each time stalled it for ~80 ms per
// render on mid-range Android phones: the screen came in late and stuttered.
const MemoUrFeed = memo(UrFeed);
const MemoSwip = memo(Swip);
const MemoConnections = memo(Connections);

// The same object while its content is the same, so memoized children keep
// skipping work when a profile is rebuilt with identical fields.
function useSameContent(value) {
  const [stable, setStable] = useState(() => ({ key: JSON.stringify(value ?? null), value }));
  const key = JSON.stringify(value ?? null);
  if (stable.key !== key) {
    const next = { key, value };
    setStable(next);
    return value;
  }
  return stable.value;
}

const EXPLORE_TAB_ORDER = ["UrFeed", "Swip", "Connections"];
const EXPLORE_STACK_ANIMATION_MS = NAV_TRANSITION_MS;
// Interactive swipe tuning: panels track the finger once the gesture is
// clearly horizontal, then commit past the distance or velocity threshold.
const TAB_DRAG_ENGAGE_PX = 14;
const TAB_DRAG_AXIS_RATIO = 1.35;
const TAB_DRAG_COMMIT_RATIO = 0.3;
const TAB_DRAG_COMMIT_VELOCITY = 0.45; // px per millisecond
const TAB_DRAG_SETTLE_MS = 190;
// A tab tapped in the bar slides the same way a finger swipe settles.
const TAB_TAP_SLIDE_MS = 320;
const LEFT_SIDE_MENU_SCREENS = new Set(["Menu", "Messages"]);
const COMMENT_TARGET_NOTIFICATION_TYPES = new Set(["comment", "reply", "creator_reply", "thread_reply", "mention"]);

/*
  Explore.jsx
  -----------
  Root container for the Explore section.

  Responsibilities:
  - Renders the header
  - Controls parent tab state
  - Decides which page to show
*/

export default function Explore({ active = true, onNavigateMain, onScreenModeChange, user = null, authLoading = false }) {
  useLifecycleAudit("screen", "Explore");
  const [profileOverride, setProfileOverride] = useState(null);
  const [spaceProfiles, setSpaceProfiles] = useState([]);
  const [activeIdentity, setActiveIdentity] = useState(() => readActiveExploreIdentity());
  const [profileLoading, setProfileLoading] = useState(true);
  const [profileError, setProfileError] = useState("");
  const [profileFetched, setProfileFetched] = useState(false);
  const [viewedProfile, setViewedProfile] = useState(null);
  const loadedAccountIdRef = useRef("");
  const [messageRecipient, setMessageRecipient] = useState(null);
  const [messageRecipientOwnerId, setMessageRecipientOwnerId] = useState("");
  const [messageConversationActive, setMessageConversationActive] = useState(false);
  const [yourVoiceDraft, setYourVoiceDraft] = useState(null);
  const [postingNotice, setPostingNotice] = useState(() => readPostingNotice());
  // Header + tabs height, and the tabs row alone (all Swip keeps on screen).
  const [topChrome, setTopChrome] = useState({ full: 0, tabs: 0 });
  const [tabSlideDirection, setTabSlideDirection] = useState("forward");
  // The tab being slid out while the next one slides in ({ tab, direction, top }).
  const [leavingTab, setLeavingTab] = useState(null);
  const leavingTabTimerRef = useRef(null);
  const [swipPreviewTarget, setSwipPreviewTarget] = useState("");
  const [postFocusRequest, setPostFocusRequest] = useState(null);
  const [leftDrawerOpen, setLeftDrawerOpen] = useState(false);
  const [drawerDragging, setDrawerDragging] = useState(false);
  const [drawerMountedByDrag, setDrawerMountedByDrag] = useState(false);
  const [drawerClosing, setDrawerClosing] = useState(false);
  const [composerOpen, setComposerOpen] = useState(false);
  // Tracks the composer being open regardless of its "blocking" flag; used only
  // to lock the horizontal tab swipe so a drag in the composer cannot flip
  // UrFeed<->Swip behind it.
  const [composerVisible, setComposerVisible] = useState(false);
  const [headerOverlayOpen, setHeaderOverlayOpen] = useState(false);
  const [visibleMenuStack, setVisibleMenuStack] = useState([]);
  const [menuStackAction, setMenuStackAction] = useState("idle");
  const topChromeRef = useRef(null);
  const exploreTabsRef = useRef(null);
  const scrollRestoreTabRef = useRef("");
  // During a tab slide both tabs are phone-sized windows (kt-main-window),
  // and this spacer keeps the page as tall as the incoming tab.
  const tabSpacerRef = useRef(null);
  const tabWindowRef = useRef("");
  const tabWindowScrollRef = useRef(0);
  const leavingTabRef = useRef(null);
  const tabScrollRef = useRef({});
  const exploreGestureRef = useRef(null);
  const tabPanelRefs = useRef({});
  const drawerAsideRef = useRef(null);
  const drawerBackdropRef = useRef(null);
  const dragSettleTimerRef = useRef(null);
  // Finger-drag styles kept on until the drag's result is on screen: a tab
  // switch clears them in its own commit; a swipe out to UrMall once Explore
  // has slid away (or as it comes back). Clearing them first put the old tab
  // back in the middle for a frame before the switch.
  const tabDragCleanupPendingRef = useRef(false);
  const exitDragCleanupPendingRef = useRef(false);
  const exitDragCleanupTimerRef = useRef(null);
  const clearTabDragStylesRef = useRef(null);
  // A tapped tab's slide in progress ({ tab, frame, timer }), and the tab the
  // bar highlights meanwhile (the switch itself lands when the slide ends).
  const tabSlideRef = useRef(null);
  const commitExploreTabRef = useRef(null);
  const [tabHighlight, setTabHighlight] = useState("");
  const previousMenuStackRef = useRef([]);
  const stackCleanupTimerRef = useRef(null);
  const postingNoticeClearTimerRef = useRef(null);
  const switchExploreTabRef = useRef(null);
  const openPostTargetRef = useRef(null);
  const postFocusRequestKeyRef = useRef("");
  const authenticatedUserRef = useRef(user);
  authenticatedUserRef.current = user;
  const exploreNav = useExploreNavigation(MENU_SCREENS);
  const { t } = useI18n();
  const { activeTab, activeMenuScreen, menuStack } = exploreNav;
  switchExploreTabRef.current = switchExploreTab;
  commitExploreTabRef.current = commitExploreTab;
  leavingTabRef.current = leavingTab;
  clearTabDragStylesRef.current = clearTabDragStyles;
  const switchIdentityRef = useRef(null);
  switchIdentityRef.current = switchExploreIdentity;
  openPostTargetRef.current = openExplorePostTarget;
  const isSwipTab = activeTab === "Swip";
  const menuOverlayVisible = exploreNav.isFullScreen || visibleMenuStack.length > 0;
  // The person is looking at Explore's tabs (not another main screen, a menu
  // screen, the Social drawer or a header sheet): a video they just posted
  // may open there by itself.
  const exploreTabsOnScreenRef = useRef(false);
  exploreTabsOnScreenRef.current = active && !menuOverlayVisible && !leftDrawerOpen && !headerOverlayOpen;
  // The feed learns a menu screen covers it in a later, interruptible render,
  // so the screen's slide starts on the very next frame after the tap.
  const feedCovered = useDeferredValue(menuOverlayVisible);
  const anyExploreOverlayVisible = menuOverlayVisible || leftDrawerOpen || composerOpen || headerOverlayOpen;
  // The half-width Social drawer must not change the feed header's hidden state.
  // Its backdrop already blocks scrolling, so preserving the current header
  // position keeps the UrFeed dashboard visually frozen throughout the swipe.
  const headerMotionBlocked = menuOverlayVisible || composerOpen || headerOverlayOpen;
  // Keep the Social drawer out of the shared body lock: locking sets the root to
  // overflow:hidden, which collapses the window-scrolled feed to the top on iOS
  // (jump on open, snap-back on close). Excluding it leaves the feed exactly
  // where it is and fully visible behind the drawer.
  const scrollLockActive = menuOverlayVisible || composerOpen || headerOverlayOpen;
  // Swip does not scroll the page, so its header state is fixed (slid away);
  // scroll-hiding only runs on the scrolling tabs.
  const navHidden = useScrollHidden({
    enabled: active && !headerMotionBlocked && !isSwipTab,
    resetKey: activeTab,
    threshold: 72,
    hideDistance: 72,
    showDistance: 52,
    minScrollY: 96,
    cooldownMs: 280,
  });
  const chromeHidden = navHidden && !isSwipTab;
  // How far the bar slides up on Swip: the header's height, less the safe area
  // the tabs row stops under (added in CSS, as it is not known here).
  const headerShift = Math.max(0, topChrome.full - topChrome.tabs);
  const authProfile = useSameContent(buildExploreProfileFromUser(user));
  const profileOverrideMatchesUser = Boolean(user?.id && profileOverride?.userId === user.id);
  const personalProfile = profileOverrideMatchesUser ? profileOverride : authProfile;
  const activeSpaceProfile = activeIdentity?.type === "space"
    ? spaceProfiles.find((space) => space.spaceId === activeIdentity.id)
    : null;
  const profile = activeSpaceProfile || personalProfile;
  const currentUserId = user?.id || personalProfile?.userId || "";
  const profileExists = !authLoading && Boolean(user?.id && profile);

  // Acting as a Space on Explore: share links carry the Space's invite code,
  // so a friend who joins through them earns the Space its credits. Leaving
  // Explore or switching back restores the personal code immediately.
  const activeSpaceId = active && activeIdentity?.type === "space" ? activeIdentity.id : "";
  // Likes, comments, shares and inbox messages on the person's Spaces, for the
  // badge next to each Space while they are on their personal profile.
  const spaceActivity = useSpaceActivity(spaceProfiles.length ? currentUserId : "", activeSpaceProfile?.spaceId || "");
  const otherSpacesActivityTotal = spaceProfiles.reduce((total, space) => (
    space.spaceId === activeSpaceProfile?.spaceId ? total : total + Number(spaceActivity[space.spaceId]?.total || 0)
  ), 0);
  useEffect(() => {
    if (!activeSpaceId) {
      setActiveSpaceInviteCode("");
      return undefined;
    }
    let alive = true;
    fetchSpaceCreditWallet(activeSpaceId)
      .then((wallet) => {
        if (alive) setActiveSpaceInviteCode(wallet?.inviteCode || "");
      })
      .catch(() => {
        if (alive) setActiveSpaceInviteCode("");
      });
    return () => {
      alive = false;
      setActiveSpaceInviteCode("");
    };
  }, [activeSpaceId]);

  // A message notification for a Space thread: switch to that Space and open
  // its inbox, where the pending conversation is then opened.
  useEffect(() => {
    function openSpaceInbox(event) {
      const space = spaceProfiles.find((item) => item.spaceId === event.detail?.spaceId);
      if (space && space.membershipStatus !== "pending") switchIdentityRef.current?.(space, { openMessages: true });
    }
    window.addEventListener(EXPLORE_OPEN_SPACE_INBOX_EVENT, openSpaceInbox);
    return () => window.removeEventListener(EXPLORE_OPEN_SPACE_INBOX_EVENT, openSpaceInbox);
  }, [spaceProfiles]);

  // Keep the device copy of "my Spaces" in step with creates, edits and
  // removals, so the next reload paints the right Space immediately.
  useEffect(() => {
    if (profileFetched && user?.id) writeCachedExploreSpaces(user.id, spaceProfiles);
  }, [profileFetched, spaceProfiles, user?.id]);

  const goBackFullScreen = useBrowserBack(exploreNav.isFullScreen, exploreNav.goBackMenuScreen, `explore-${activeMenuScreen || "screen"}`);
  useBrowserBack(Boolean(swipPreviewTarget && activeTab === "Swip"), returnFromRepostedSwip, "explore-reposted-swip");
  // The full-screen menu overlay carries data-local-back-swipe, so EVERY
  // full-screen back-swipe is routed through this one node handler (the
  // conversation's own AppBackTab swipe is suppressed there). Branch on context:
  // inside an open message conversation, pop the conversation's own history
  // layer so the swipe returns to the conversation LIST; otherwise fall back to
  // the normal menu-back which returns to the Explore dashboard.
  const handleFullScreenBackSwipe = () => {
    if (messageConversationActive) {
      window.history.back();
      return;
    }
    exploreNav.goBackMenuScreen();
  };
  const fullScreenSwipeRef = useBackSwipe(exploreNav.isFullScreen, handleFullScreenBackSwipe, {
    edgeWidth: Math.min(280, Math.max(160, Math.round(window.innerWidth * 0.45))),
    minDistance: 58,
    minFlingDistance: 58,
    maxVerticalDrift: 92,
  });

  useEffect(() => {
    function handleComposerVisibility(event) {
      setComposerOpen(Boolean(event.detail?.open && event.detail?.blocking !== false));
      setComposerVisible(Boolean(event.detail?.open));
    }

    window.addEventListener("kuntai-explore-composer-visibility", handleComposerVisibility);
    return () => window.removeEventListener("kuntai-explore-composer-visibility", handleComposerVisibility);
  }, []);

  useEffect(() => {
    function openRepostedSwip(event) {
      const postId = String(event.detail?.postId || "");
      if (!postId) return;
      setSwipPreviewTarget(postId);
      switchExploreTabRef.current?.("Swip");
    }

    window.addEventListener("explore-open-reposted-swip", openRepostedSwip);
    return () => window.removeEventListener("explore-open-reposted-swip", openRepostedSwip);
  }, []);

  // Changing the "Default Explore tab" in Settings should visibly respond:
  // switch the underlying Explore tab right away so closing Settings lands on
  // the newly chosen tab.
  useEffect(() => {
    let lastDefaultTab = readExploreSettings().feed.defaultTab;

    function handleSettingsChange(event) {
      const nextDefaultTab = event.detail?.feed?.defaultTab;
      if (!nextDefaultTab || nextDefaultTab === lastDefaultTab) return;
      lastDefaultTab = nextDefaultTab;
      switchExploreTabRef.current?.(nextDefaultTab);
    }

    window.addEventListener(EXPLORE_SETTINGS_EVENT, handleSettingsChange);
    return () => window.removeEventListener(EXPLORE_SETTINGS_EVENT, handleSettingsChange);
  }, []);

  useEffect(() => {
    // Leaving Explore for the area view (e.g. a post's tagged location)
    // unmounts this whole screen, so the feed offset is remembered on the way
    // out and restored when Explore mounts again on return.
    const rememberFeedPositionForAreaView = () => {
      sessionStorage.setItem("exploreFeedScrollY", String(window.scrollY || 0));
    };

    window.addEventListener("kuntai-open-area-view", rememberFeedPositionForAreaView);
    return () => window.removeEventListener("kuntai-open-area-view", rememberFeedPositionForAreaView);
  }, []);

  useEffect(() => {
    const savedScroll = Number(sessionStorage.getItem("exploreFeedScrollY") || 0);
    if (!savedScroll) return undefined;

    // Seed the per-tab scroll memory so switching back to UrFeed later also
    // lands on the remembered content, not the top of the feed.
    if (!tabScrollRef.current.UrFeed) tabScrollRef.current.UrFeed = savedScroll;
    if (activeTab !== "UrFeed") return undefined;

    // Feed posts render from the session cache on remount, so the saved
    // offset points at real content by the time these restores run.
    const frame = requestAnimationFrame(() => {
      requestAnimationFrame(() => window.scrollTo({ top: savedScroll, behavior: "instant" }));
    });
    const retry = window.setTimeout(() => {
      window.scrollTo({ top: savedScroll, behavior: "instant" });
    }, 420);
    return () => {
      cancelAnimationFrame(frame);
      window.clearTimeout(retry);
    };
    // Mount-only: restores the feed position saved before Explore unmounted.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The header stays mounted on every tab (Swip slides it away), so these
  // heights do not change with the tab and nothing reflows on a switch.
  useLayoutEffect(() => {
    const node = topChromeRef.current;
    const tabsNode = exploreTabsRef.current;
    if (!node || !tabsNode) {
      return undefined;
    }

    function measure() {
      const full = Math.ceil(node.offsetHeight || 0);
      const tabs = Math.ceil(tabsNode.offsetHeight || 0);
      setTopChrome((current) => (current.full === full && current.tabs === tabs ? current : { full, tabs }));
    }

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    observer.observe(tabsNode);
    window.addEventListener("resize", measure);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, []);

  // Each tab keeps its own scroll, restored before the switch paints (like the
  // main screens in App.jsx): the leaving tab is pinned in place and the next
  // one is drawn at its final offset, so neither moves when the slide starts.
  useLayoutEffect(() => {
    const previousTab = scrollRestoreTabRef.current;
    scrollRestoreTabRef.current = activeTab;
    if (!previousTab || previousTab === activeTab) return;
    // A finger-dragged switch: the panels sit where the drag left them until
    // now, in the same frame as the new tab becomes the active one.
    if (tabDragCleanupPendingRef.current) {
      tabDragCleanupPendingRef.current = false;
      clearTabDragStyles();
    }
    // Panels stay mounted (hidden with display:none), so showing one again
    // would replay its cards' entrance animations.
    const entering = tabPanelRefs.current[activeTab];
    settleReplayedAnimations(entering);
    const nextScroll = tabScrollRef.current[activeTab] || 0;
    const sliding = leavingTabRef.current;
    if (!sliding || sliding.phase !== "pending" || !entering) {
      window.scrollTo({ top: nextScroll, behavior: "instant" });
      return;
    }
    // An animated switch slides two phone-sized windows, each scrolled to
    // where its tab was, never a whole tab: UrFeed is ~13,000px tall, and iOS
    // only paints the part of a layer that tall that is on screen, so it slid
    // in blank and filled in (it looked like a reload; Android paints it all).
    const leaving = tabPanelRefs.current[sliding.tab];
    if (leaving) leaving.scrollTop = sliding.scroll;
    const spacer = tabSpacerRef.current;
    const wrapper = entering.parentElement;
    if (spacer) spacer.style.height = `${entering.scrollHeight}px`;
    const wrapperStyle = wrapper ? getComputedStyle(wrapper) : null;
    const contentTop = wrapper
      ? wrapper.getBoundingClientRect().top + (window.scrollY || 0) + (parseFloat(wrapperStyle.paddingTop) || 0)
      : 0;
    window.scrollTo({ top: nextScroll, behavior: "instant" });
    const scrolled = window.scrollY || 0;
    const top = Math.max(0, Math.round(contentTop - scrolled));
    entering.style.top = `${top}px`;
    entering.style.height = `calc(100dvh - ${top}px)`;
    entering.scrollTop = Math.max(0, scrolled - contentTop);
    tabWindowRef.current = activeTab;
  }, [activeTab]);

  // The slide is over: the incoming tab goes back into the page at exactly the
  // offset its window shows, and the spacer goes.
  useLayoutEffect(() => {
    if (leavingTab || !tabWindowRef.current) return;
    const tab = tabWindowRef.current;
    tabWindowRef.current = "";
    const node = tabPanelRefs.current[tab];
    const spacer = tabSpacerRef.current;
    if (!node) {
      if (spacer) spacer.style.height = "";
      return;
    }
    const windowTop = parseFloat(node.style.top) || 0;
    const windowScroll = tabWindowScrollRef.current;
    node.style.top = "";
    node.style.height = "";
    const contentTop = node.getBoundingClientRect().top + (window.scrollY || 0);
    if (spacer) spacer.style.height = "";
    if (tab !== activeTab) return;
    window.scrollTo({ top: Math.max(0, contentTop - windowTop + windowScroll), behavior: "instant" });
  }, [leavingTab, activeTab]);

  useEffect(() => {
    stopAllExploreMedia();
  }, [active, anyExploreOverlayVisible, activeMenuScreen, activeTab, isSwipTab]);

  // Swip is full screen (the bottom tabs slide away) and starts its video only
  // once its tab slide has finished: hiding the tabs re-renders the whole app
  // and starting a video is heavy, and doing either in the middle of the
  // slide froze it on iPhone. Leaving Swip stops the video at once; the tabs
  // come back after the slide. Overlays and menu screens still switch at once.
  // (Counted from the end of the slide, not from the tap: on a busy phone the
  // slide starts later, and a fixed delay then landed in the middle of it.)
  const [swipFullScreen, setSwipFullScreen] = useState(isSwipTab);
  useEffect(() => {
    if (swipFullScreen === isSwipTab) return;
    if (leavingTab && active) return;
    setSwipFullScreen(isSwipTab);
  }, [active, isSwipTab, leavingTab, swipFullScreen]);

  useEffect(() => {
    onScreenModeChange?.(active && (anyExploreOverlayVisible || swipFullScreen || Boolean(activeMenuScreen)));
    return () => {
      onScreenModeChange?.(false);
    };
  }, [active, anyExploreOverlayVisible, activeMenuScreen, swipFullScreen, onScreenModeChange]);

  useEffect(() => {
    if (!active) {
      stopAllExploreMedia();
      window.clearTimeout(dragSettleTimerRef.current);
      // Leaving Explore mid-slide: land on the chosen tab at once.
      const slide = tabSlideRef.current;
      if (slide) {
        tabSlideRef.current = null;
        window.cancelAnimationFrame(slide.frame);
        window.clearTimeout(slide.timer);
        clearTabDragStylesRef.current?.();
        setTabHighlight("");
        commitExploreTabRef.current?.(slide.tab, { animate: false });
      }
      setLeftDrawerOpen(false);
      setDrawerClosing(false);
      setDrawerMountedByDrag(false);
    }
  }, [active]);

  useEffect(() => {
    if (!leftDrawerOpen && !drawerDragging && drawerMountedByDrag) {
      setDrawerMountedByDrag(false);
    }
  }, [leftDrawerOpen, drawerDragging, drawerMountedByDrag]);

  useEffect(() => () => {
    window.clearTimeout(dragSettleTimerRef.current);
    window.clearTimeout(leavingTabTimerRef.current);
    window.clearTimeout(exitDragCleanupTimerRef.current);
  }, []);

  // Back on Explore before the swipe-out cleanup ran: drop the offset before
  // the first frame.
  useLayoutEffect(() => {
    if (!active || !exitDragCleanupPendingRef.current) return;
    exitDragCleanupPendingRef.current = false;
    window.clearTimeout(exitDragCleanupTimerRef.current);
    clearTabDragStylesRef.current?.();
  }, [active]);

  // Start the tab slide once the incoming tab has painted off to the side
  // (UrFeed is long; drawing it again took the whole slide before).
  useEffect(() => {
    if (leavingTab?.phase !== "pending") return undefined;
    let second = 0;
    const first = window.requestAnimationFrame(() => {
      second = window.requestAnimationFrame(() => {
        setLeavingTab((current) => (current && current.phase === "pending" ? { ...current, phase: "running" } : current));
        window.clearTimeout(leavingTabTimerRef.current);
        leavingTabTimerRef.current = window.setTimeout(() => {
          // Read the incoming window's offset while it is still a window.
          const entering = tabPanelRefs.current[tabWindowRef.current];
          tabWindowScrollRef.current = entering ? entering.scrollTop : 0;
          setLeavingTab(null);
        }, NAV_TRANSITION_MS + 40);
      });
    });
    return () => {
      window.cancelAnimationFrame(first);
      window.cancelAnimationFrame(second);
    };
    // Keyed on each switch, not on the phase: a tab chosen just after the
    // slide started (before React drew "running") arrives as "pending" again,
    // and a phase-keyed effect would not re-run, leaving it parked off-screen.
  }, [leavingTab]);

  useBodyScrollLock(scrollLockActive);

  // The Social drawer is intentionally NOT put through the shared body lock.
  // The feed scrolls the window, and the lock's `overflow:hidden` collapses that
  // scroll on iOS (feed jumped to the top on open and snapped back on close).
  // Leaving the window untouched keeps the feed exactly where it is and fully
  // visible behind the drawer; background scroll-through is blocked on the
  // overlay itself (touch-none backdrop + overscroll-contained menu) instead.

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
    const authenticatedUser = authenticatedUserRef.current;

    if (authLoading) {
  return undefined;
}

    if (!authenticatedUser?.id) {
      loadedAccountIdRef.current = "";
      setProfileOverride(null);
      setSpaceProfiles([]);
      setActiveIdentity({ type: "profile", id: "", key: "" });
      setProfileLoading(false);
      setProfileFetched(true);
      return undefined;
    }

    let alive = true;
    setProfileOverride((current) => (current?.userId === authenticatedUser.id ? current : null));
    // Paint the remembered Spaces straight away; the fetch below replaces them.
    setSpaceProfiles(readCachedExploreSpaces(authenticatedUser.id));
    // This effect also re-runs when auth settles or the language bundle
    // arrives. Only a real account change may drop what is on screen, or an
    // open Space/profile gets swapped for the viewer's own profile.
    if (loadedAccountIdRef.current !== authenticatedUser.id) {
      loadedAccountIdRef.current = authenticatedUser.id;
      setViewedProfile(null);
      setMessageRecipient(null);
      setMessageRecipientOwnerId("");
      setMessageConversationActive(false);
    }
    setProfileLoading(true);
    setProfileFetched(false);
    setProfileError("");

    Promise.all([
      ensureExploreProfile(authenticatedUser),
      fetchMyExploreSpaces().catch(() => []),
    ])
      .then(([profileData, spaces]) => {
        if (alive) {
          setProfileOverride(profileData);
          setSpaceProfiles(spaces || []);
          writeCachedExploreSpaces(authenticatedUser.id, spaces || []);
          const savedIdentity = readActiveExploreIdentity();
          if (savedIdentity.type === "space" && !(spaces || []).some((space) => space.spaceId === savedIdentity.id && space.membershipStatus !== "pending")) {
            writeActiveExploreIdentity({ type: "profile" });
            setActiveIdentity({ type: "profile", id: "", key: "" });
          } else {
            setActiveIdentity(savedIdentity);
          }
          setProfileFetched(true);
        }
      })
      .catch((error) => {
        if (alive) {
          setProfileError(inlineErrorMessage(error, t("explore.unableLoadProfile")));
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
  }, [authLoading, t, user?.id]);

  useEffect(() => {
    function handleOpenTab(event) {
      const tab = event.detail?.tab;
      if (tab) {
        if (event.detail) event.detail.handled = true;
        // Just posted: open it only if they are still on Explore (the
        // composer reads `opened`); elsewhere the finished card offers Watch.
        if (event.detail?.source === "post-published") {
          if (!event.detail.postId || !exploreTabsOnScreenRef.current) return;
          event.detail.opened = true;
          openPostTargetRef.current?.(event.detail.postId, { tabHint: tab, closeMenus: false, post: event.detail.post });
          return;
        }
        if (event.detail?.postId) {
          openPostTargetRef.current?.(event.detail.postId, { tabHint: tab, closeMenus: false });
          return;
        }
        if (tab !== "Swip") {
          setSwipPreviewTarget("");
        }
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

  // Notification banners can request a specific Explore screen (Messages,
  // Notifications) even while another main page is showing. The ref keeps the
  // listener stable while openMenuScreen closes over fresh state.
  const openMenuScreenRef = useRef(null);
  openMenuScreenRef.current = openMenuScreen;
  const openViewedProfileRef = useRef(null);
  openViewedProfileRef.current = openViewedProfile;
  const viewProfileFromTab = useCallback((authorProfile) => openViewedProfileRef.current?.(authorProfile), []);
  const returnFromRepostedSwipRef = useRef(null);
  returnFromRepostedSwipRef.current = returnFromRepostedSwip;
  const returnToRepostFromSwip = useCallback(() => returnFromRepostedSwipRef.current?.(), []);
  useEffect(() => {
    function handleOpenScreenRequest(event) {
      const detail = event?.detail || {};
      const screen = consumePendingExploreScreen() || detail.screen;
      if (screen) openMenuScreenRef.current?.(screen, detail.options || {});
    }

    function handleOpenProfileRequest(event) {
      const detail = event?.detail || {};
      if (detail.spaceId) {
        // A shared Space link: the Space's details load in openViewedProfile.
        if (event.detail) event.detail.handled = true;
        openViewedProfileRef.current?.({ spaceId: detail.spaceId, identityType: "space", identityId: detail.spaceId });
        return;
      }
      if (!detail.userId) return;
      if (event.detail) event.detail.handled = true;
      openViewedProfileRef.current?.({
        userId: detail.userId,
        displayName: detail.displayName || "",
        username: detail.username || "",
        avatarUrl: detail.avatarUrl || "",
        accountType: "personal",
      });
    }

    const pendingScreen = consumePendingExploreScreen();
    if (pendingScreen) openMenuScreenRef.current?.(pendingScreen);

    window.addEventListener(OPEN_EXPLORE_SCREEN_EVENT, handleOpenScreenRequest);
    window.addEventListener("kuntai-open-profile", handleOpenProfileRequest);
    return () => {
      window.removeEventListener(OPEN_EXPLORE_SCREEN_EVENT, handleOpenScreenRequest);
      window.removeEventListener("kuntai-open-profile", handleOpenProfileRequest);
    };
  }, []);

  // Watch on a finished post's card: bring Explore up on that video.
  function watchPostedVideo(notice) {
    if (!notice?.postId) return;
    cancelPostingNotice(notice.id);
    setPostingNotice(null);
    const wasOnExplore = active;
    if (!wasOnExplore) onNavigateMain?.("explore");
    setLeftDrawerOpen(false);
    // Off screen, the tab changes without a slide; Explore then slides in on it.
    openExplorePostTarget(notice.postId, { tabHint: notice.tab || "Swip", animateTab: wasOnExplore });
  }

  function dismissPostingNotice() {
    const noticeId = postingNotice?.id;
    const shouldCancelReview = postingNotice?.status === "reviewing" || String(noticeId || "").startsWith("video-review:");

    cancelPostingNotice(noticeId);
    setPostingNotice(null);

    if (shouldCancelReview) {
      cancelPendingVideoReviewJob(noticeId).catch((error) => {
        if (import.meta.env.DEV) {
          console.warn("[KunThai Video Review] cancel failed", error);
        }
      });
    }
  }

  function switchExploreIdentity(nextIdentity, options = {}) {
    if (nextIdentity?.spaceId) {
      if (nextIdentity.membershipStatus === "pending") {
        return;
      }
      const identity = { type: "space", id: nextIdentity.spaceId, key: `space:${nextIdentity.spaceId}` };
      setActiveIdentity(identity);
      writeActiveExploreIdentity(identity);
      setProfileOverride((current) => current);
      if (options.openDashboard) {
        exploreNav.openMenuScreen("SpaceDashboard");
        return;
      }
      // The Space's own team pressing "Message" on it goes to its inbox.
      if (options.openMessages) {
        openMenuScreen("Messages");
        return;
      }
      // Switching to a Space from the account list lands on its profile; the
      // dashboard is one tap away in the profile's actions.
      if (options.openProfile) {
        // The wrapper skips the push when Profile is already on top (tapping a
        // Space from the Profile screen just re-renders it as that Space).
        openMenuScreen("Profile");
        return;
      }
      exploreNav.closeMenuScreens();
      window.dispatchEvent(new CustomEvent("explore-open-tab", { detail: { tab: "UrFeed" } }));
      return;
    }

    const identity = { type: "profile", id: "", key: "" };
    setActiveIdentity(identity);
    writeActiveExploreIdentity(identity);
    if (options.openProfile) {
      // Wrapper: no duplicate push when "Switch back" is pressed on Profile.
      openMenuScreen("Profile");
    }
  }

  function handleSpaceCreated(space) {
    if (!space?.spaceId) return;
    setSpaceProfiles((current) => {
      const next = [space, ...current.filter((item) => item.spaceId !== space.spaceId)];
      return next;
    });
    switchExploreIdentity(space, { openDashboard: true });
  }

  function handleSpaceInviteResponse(originalSpace, result, accepted) {
    if (!accepted) {
      setSpaceProfiles((current) => current.filter((space) => space.membershipId !== originalSpace?.membershipId));
      return;
    }

    if (result?.spaceId) {
      setSpaceProfiles((current) => [result, ...current.filter((space) => space.spaceId !== result.spaceId)]);
    }
  }

  function updateCurrentIdentityProfile(updated) {
    if (updated?.spaceId) {
      setSpaceProfiles((current) => current.map((space) => (space.spaceId === updated.spaceId ? { ...space, ...updated } : space)));
      return;
    }

    setProfileOverride(updated);
  }

  function handleSpaceDashboardUpdated(updated) {
    if (!updated?.spaceId) return;
    setSpaceProfiles((current) => current.map((space) => (space.spaceId === updated.spaceId ? { ...space, ...updated } : space)));
  }

  function handleSpaceDashboardRemoved(removedSpace) {
    if (removedSpace?.spaceId) {
      setSpaceProfiles((current) => current.filter((space) => space.spaceId !== removedSpace.spaceId));
    }
    switchExploreIdentity(null, { openProfile: true });
  }

  function openViewedProfile(authorProfile) {
    stopAllExploreMedia();
    exploreNav.rememberScrollPosition();
    setViewedProfile(authorProfile);
    exploreNav.openMenuScreen("ViewedProfile");

    if (authorProfile?.identityType === "space" || authorProfile?.spaceId) {
      const spaceId = authorProfile.spaceId || authorProfile.identityId || authorProfile.actorId || authorProfile.username || "";
      fetchExploreSpace(spaceId)
        .then((spaceProfile) => {
          if (spaceProfile) {
            // Ignore a late answer once another profile has been opened.
            setViewedProfile((current) => (current === authorProfile ? { ...authorProfile, ...spaceProfile } : current));
          }
        })
        .catch(() => {});
      return;
    }

    if (authorProfile?.userId) {
      fetchExploreProfile(authorProfile.userId)
        .then((profileData) => {
          if (profileData) {
            setViewedProfile((current) => (current === authorProfile ? { ...authorProfile, ...profileData } : current));
          }
        })
        .catch(() => {});
    }
  }

  function openNotificationTarget(notification) {
    // Admin campaigns and other platform notices carry their own action
    // (a KunThai screen, an item or an https link).
    if (notification?._notification_source === "platform") {
      const item = mapSurfacePlatformNotification(notification);
      if (item.actionTarget) {
        markSurfacePlatformNotificationRead(item, { actioned: true }).catch(() => {});
        openUnifiedNotification(item);
      }
      return;
    }

    exploreNav.closeMenuScreens();

    if ((notification?.actor_type === "space" || notification?.actor_space_id) && notification.actor_name) {
      openViewedProfile({
        identityType: "space",
        identityId: notification.actor_space_id || notification.actor_id || "",
        spaceId: notification.actor_space_id || notification.actor_id || "",
        displayName: notification.actor_name,
        username: "",
        avatarUrl: notification.actor_avatar_url || "",
        accountType: "space",
      });
      return;
    }

    if ((notification?.type === "follow" || notification?.type === "connect") && notification.actor_name) {
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
      const mediaType = String(notification.media_type || "").toLowerCase();
      const targetTab = mediaType.includes("video") || mediaType.includes("swip") ? "Swip" : "UrFeed";
      openExplorePostTarget(notification.post_id, {
        tabHint: targetTab,
        openComments: COMMENT_TARGET_NOTIFICATION_TYPES.has(notification.type),
        commentId: notification.comment_id || notification.target_id || "",
      });
    }
  }

  async function openExplorePostTarget(postId, options = {}) {
    const normalizedPostId = String(postId || "").trim();
    if (!normalizedPostId) return;

    const tabHint = options.tabHint === "Swip" ? "Swip" : "UrFeed";
    const requestKey = `${normalizedPostId}:${Date.now()}:${Math.random().toString(16).slice(2)}`;
    postFocusRequestKeyRef.current = requestKey;
    setSwipPreviewTarget("");
    setPostFocusRequest({
      key: requestKey,
      postId: normalizedPostId,
      // A post already in hand (just published) shows at once; the fetch
      // below still refreshes it.
      post: options.post?.id === normalizedPostId ? options.post : null,
      tab: tabHint,
      openComments: Boolean(options.openComments),
      commentId: options.commentId || "",
    });

    if (options.closeMenus !== false) exploreNav.closeMenuScreens();
    switchExploreTabRef.current?.(tabHint, options.animateTab === false ? { animate: false } : undefined);

    try {
      const post = await fetchExplorePostById(normalizedPostId);
      if (postFocusRequestKeyRef.current !== requestKey) return;

      if (!post) {
        setPostFocusRequest(null);
        showToast("Post is unavailable", "warning");
        return;
      }

      const actualTab = getExplorePostTargetTab(post);
      if (actualTab !== tabHint) switchExploreTabRef.current?.(actualTab);
      setPostFocusRequest((current) => current?.key === requestKey
        ? { ...current, post, tab: actualTab }
        : current);
    } catch (error) {
      if (postFocusRequestKeyRef.current !== requestKey) return;
      const targetNode = document.getElementById(`post-${normalizedPostId}`);
      if (targetNode) {
        const cachedTab = tabPanelRefs.current.Swip?.contains(targetNode) ? "Swip" : "UrFeed";
        if (cachedTab !== tabHint) switchExploreTabRef.current?.(cachedTab);
        setPostFocusRequest((current) => current?.key === requestKey ? { ...current, tab: cachedTab } : current);
      } else {
        setPostFocusRequest(null);
        // Offline, the global network toast is the notice; this one is for a
        // post that could not be opened with the connection up.
        if (!(isConnectionFailure(error) && announceConnectionTrouble())) {
          showToast("Couldn't open the post", "warning");
        }
      }
    }
  }

  function openSearchResult(result) {
    if (!result) {
      return;
    }

    if (result.type === "people") {
      openViewedProfile({
        userId: result.userId || "",
        displayName: result.title || t("explore.profileFallback"),
        username: result.username || "",
        avatarUrl: result.avatarUrl || "",
        accountType: result.accountType || "personal",
      });
      return;
    }

    if (result.type === "space") {
      openViewedProfile({
        userId: result.ownerUserId || result.userId || "",
        ownerUserId: result.ownerUserId || result.userId || "",
        identityType: "space",
        identityId: result.spaceId,
        actorType: "space",
        actorId: result.spaceId,
        spaceId: result.spaceId,
        displayName: result.title || t("explore.spaceFallback"),
        username: result.username || "",
        avatarUrl: result.avatarUrl || "",
        accountType: "space",
      });
      return;
    }

    if (result.type === "hashtag") {
      if (result.postId) {
        openExplorePostTarget(result.postId, { tabHint: result.targetType === "swip" ? "Swip" : "UrFeed" });
      }
      return;
    }

    if (result.postId) {
      openExplorePostTarget(result.postId, { tabHint: result.type === "swip" ? "Swip" : "UrFeed" });
    }
  }

  function startChat(recipient) {
    if (guardGuestAction("message", "user")) return;
    stopAllExploreMedia();
    exploreNav.rememberScrollPosition();
    // A Space is messaged as the Space: the thread lands in its shared inbox
    // for every team member who can reply — never in the owner's personal DMs.
    const recipientSpaceId = recipient?.identityType === "space" || recipient?.accountType === "space"
      ? recipient?.spaceId || recipient?.identityId || ""
      : recipient?.spaceId || "";
    const messageTarget = recipientSpaceId
      ? {
        ...recipient,
        identityType: "space",
        spaceId: recipientSpaceId,
        ownerUserId: recipient.ownerUserId || "",
        userId: "",
        displayName: recipient.displayName || recipient.name || t("explore.spaceFallback"),
        avatarUrl: recipient.avatarUrl || "",
      }
      : recipient;
    setMessageRecipient(messageTarget);
    setMessageRecipientOwnerId(currentUserId);
    exploreNav.openMenuScreen("Messages");
  }
  
  function openMenuScreen(screen, options = {}) {
   stopAllExploreMedia();
    setLeftDrawerOpen(false);
    if (!MENU_SCREENS[screen]) {
      return;
    }

    if (screen === "YourVoice") {
      setYourVoiceDraft(options.prefill || null);
    }

    if (menuStack.at(-1) === screen) {
      return;
    }

    window.clearTimeout(stackCleanupTimerRef.current);
    setMenuStackAction("push");
    if (screen === "Messages") {
      setMessageRecipient(null);
      setMessageRecipientOwnerId("");
    }
    exploreNav.openMenuScreen(screen, options);
  }

  function handleCreateSelect(type) {
    if (type === "space") {
      openMenuScreen("CreateSpace");
      return;
    }

    exploreNav.openComposer(type);
  }

  // Every switch with a slide (a tap in the tab bar, a notification, a post
  // opening) now slides exactly like a finger swipe settling: the two panels
  // move with plain transform transitions and the tab switches once they have
  // arrived. The class-based slide (keyframe animations started while the new
  // tab was being drawn) kept looking like a reload on iPhone: iOS started
  // its clock before the first frame, so it showed up nearly finished, while
  // the finger-swipe path was smooth.
  function switchExploreTab(tab, options = {}) {
    if (tabSlideRef.current) {
      // Chosen again mid-slide: land where asked at once.
      cancelTabSlide();
      if (tab === activeTab) return;
      commitExploreTab(tab, { ...options, animate: false });
      return;
    }
    if (tab === activeTab) return;
    if (options.animate !== false && slideToExploreTab(tab)) return;
    commitExploreTab(tab, { ...options, animate: false });
  }

  function cancelTabSlide() {
    const slide = tabSlideRef.current;
    if (!slide) return;
    tabSlideRef.current = null;
    window.cancelAnimationFrame(slide.frame);
    window.clearTimeout(slide.timer);
    clearTabDragStyles();
    setTabHighlight("");
  }

  function slideToExploreTab(tab) {
    const fromNode = tabPanelRefs.current[activeTab];
    const toNode = tabPanelRefs.current[tab];
    const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (!active || !fromNode || !toNode || reducedMotion) return false;

    const width = window.innerWidth || 1;
    // Direction the panels travel: -1 toward a tab on the right.
    const sign = EXPLORE_TAB_ORDER.indexOf(tab) > EXPLORE_TAB_ORDER.indexOf(activeTab) ? -1 : 1;
    window.clearTimeout(dragSettleTimerRef.current);
    // The incoming tab waits beside the screen, peeking 1px so it is painted,
    // then slides in over the current one, which stays still. Moving the
    // current tab too (as a finger swipe does) meant turning all of UrFeed
    // (~13,000px) into a moving layer at the start of the slide; that took
    // longer than the slide itself, so it showed up nearly finished. The
    // incoming tab is a screen-sized panel, cheap to move.
    // While it waits (two frames) it sits in its final place at 1% opacity:
    // phones paint only the visible part of a layer, so a tab waiting beside
    // the screen was painted during the slide itself (a jump, then a pause).
    // Here all of it is painted first, unseen, and then it slides in whole.
    prepareIncomingPanel(tab, 0);
    toNode.style.opacity = "0.01";
    toNode.style.willChange = "transform";
    // The same soft edge as the app's other screen pushes.
    toNode.style.boxShadow = `${sign < 0 ? -10 : 10}px 0 28px rgba(2, 6, 23, 0.16)`;
    setTabHighlight(tab);

    const slide = { tab, frame: 0, timer: 0 };
    tabSlideRef.current = slide;
    slide.frame = window.requestAnimationFrame(() => {
      slide.frame = window.requestAnimationFrame(() => {
        if (tabSlideRef.current !== slide) return;
        // A standard ease, not the app's front-loaded one: phones that draw
        // only 15-30 frames a second showed ~70% of a front-loaded slide in
        // its first frame, so it read as a jump. This spreads it over frames.
        const transition = `transform ${TAB_TAP_SLIDE_MS}ms cubic-bezier(0.4, 0, 0.2, 1)`;
        // To the side (no transition), shown, then the slide in.
        toNode.style.transition = "none";
        toNode.style.transform = `translate3d(${-sign * width}px, 0, 0)`;
        toNode.style.opacity = "";
        void toNode.offsetWidth;
        toNode.style.transition = transition;
        toNode.style.transform = "translate3d(0, 0, 0)";
        // Switch once the slide has really finished: a busy phone can start
        // it late, and a fixed timer then landed the switch mid-slide (the
        // tab snapped into place). The timer only backs up a missing event.
        const finish = () => {
          toNode.removeEventListener("transitionend", onEnd);
          window.clearTimeout(slide.timer);
          if (tabSlideRef.current !== slide) return;
          tabSlideRef.current = null;
          // Cleared in the switch's own commit (the activeTab layout effect),
          // as after a finger swipe, so nothing jumps back first.
          tabDragCleanupPendingRef.current = true;
          setTabHighlight("");
          commitExploreTabRef.current?.(tab, { animate: false });
          window.setTimeout(() => {
            if (!tabDragCleanupPendingRef.current) return;
            tabDragCleanupPendingRef.current = false;
            clearTabDragStylesRef.current?.();
          }, 600);
        };
        const onEnd = (event) => {
          if (event.target === toNode && event.propertyName === "transform") finish();
        };
        toNode.addEventListener("transitionend", onEnd);
        slide.timer = window.setTimeout(finish, TAB_TAP_SLIDE_MS + 500);
        slide.finish = finish;
      });
    });
    return true;
  }

  function commitExploreTab(tab, options = {}) {
    if (tab === activeTab) {
      return;
    }

    const currentIndex = EXPLORE_TAB_ORDER.indexOf(activeTab);
    const nextIndex = EXPLORE_TAB_ORDER.indexOf(tab);
    // A finger-driven swipe already moved the panels, so the class-based
    // slide animation is skipped to avoid replaying the transition.
    const direction = nextIndex >= currentIndex ? "forward" : "backward";
    setTabSlideDirection(options.animate === false ? "none" : direction);
    // A push, like the main screens: the current tab stays pinned exactly
    // where it is on screen and slides out while the next one slides in.
    window.clearTimeout(leavingTabTimerRef.current);
    if (options.animate === false) {
      const windowed = tabPanelRefs.current[tabWindowRef.current];
      if (windowed) tabWindowScrollRef.current = windowed.scrollTop;
      setLeavingTab(null);
    } else {
      // Where the current tab's content starts on screen (a tab still sliding
      // in is a window with its own scroll). It leaves as a window from there.
      const current = tabPanelRefs.current[activeTab];
      const contentTop = current
        ? current.getBoundingClientRect().top - (tabWindowRef.current === activeTab ? current.scrollTop : 0)
        : 0;
      // Drawn once off to the side first ("pending"), then slid in.
      setLeavingTab({
        tab: activeTab,
        direction,
        top: Math.max(0, Math.round(contentTop)),
        scroll: Math.max(0, Math.round(-contentTop)),
        phase: "pending",
      });
    }
    tabScrollRef.current[activeTab] = window.scrollY || 0;
    exploreNav.setActiveTab(tab);
    const nextScroll = tabScrollRef.current[tab] || 0;
    // The layout effect above restores the offset. Re-apply after the slide:
    // a browser-back arrival (e.g. returning from a reposted Swip) can trigger
    // the browser's own scroll restoration, which would otherwise override the
    // saved feed position. Skipped once another tab has been chosen.
    window.setTimeout(() => {
      if (scrollRestoreTabRef.current !== tab) return;
      if (Math.abs((window.scrollY || 0) - nextScroll) < 1) return;
      window.scrollTo({ top: nextScroll, behavior: "instant" });
    }, NAV_TRANSITION_MS + 40);
  }

  function returnFromRepostedSwip() {
    setSwipPreviewTarget("");
    switchExploreTab("UrFeed");
  }

  function getExploreTabPanelClass(tab) {
    const pending = leavingTab?.phase === "pending";
    if (leavingTab?.tab === tab && activeTab !== tab) {
      if (pending) return "kt-main-leave-hold kt-main-window block";
      return `${leavingTab.direction === "backward" ? "kt-main-leave-backward" : "kt-main-leave-forward"} kt-main-window block`;
    }

    if (activeTab !== tab) {
      return "kt-tab-hidden";
    }

    if (tabSlideDirection === "none" || !leavingTab) {
      return "block";
    }

    const backward = tabSlideDirection === "backward";
    if (pending) return `${backward ? "kt-main-enter-wait-backward" : "kt-main-enter-wait-forward"} kt-main-window block`;
    return `${backward ? "kt-main-enter-backward" : "kt-main-enter-forward"} kt-main-window block`;
  }

  function getExploreTabPanelStyle(tab) {
    if (leavingTab?.tab !== tab || activeTab === tab) return undefined;
    return { top: `${leavingTab.top}px`, height: `calc(100dvh - ${leavingTab.top}px)` };
  }

  // Where a tab's content starts on screen once it is active: under the tabs
  // row alone on Swip, under the full header (+ pt-2) elsewhere.
  function getExploreTabTop(tab) {
    return tab === "Swip" ? `calc(${topChrome.tabs}px + var(--kt-safe-area-top))` : `${topChrome.full + 8}px`;
  }

  function getDrawerWidth() {
    return Math.min(window.innerWidth * 0.78, 390);
  }

  function clearTabDragStyles() {
    EXPLORE_TAB_ORDER.forEach((tab) => {
      const node = tabPanelRefs.current[tab];
      if (!node) return;
      node.style.transition = "";
      node.style.transform = "";
      node.style.display = "";
      node.style.contentVisibility = "";
      node.style.position = "";
      node.style.top = "";
      node.style.left = "";
      node.style.right = "";
      node.style.bottom = "";
      node.style.zIndex = "";
      node.style.overflow = "";
      node.style.background = "";
      node.style.pointerEvents = "";
      node.style.height = "";
      node.style.visibility = "";
      node.style.willChange = "";
      node.style.boxShadow = "";
      node.style.opacity = "";
    });
  }

  // The incoming tab renders as a fixed overlay under the sticky header while
  // the finger drags, so both panels can move together without re-flowing the
  // page or losing the window scroll position of the active tab.
  function prepareIncomingPanel(tab, initialOffset) {
    const node = tabPanelRefs.current[tab];
    if (!node) return;

    node.style.display = "block";
    node.style.contentVisibility = "visible";
    // A hidden tab is collapsed and invisible (kt-tab-hidden); while it slides
    // in it is shown at full height.
    node.style.height = "auto";
    node.style.visibility = "visible";
    node.style.position = "fixed";
    node.style.top = getExploreTabTop(tab);
    node.style.left = "0";
    node.style.right = "0";
    node.style.bottom = "0";
    node.style.zIndex = "25";
    node.style.overflow = "hidden";
    // The panels' own surface (appearance.css), so dark mode stays dark.
    node.style.background = "var(--kt-panel-bg, rgb(241 245 249))";
    node.style.pointerEvents = "none";
    node.style.transition = "none";
    node.style.transform = `translate3d(${initialOffset}px, 0, 0)`;
    node.scrollTop = tabScrollRef.current[tab] || 0;
    settleReplayedAnimations(node);
  }

  function beginHorizontalDrag(gesture, deltaX) {
    gesture.width = window.innerWidth || 1;
    const currentIndex = EXPLORE_TAB_ORDER.indexOf(activeTab);

    if (deltaX > 0 && activeTab === "UrFeed") {
      gesture.mode = "drawer";
      setDrawerMountedByDrag(true);
      setDrawerDragging(true);
      return;
    }

    const targetIndex = deltaX > 0 ? currentIndex - 1 : currentIndex + 1;

    if (targetIndex >= 0 && targetIndex < EXPLORE_TAB_ORDER.length) {
      gesture.mode = "tabs";
      gesture.incomingTab = EXPLORE_TAB_ORDER[targetIndex];
      // sign is the horizontal direction panels travel: -1 toward the next
      // tab (finger moves left), +1 toward the previous tab.
      gesture.sign = targetIndex > currentIndex ? -1 : 1;
      prepareIncomingPanel(gesture.incomingTab, -gesture.sign * gesture.width);
      return;
    }

    if (deltaX < 0) {
      // Last tab: no Explore panel to preview; the release hands over to
      // UrMall like before, with light drag resistance for feedback.
      gesture.mode = "exit";
    }
  }

  function updateHorizontalDrag(gesture, rawDeltaX) {
    if (gesture.mode === "drawer") {
      const width = getDrawerWidth();
      const shift = Math.min(width, Math.max(0, rawDeltaX));
      const aside = drawerAsideRef.current;
      if (aside) {
        aside.style.transition = "none";
        aside.style.transform = `translate3d(${-width + shift}px, 0, 0)`;
      }
      const backdrop = drawerBackdropRef.current;
      if (backdrop) {
        backdrop.style.transition = "none";
        backdrop.style.opacity = String(shift / width);
      }
      return;
    }

    const activeNode = tabPanelRefs.current[activeTab];

    if (gesture.mode === "exit") {
      const deltaX = Math.min(0, rawDeltaX);
      if (activeNode) {
        activeNode.style.transition = "none";
        activeNode.style.transform = `translate3d(${deltaX * 0.35}px, 0, 0)`;
      }
      return;
    }

    if (gesture.mode === "tabs") {
      const deltaX = gesture.sign < 0 ? Math.min(0, rawDeltaX) : Math.max(0, rawDeltaX);
      if (activeNode) {
        activeNode.style.transition = "none";
        activeNode.style.transform = `translate3d(${deltaX}px, 0, 0)`;
      }
      const incoming = tabPanelRefs.current[gesture.incomingTab];
      if (incoming) {
        incoming.style.transform = `translate3d(${-gesture.sign * gesture.width + deltaX}px, 0, 0)`;
      }
    }
  }

  function finishDrawerDrag(rawDeltaX, velocity) {
    const width = getDrawerWidth();
    const aside = drawerAsideRef.current;
    const backdrop = drawerBackdropRef.current;
    const commit = rawDeltaX > width * 0.35 || velocity > TAB_DRAG_COMMIT_VELOCITY;

    if (aside) {
      aside.style.transition = `transform ${TAB_DRAG_SETTLE_MS}ms ease-out`;
      aside.style.transform = commit ? "translate3d(0, 0, 0)" : `translate3d(${-width}px, 0, 0)`;
    }
    if (backdrop) {
      backdrop.style.transition = `opacity ${TAB_DRAG_SETTLE_MS}ms ease-out`;
      backdrop.style.opacity = commit ? "1" : "0";
    }

    if (commit) {
      // Opening the menu by swipe taps like the Menu button.
      haptics.light();
      setLeftDrawerOpen(true);
    }

    window.clearTimeout(dragSettleTimerRef.current);
    dragSettleTimerRef.current = window.setTimeout(() => {
      setDrawerDragging(false);
      if (!commit) {
        setDrawerMountedByDrag(false);
      }
      if (aside) {
        aside.style.transition = "";
        if (!commit) aside.style.transform = "";
      }
      if (backdrop) {
        backdrop.style.transition = "";
        if (!commit) backdrop.style.opacity = "";
      }
    }, TAB_DRAG_SETTLE_MS + 30);
  }

  // Animate the Social drawer shut (slide left + fade the backdrop) before it
  // unmounts, so closing feels as smooth as the swipe that opened it instead of
  // vanishing instantly.
  function closeLeftDrawer() {
    const aside = drawerAsideRef.current;
    const backdrop = drawerBackdropRef.current;

    if (!aside && !backdrop) {
      setLeftDrawerOpen(false);
      setDrawerMountedByDrag(false);
      return;
    }

    setDrawerClosing(true);
    const width = getDrawerWidth();
    if (aside) {
      aside.style.transition = `transform ${TAB_DRAG_SETTLE_MS}ms ease-in`;
      aside.style.transform = `translate3d(${-width}px, 0, 0)`;
    }
    if (backdrop) {
      backdrop.style.transition = `opacity ${TAB_DRAG_SETTLE_MS}ms ease-in`;
      backdrop.style.opacity = "0";
    }

    window.clearTimeout(dragSettleTimerRef.current);
    dragSettleTimerRef.current = window.setTimeout(() => {
      setLeftDrawerOpen(false);
      setDrawerMountedByDrag(false);
      setDrawerClosing(false);
      if (aside) {
        aside.style.transition = "";
        aside.style.transform = "";
      }
      if (backdrop) {
        backdrop.style.transition = "";
        backdrop.style.opacity = "";
      }
    }, TAB_DRAG_SETTLE_MS + 20);
  }

  function finishTabDrag(gesture, rawDeltaX, velocity) {
    const activeNode = tabPanelRefs.current[activeTab];
    const incoming = tabPanelRefs.current[gesture.incomingTab];
    const deltaX = gesture.sign < 0 ? Math.min(0, rawDeltaX) : Math.max(0, rawDeltaX);
    const fastEnough = gesture.sign < 0 ? velocity < -TAB_DRAG_COMMIT_VELOCITY : velocity > TAB_DRAG_COMMIT_VELOCITY;
    const commit = Math.abs(deltaX) > gesture.width * TAB_DRAG_COMMIT_RATIO || (Math.abs(deltaX) > TAB_DRAG_ENGAGE_PX && fastEnough);

    if (activeNode) {
      activeNode.style.transition = `transform ${TAB_DRAG_SETTLE_MS}ms ease-out`;
      activeNode.style.transform = commit ? `translate3d(${gesture.sign * gesture.width}px, 0, 0)` : "translate3d(0, 0, 0)";
    }
    if (incoming) {
      incoming.style.transition = `transform ${TAB_DRAG_SETTLE_MS}ms ease-out`;
      incoming.style.transform = commit ? "translate3d(0, 0, 0)" : `translate3d(${-gesture.sign * gesture.width}px, 0, 0)`;
    }

    window.clearTimeout(dragSettleTimerRef.current);
    dragSettleTimerRef.current = window.setTimeout(() => {
      if (!commit) {
        clearTabDragStyles();
        return;
      }
      // Cleared in the switch's commit (the activeTab layout effect), so the
      // incoming tab never drops back out of view first.
      tabDragCleanupPendingRef.current = true;
      switchExploreTabRef.current?.(gesture.incomingTab, { animate: false });
      // Should the switch not happen, the panels still settle.
      window.setTimeout(() => {
        if (!tabDragCleanupPendingRef.current) return;
        tabDragCleanupPendingRef.current = false;
        clearTabDragStylesRef.current?.();
      }, 600);
    }, TAB_DRAG_SETTLE_MS + 30);
  }

  function handleExploreTouchStart(event) {
    if (!active || anyExploreOverlayVisible || composerVisible || drawerDragging || event.touches.length !== 1) {
      exploreGestureRef.current = null;
      return;
    }

    // Inputs, horizontal scrollers, media controls, maps, and explicitly locked
    // surfaces own their gesture from touch-down through release.
    if (!canStartNavigationGesture(event.target)) {
      exploreGestureRef.current = null;
      return;
    }

    const touch = event.touches[0];
    exploreGestureRef.current = {
      startX: touch.clientX,
      startY: touch.clientY,
      lastX: touch.clientX,
      lastY: touch.clientY,
      prevX: touch.clientX,
      lastTime: Date.now(),
      prevTime: Date.now(),
      axis: null,
      mode: null,
      incomingTab: "",
      sign: 0,
      width: window.innerWidth || 1,
    };
  }

  function handleExploreTouchMove(event) {
    const gesture = exploreGestureRef.current;
    if (!gesture || event.touches.length !== 1 || navigationGesturesLocked()) {
      if (navigationGesturesLocked()) cancelHorizontalDrag();
      return;
    }

    const touch = event.touches[0];
    gesture.prevX = gesture.lastX;
    gesture.prevTime = gesture.lastTime;
    gesture.lastX = touch.clientX;
    gesture.lastY = touch.clientY;
    gesture.lastTime = Date.now();

    const deltaX = gesture.lastX - gesture.startX;
    const deltaY = gesture.lastY - gesture.startY;

    if (!gesture.axis) {
      if (Math.abs(deltaX) < TAB_DRAG_ENGAGE_PX && Math.abs(deltaY) < TAB_DRAG_ENGAGE_PX) {
        return;
      }

      gesture.axis = Math.abs(deltaX) > Math.abs(deltaY) * TAB_DRAG_AXIS_RATIO ? "x" : "y";

      if (gesture.axis === "x") {
        beginHorizontalDrag(gesture, deltaX);
      }
    }

    if (gesture.axis !== "x" || !gesture.mode) {
      return;
    }

    // Once Explore owns the horizontal gesture, stop the browser's native
    // back/forward or rubber-band movement from shifting the page underneath.
    if (event.cancelable) event.preventDefault();
    updateHorizontalDrag(gesture, deltaX);
  }

  function handleExploreTouchEnd() {
    const gesture = exploreGestureRef.current;
    exploreGestureRef.current = null;

    if (!gesture || navigationGesturesLocked() || gesture.axis !== "x" || !gesture.mode) {
      return;
    }

    const rawDeltaX = gesture.lastX - gesture.startX;
    const elapsed = Math.max(1, gesture.lastTime - gesture.prevTime);
    const velocity = (gesture.lastX - gesture.prevX) / elapsed;

    if (gesture.mode === "drawer") {
      finishDrawerDrag(rawDeltaX, velocity);
      return;
    }

    if (gesture.mode === "exit") {
      const activeNode = tabPanelRefs.current[activeTab];
      const commit = rawDeltaX < -68 || velocity < -TAB_DRAG_COMMIT_VELOCITY;
      if (commit) {
        // Continue straight into UrMall. A snap-back animation here used to
        // compete with the main-page entry transition and caused the small
        // pause users could feel at the service boundary. The tab stays at its
        // drag offset while Explore slides away and is reset once it is gone.
        exitDragCleanupPendingRef.current = true;
        window.clearTimeout(exitDragCleanupTimerRef.current);
        exitDragCleanupTimerRef.current = window.setTimeout(() => {
          if (!exitDragCleanupPendingRef.current) return;
          exitDragCleanupPendingRef.current = false;
          clearTabDragStylesRef.current?.();
        }, NAV_TRANSITION_MS + 300);
        onNavigateMain?.("marketplace");
        return;
      }
      if (activeNode) {
        activeNode.style.transition = `transform ${TAB_DRAG_SETTLE_MS}ms ease-out`;
        activeNode.style.transform = "translate3d(0, 0, 0)";
        window.clearTimeout(dragSettleTimerRef.current);
        dragSettleTimerRef.current = window.setTimeout(() => clearTabDragStyles(), TAB_DRAG_SETTLE_MS + 30);
      }
      return;
    }

    finishTabDrag(gesture, rawDeltaX, velocity);
  }

  function cancelHorizontalDrag() {
    const gesture = exploreGestureRef.current;
    exploreGestureRef.current = null;

    if (!gesture || gesture.axis !== "x" || !gesture.mode) {
      return;
    }

    if (gesture.mode === "drawer") {
      finishDrawerDrag(0, 0);
      return;
    }

    if (gesture.mode === "tabs") {
      finishTabDrag(gesture, 0, 0);
      return;
    }

    clearTabDragStyles();
  }

  function renderMenuScreen(screenKey) {
    if (!screenKey) {
      return null;
    }

    if (screenKey === "Menu") {
      return (
        <div className="min-h-[calc(100vh-72px)] bg-slate-100">
          <aside className="flex min-h-[calc(100vh-72px)] w-full flex-col bg-white shadow-sm">
            <SocialMenuContent
              currentProfile={profile}
              spaces={spaceProfiles}
              spaceActivity={spaceActivity}
              onCreateSpace={() => openMenuScreen("CreateSpace")}
              onNavigate={openMenuScreen}
              onSelectIdentity={switchExploreIdentity}
            />
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
          onCreateSpace={() => openMenuScreen("CreateSpace")}
          onEditProfile={() => openMenuScreen("EditProfile")}
          onOpenNotification={openNotificationTarget}
          onProfileUpdate={updateCurrentIdentityProfile}
          onSpaceInviteResponse={handleSpaceInviteResponse}
          onSwitchIdentity={switchExploreIdentity}
          onStartChat={startChat}
          onOpenSpaceDashboard={() => openMenuScreen("SpaceDashboard")}
          personalProfile={personalProfile}
          spaces={spaceProfiles}
          spaceActivity={spaceActivity}
        />
      );
    }

    if (screenKey === "EditProfile") {
      return (
        <ProfileEditScreen
          authProfile={authProfile}
          currentUserId={currentUserId}
          onProfileUpdate={updateCurrentIdentityProfile}
          profile={profile}
        />
      );
    }

    if (screenKey === "ViewedProfile") {
      // A viewed profile is "own" only when it is the identity currently in
      // use. A Space is always shown like any other public profile (Feed and
      // Swip only, no credits or management) unless the viewer is acting as
      // that Space; owners/admins get a one-tap way to switch into it.
      const viewedIsSpace = Boolean(viewedProfile?.spaceId || viewedProfile?.identityType === "space");
      const viewedEditable = viewedIsSpace
        ? Boolean(activeSpaceProfile && getIdentityKey(viewedProfile) === getIdentityKey(activeSpaceProfile))
        : Boolean(viewedProfile?.userId && viewedProfile.userId === (personalProfile?.userId || currentUserId));
      const managedSpace = viewedIsSpace && !viewedEditable
        ? spaceProfiles.find((space) => space.spaceId === viewedProfile.spaceId
          && space.membershipStatus === "active"
          && (space.memberRole === "owner" || space.memberRole === "administrator"))
        : null;
      return (
        <ProfileScreen
          // Never fall back to the viewer's own profile: a viewed Space or
          // person must not turn into "me" while it loads.
          profile={viewedProfile}
          authProfile={authProfile}
          currentUserId={currentUserId}
          hideHeader
          editable={viewedEditable}
          managedSpace={managedSpace || null}
          loading={!viewedProfile}
          profileFetched={Boolean(viewedProfile)}
          onCreateSpace={() => openMenuScreen("CreateSpace")}
          onOpenNotification={openNotificationTarget}
          onProfileUpdate={updateCurrentIdentityProfile}
          onSwitchIdentity={switchExploreIdentity}
          onStartChat={startChat}
          spaces={spaceProfiles}
          spaceActivity={spaceActivity}
        />
      );
    }

    if (screenKey === "CreateSpace") {
      return <SpaceCreateScreen hideHeader onCreated={handleSpaceCreated} />;
    }

    if (screenKey === "SpaceDashboard") {
      return (
        <SpaceDashboardScreen
          personalProfile={personalProfile}
          space={activeSpaceProfile}
          onOpenEdit={() => openMenuScreen("EditProfile")}
          onOpenMessages={() => openMenuScreen("Messages")}
          onOpenNotifications={() => openMenuScreen("Notifications")}
          onOpenProfile={() => openMenuScreen("Profile")}
          onSpaceRemoved={handleSpaceDashboardRemoved}
          onSpaceUpdated={handleSpaceDashboardUpdated}
          onSwitchProfile={() => switchExploreIdentity(null, { openProfile: true })}
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
      return <ActivityScreen currentUserId={currentUserId} hideHeader onOpenNotification={openNotificationTarget} spaceId={activeSpaceProfile?.spaceId || ""} spaceName={activeSpaceProfile?.displayName || ""} />;
    }

    if (screenKey === "Notifications") {
      return <Notifications currentUserId={currentUserId} onOpenNotification={openNotificationTarget} />;
    }

    if (screenKey === "Messages") {
      return (
        <MessagesScreen keepAlive
          key={`${currentUserId}:${activeSpaceProfile?.spaceId || "personal"}`}
          currentProfile={profile}
          hideHeader
          initialRecipient={messageRecipientOwnerId === currentUserId ? messageRecipient : null}
          onConversationActiveChange={setMessageConversationActive}
          onViewProfile={openViewedProfile}
        />
      );
    }

    if (screenKey === "Connections") {
      return <Connections currentUserId={currentUserId} onViewProfile={openViewedProfile} />;
    }

    if (screenKey === "Privacy") {
      return <PrivacyScreen hideHeader onOpenPermissions={() => openMenuScreen("Permissions")} />;
    }

    if (screenKey === "Settings") {
      return (
        <SettingsScreen
          hideHeader
          onOpenDataMobile={() => openMenuScreen("DataMobileUse")}
          onOpenInterests={() => openMenuScreen("Interests")}
          onOpenPermissions={() => openMenuScreen("Permissions")}
          onOpenPrivacy={() => openMenuScreen("Privacy")}
          onOpenSecurity={() => openMenuScreen("Security")}
          onSwitchAccount={() => openMenuScreen("SwitchAccount")}
        />
      );
    }

    if (screenKey === "Interests") {
      return <InterestsScreen hideHeader />;
    }

    if (screenKey === "Security") {
      return <SecurityScreen currentProfile={profile} hideHeader onOpenHelp={() => openMenuScreen("HelpCenter")} onSwitchAccount={() => openMenuScreen("SwitchAccount")} />;
    }

    if (screenKey === "Permissions") {
      return <PermissionsScreen hideHeader onOpenPrivacy={() => openMenuScreen("Privacy")} />;
    }

    if (screenKey === "DataMobileUse") {
      return <DataMobileUseScreen hideHeader />;
    }

    if (screenKey === "SwitchAccount") {
      return <SwitchAccountScreen currentProfile={profile} user={user} />;
    }

    if (screenKey === "HelpCenter") {
      return <HelpCenterScreen hideHeader onOpenYourVoice={(prefill) => openMenuScreen("YourVoice", { prefill })} />;
    }

    if (screenKey === "ReportProblem") {
      return <HelpCenterScreen focusReport hideHeader onOpenYourVoice={(prefill) => openMenuScreen("YourVoice", { prefill })} />;
    }

    if (screenKey === "YourVoice") {
      return <YourVoiceScreen hideHeader initialDraft={yourVoiceDraft} />;
    }

    if (screenKey === "JoinKunThai") {
      return <JoinKunThaiScreen hideHeader />;
    }

    if (screenKey === "SafetyCenter") {
      return (
        <SafetyCenterScreen
          hideHeader
          onOpenPrivacy={() => openMenuScreen("Privacy")}
          onOpenReport={() => openMenuScreen("ReportProblem")}
          onOpenTerms={() => openMenuScreen("TermsPolicies")}
        />
      );
    }

    if (screenKey === "TermsPolicies") {
      return (
        <TermsPoliciesScreen
          hideHeader
          onOpenHelp={() => openMenuScreen("HelpCenter")}
          onOpenPrivacy={() => openMenuScreen("Privacy")}
          onOpenReport={() => openMenuScreen("ReportProblem")}
        />
      );
    }

    if (screenKey === "AboutKunThai") {
      return <AboutKunThaiScreen hideHeader onOpenTerms={() => openMenuScreen("TermsPolicies")} />;
    }

    if (screenKey === "FutureFeatures") {
      return <FutureFeaturesScreen hideHeader onOpenYourVoice={(prefill) => openMenuScreen("YourVoice", { prefill })} />;
    }

    return null;
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
          className={`kt-urmall-screen-panel kt-explore-screen-panel absolute inset-0 flex w-full transform flex-col bg-slate-100 shadow-2xl ${
            placementClass
          } ${motionClass} ${active && !exiting ? "pointer-events-auto" : "pointer-events-none"}`}
          style={{ zIndex: index + 1 }}
        >
          {hideScreenHeader ? null : (
            <SocialScreenHeader
              title={t(`screens.${screenKey}Title`)}
              subtitle={t(`screens.${screenKey}Subtitle`)}
              onBack={active || exiting ? (active ? goBackFullScreen : () => {}) : undefined}
            />
          )}
          <div className={`relative min-h-0 flex-1 ${screenKey === "Messages" ? "overflow-hidden" : "overflow-y-auto"}`}>
            {renderMenuScreen(screenKey)}
          </div>
        </section>
      );
    });
  }

  return (
    <>
    <div
      className={`kt-mobile-viewport block w-full max-w-full touch-pan-y overscroll-x-none overflow-x-clip bg-slate-100 ${isSwipTab ? "" : "kuntai-safe-bottom"}`}
      style={topChrome.tabs ? { "--explore-top-chrome-height": `calc(${topChrome.tabs}px + var(--kt-safe-area-top))` } : undefined}
      onTouchStart={handleExploreTouchStart}
      onTouchMove={handleExploreTouchMove}
      onTouchEnd={handleExploreTouchEnd}
      onTouchCancel={cancelHorizontalDrag}
    >
      <PostingStatusBanner notice={postingNotice} onDismiss={dismissPostingNotice} onShareKunThai={shareKunThaiLink} onWatch={watchPostedVideo} />
      <PostOutboxIndicator />

      {/* =========================
          HEADER + PARENT TABS
      ========================= */}
      {/* Hidden by sliding it up (like UrMall), never by collapsing its height:
          collapsing shrank the page mid-scroll, the browser shifted the scroll
          position to compensate, and that shift read as a scroll the other way —
          so the header (and the bottom tabs) kept flickering in and out.
          Swip works the same way: the header stays mounted and slides up (the
          tabs row with it, stopping under the safe area) in step with the tab
          slide. Unmounting it changed the bar's height and padding in one frame,
          so the bar jumped on the way in and the header redrew on the way out. */}
      <div
        ref={topChromeRef}
        className={`sticky top-0 z-30 max-h-56 overflow-hidden bg-slate-100/95 backdrop-blur ${chromeHidden ? "pointer-events-none" : ""}`}
        style={{
          opacity: chromeHidden ? 0 : 1,
          transform: chromeHidden
            ? "translate3d(0, -100%, 0)"
            : isSwipTab
              ? `translate3d(0, calc(var(--kt-safe-area-top) - ${headerShift}px), 0)`
              : "translate3d(0, 0, 0)",
          transition: "transform var(--kt-nav-duration) var(--kt-nav-ease), opacity 300ms ease-out",
        }}
      >
        <div
          aria-hidden={isSwipTab || undefined}
          inert={isSwipTab ? "true" : undefined}
          style={{
            opacity: isSwipTab ? 0 : 1,
            transition: "opacity var(--kt-nav-duration) var(--kt-nav-ease)",
          }}
        >
          <ExploreHeader
            currentProfile={profile}
            spaceActivityTotal={otherSpacesActivityTotal}
            onAlertsClick={() => openMenuScreen("Notifications")}
            onNavigate={openMenuScreen}
            onCreateSelect={handleCreateSelect}
            onSearchResult={openSearchResult}
            onOverlayChange={setHeaderOverlayOpen}
          />
        </div>

        {/* =========================
            PARENT TABS
        ========================= */}
        <div ref={exploreTabsRef}>
          <ExploreTabs activeTab={tabHighlight || activeTab} setActiveTab={switchExploreTab} />
        </div>
      </div>

      {/* =========================
          ACTIVE PAGE
      ========================= */}
      {/* On Swip the content moves up under the slid-away header. It changes in
          the switch's own commit, while the leaving tab is pinned and the next
          one waits off to the side, so nothing on screen shifts. */}
      <div
        className={`w-full max-w-full overflow-x-clip ${isSwipTab ? "pt-0" : "pt-2"}`}
        style={isSwipTab && headerShift ? { marginTop: `calc(var(--kt-safe-area-top) - ${headerShift}px)` } : undefined}
      >
        {!profileLoading && profileError ? <ExploreProfileError message={translateUi(profileError)} /> : null}
       {profileExists ? (
  <>
    <section
      ref={(node) => { tabPanelRefs.current.UrFeed = node; }}
      aria-hidden={activeTab !== "UrFeed"}
      inert={activeTab !== "UrFeed" ? "true" : undefined}
      className={getExploreTabPanelClass("UrFeed")}
      style={getExploreTabPanelStyle("UrFeed")}
    >
      <MemoUrFeed
        active={active && activeTab === "UrFeed" && !feedCovered}
        focusRequest={postFocusRequest?.tab === "UrFeed" ? postFocusRequest : null}
        profile={profile}
        onViewProfile={viewProfileFromTab}
      />
    </section>

    <section
      ref={(node) => { tabPanelRefs.current.Swip = node; }}
      aria-hidden={activeTab !== "Swip"}
      inert={activeTab !== "Swip" ? "true" : undefined}
      className={getExploreTabPanelClass("Swip")}
      style={getExploreTabPanelStyle("Swip")}
    >
      <MemoSwip
        active={active && activeTab === "Swip" && swipFullScreen && !feedCovered}
        currentUserId={profile.userId}
        focusPostId={postFocusRequest?.tab === "Swip" ? postFocusRequest.postId : swipPreviewTarget}
        focusPost={postFocusRequest?.tab === "Swip" ? postFocusRequest.post : null}
        focusRequest={postFocusRequest?.tab === "Swip" ? postFocusRequest : null}
        onReturnToRepost={swipPreviewTarget ? returnToRepostFromSwip : undefined}
        profile={profile}
        onViewProfile={viewProfileFromTab}
      />
    </section>

    <section
      ref={(node) => { tabPanelRefs.current.Connections = node; }}
      aria-hidden={activeTab !== "Connections"}
      inert={activeTab !== "Connections" ? "true" : undefined}
      className={getExploreTabPanelClass("Connections")}
      style={getExploreTabPanelStyle("Connections")}
    >
      <MemoConnections
        currentUserId={profile.userId}
        onViewProfile={viewProfileFromTab}
      />
    </section>
    <div ref={tabSpacerRef} aria-hidden="true" />
  </>
) : null}
      </div>

    </div>
    {leftDrawerOpen || drawerDragging || drawerClosing ? createPortal(
      <div className="fixed inset-0 z-[75] flex h-dvh w-full overflow-hidden overscroll-none [contain:layout_paint]">
        <button
          type="button"
          ref={drawerBackdropRef}
          aria-label={t("explore.closeSocialMenu")}
          className="absolute inset-0 touch-none bg-slate-950/30"
          style={drawerMountedByDrag && !leftDrawerOpen ? { opacity: 0 } : undefined}
          onClick={closeLeftDrawer}
        />
        <aside
          ref={drawerAsideRef}
          style={drawerMountedByDrag && !leftDrawerOpen ? { transform: "translate3d(-100%, 0, 0)" } : undefined}
          className={`${drawerMountedByDrag || drawerClosing ? "" : "kt-explore-stack-enter-left"} relative z-10 flex h-full w-[min(78vw,390px)] min-w-[260px] max-w-sm transform-gpu flex-col overscroll-contain bg-white shadow-2xl [backface-visibility:hidden] [will-change:transform]`}
        >
          <header className="border-b border-slate-200 px-4 py-3">
            <div className="flex min-w-0 items-center gap-3">
              <button
                type="button"
                onClick={closeLeftDrawer}
                className="flex h-10 w-10 flex-none items-center justify-center rounded-full border border-slate-200 bg-white text-xl font-black text-slate-800 shadow-sm"
                aria-label={t("explore.closeMenu")}
              >
                &larr;
              </button>
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-sky-700">KunThai</p>
                <h2 className="truncate text-lg font-semibold text-slate-950">{t("explore.socialMenu")}</h2>
              </div>
            </div>
          </header>
          <SocialMenuContent
            compact
            currentProfile={profile}
            spaces={spaceProfiles}
            spaceActivity={spaceActivity}
            onClose={closeLeftDrawer}
            onCreateSpace={() => openMenuScreen("CreateSpace")}
            onNavigate={(screen, options) => {
              setLeftDrawerOpen(false);
              openMenuScreen(screen, options);
            }}
            onSelectIdentity={switchExploreIdentity}
          />
        </aside>
      </div>,
      document.body,
    ) : null}
    {/* Portalled to <body>: the page-transition wrapper around Explore is a
        containing block for position:fixed children (it animates a transform),
        so an overlay rendered in place would be pinned to the top of the
        scrolled page instead of the screen — the profile opened invisibly
        above the viewport. */}
    {menuOverlayVisible ? createPortal(
      <div
        ref={fullScreenSwipeRef}
        data-local-back-swipe="true"
        className={`kt-mobile-screen fixed inset-0 z-[80] w-full max-w-full touch-pan-y overscroll-x-none overflow-hidden bg-transparent ${
          messageConversationActive ? "" : "kuntai-safe-bottom"
        }`}
      >
        {renderMenuStack()}
      </div>,
      document.body,
    ) : null}
    </>
  );
}

function ExploreProfileError({ message }) {
  useUiLocale();
  return (
    <div className="px-4 py-4 sm:px-5 lg:px-8">
      <div className="rounded-[24px] border border-rose-100 bg-white p-5 text-sm font-bold text-rose-700 shadow-sm">
        {translateUi(message)}
      </div>
    </div>
  );
}
