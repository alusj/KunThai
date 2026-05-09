import { useEffect, useMemo, useState } from "react";

import { readExploreSettings } from "../services/explore/preferencesService";
import { readExploreNavigation, writeExploreNavigation } from "../services/explore/navigationService";

const PARENT_TABS = new Set(["UrFeed", "Swip", "Connections"]);

export function useExploreNavigation(menuScreens) {
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

  return useMemo(
    () => ({
      activeTab: PARENT_TABS.has(navigation.activeTab) ? navigation.activeTab : "UrFeed",
      activeMenuScreen,
      menuScreen,
      isFullScreen: Boolean(activeMenuScreen && menuScreen),
      setActiveTab(tab) {
        if (!PARENT_TABS.has(tab)) {
          return;
        }

        setNavigation((current) => ({ ...current, activeTab: tab, menuStack: [] }));
      },
      openMenuScreen(screen, options = {}) {
        if (!menuScreens[screen]) {
          return;
        }

        setNavigation((current) => {
          const stack = options.fromMenu && current.menuStack.at(-1) !== "Menu"
            ? [...current.menuStack, "Menu", screen]
            : [...current.menuStack, screen];

          return { ...current, menuStack: stack };
        });
        window.scrollTo({ top: 0, behavior: "instant" });
      },
      goBackMenuScreen() {
        setNavigation((current) => ({ ...current, menuStack: current.menuStack.slice(0, -1) }));
        window.scrollTo({ top: 0, behavior: "instant" });
      },
      closeMenuScreens() {
        setNavigation((current) => ({ ...current, menuStack: [] }));
      },
      openComposer(type) {
        setNavigation((current) => ({ ...current, activeTab: "UrFeed", menuStack: [] }));
        window.scrollTo({ top: 0, behavior: "instant" });
        setTimeout(() => {
          window.dispatchEvent(new CustomEvent("explore-create-post", { detail: { type } }));
        }, 80);
      },
    }),
    [activeMenuScreen, menuScreen, menuScreens, navigation.activeTab],
  );
}
