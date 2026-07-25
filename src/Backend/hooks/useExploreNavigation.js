import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { readExploreSettings } from "../services/explore/preferencesService";
import { readExploreNavigation, writeExploreNavigation } from "../services/explore/navigationService";

const PARENT_TABS = new Set(["UrFeed", "Swip", "Connections"]);
// A fresh browser session (app launched anew) should open on the user's
// chosen "Default Explore tab". Within the same session we keep restoring the
// tab the user last left, so switching tabs still feels sticky.
const SESSION_STARTED_KEY = "exploreSessionStarted";

function resolveInitialTab(savedNavigation, settings) {
  const defaultTab = PARENT_TABS.has(settings.feed.defaultTab) ? settings.feed.defaultTab : "UrFeed";

  let freshSession = true;
  try {
    freshSession = !sessionStorage.getItem(SESSION_STARTED_KEY);
    sessionStorage.setItem(SESSION_STARTED_KEY, "1");
  } catch {
    freshSession = false;
  }

  // On a brand-new session honor the default tab; otherwise restore the last
  // tab the user was on (falling back to the default if it is somehow invalid).
  if (freshSession) return defaultTab;
  return PARENT_TABS.has(savedNavigation.activeTab) ? savedNavigation.activeTab : defaultTab;
}

export function useExploreNavigation(menuScreens) {
  const savedScrollRef = useRef(Number(sessionStorage.getItem("exploreFeedScrollY") || 0));
  const [navigation, setNavigation] = useState(() => {
    const savedNavigation = readExploreNavigation();
    const settings = readExploreSettings();
    return {
      ...savedNavigation,
      activeTab: resolveInitialTab(savedNavigation, settings),
    };
  });
  const activeMenuScreen = navigation.menuStack[navigation.menuStack.length - 1] || null;
  const menuScreen = activeMenuScreen ? menuScreens[activeMenuScreen] : null;

  useEffect(() => {
    writeExploreNavigation(navigation);
  }, [navigation]);

  const rememberScrollPosition = useCallback(() => {
    const nextScroll = window.scrollY || 0;
    savedScrollRef.current = nextScroll;
    sessionStorage.setItem("exploreFeedScrollY", String(nextScroll));
  }, []);

  const restoreScrollPosition = useCallback(() => {
    const nextScroll = savedScrollRef.current || Number(sessionStorage.getItem("exploreFeedScrollY") || 0);
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        window.scrollTo({ top: nextScroll, behavior: "instant" });
      });
    });
    // The immediate restore is a no-op while the overlay's body scroll lock
    // is still held (the exit animation keeps it for ~280ms), so re-apply
    // once the lock has released and the page can actually scroll again.
    window.setTimeout(() => {
      window.scrollTo({ top: nextScroll, behavior: "instant" });
    }, 360);
  }, []);

  return useMemo(
    () => ({
      activeTab: PARENT_TABS.has(navigation.activeTab) ? navigation.activeTab : "UrFeed",
      menuStack: navigation.menuStack,
      activeMenuScreen,
      menuScreen,
      isFullScreen: Boolean(activeMenuScreen && menuScreen),
      rememberScrollPosition,
      setActiveTab(tab) {
        if (!PARENT_TABS.has(tab)) {
          return;
        }

        rememberScrollPosition();
        setNavigation((current) => ({ ...current, activeTab: tab, menuStack: [] }));
      },
      openMenuScreen(screen, options = {}) {
        if (!menuScreens[screen]) {
          return;
        }

        rememberScrollPosition();
        setNavigation((current) => {
          if (current.menuStack.at(-1) === screen) {
            return current;
          }

          const stack = options.fromMenu && current.menuStack.at(-1) !== "Menu"
            ? [...current.menuStack, "Menu", screen]
            : [...current.menuStack, screen];

          return { ...current, menuStack: stack };
        });
        // The window deliberately keeps its scroll position: menu screens
        // render in a fixed overlay with their own scroll container, and the
        // body scroll lock captures the true feed offset so closing the
        // screen returns to the exact content the user left.
      },
      goBackMenuScreen() {
        setNavigation((current) => {
          const nextStack = current.menuStack.slice(0, -1);
          if (!nextStack.length) {
            restoreScrollPosition();
          } else {
            window.scrollTo({ top: 0, behavior: "instant" });
          }
          return { ...current, menuStack: nextStack };
        });
      },
      closeMenuScreens() {
        setNavigation((current) => ({ ...current, menuStack: [] }));
        restoreScrollPosition();
      },
      openComposer(type) {
        rememberScrollPosition();
        setNavigation((current) => ({ ...current, activeTab: "UrFeed", menuStack: [] }));
        window.scrollTo({ top: 0, behavior: "instant" });
        window.dispatchEvent(new CustomEvent("kuntai-explore-composer-visibility", {
          detail: { open: true },
        }));
        setTimeout(() => {
          window.dispatchEvent(new CustomEvent("explore-create-post", { detail: { type } }));
        }, 80);
      },
    }),
    [activeMenuScreen, menuScreen, menuScreens, navigation.activeTab, navigation.menuStack, rememberScrollPosition, restoreScrollPosition],
  );
}
