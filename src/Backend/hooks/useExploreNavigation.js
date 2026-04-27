import { useEffect, useMemo, useState } from "react";

import { readExploreNavigation, writeExploreNavigation } from "../services/explore/navigationService";

const PARENT_TABS = new Set(["UrFeed", "Swip", "Connections"]);

export function useExploreNavigation(menuScreens) {
  const [navigation, setNavigation] = useState(() => readExploreNavigation());
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
      openMenuScreen(screen) {
        if (!menuScreens[screen]) {
          return;
        }

        setNavigation((current) => ({ ...current, menuStack: [...current.menuStack, screen] }));
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
