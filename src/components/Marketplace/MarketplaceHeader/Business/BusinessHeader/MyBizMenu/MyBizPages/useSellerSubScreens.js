import { useCallback } from "react";

import { useBrowserBack } from "../../../../../../../Backend/hooks/useBrowserBack";
import { useNavigationStack } from "../../../../../../../Backend/hooks/useNavigationStack";

// Sub-screens of a seller menu page sit on a navigation stack with a
// browser-back layer (the SellerBoard pattern), so the back gesture returns to
// the parent page instead of closing the whole menu screen.
export function useSellerSubScreens(name) {
  const navigation = useNavigationStack("menu");
  const currentView = navigation.current.screen;
  const { push, reset } = navigation;
  const goBack = useBrowserBack(
    navigation.canPop,
    navigation.pop,
    `marketplace-seller-${name}-${navigation.entries.length}-${currentView}`,
  );
  const open = useCallback((screen) => {
    if (!screen || screen === "menu") reset("menu");
    else push({ screen });
  }, [push, reset]);

  return { currentView, open, goBack };
}
