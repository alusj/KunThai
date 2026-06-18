import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { readExploreSettings } from "../services/explore/preferencesService";
import { readExploreNavigation, writeExploreNavigation } from "../services/explore/navigationService";

const PARENT_TABS = new Set(["UrFeed", "Swip", "Connections"]);

export function useExploreNavigation(menuScreens) {
  const savedScrollRef = useRef(Number(sessionStorage.getItem("exploreFeedScrollY") || 0));
  const [navigation, setNavigation] = useState(() => {
    const savedNavigation = readExploreNavigation();
    const settings = readExploreSettings();
    return {
      ...savedNavigation,
      activeTab: PARENT_TABS.has(savedNavigation.activeTab) ? savedNavigation.activeTab : settings.feed.defaultTab,
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
        window.scrollTo({ top: 0, behavior: "instant" });
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
