import { useEffect, useState } from "react";

import {
  EXPLORE_SETTINGS_EVENT,
  clearExploreLocalCache,
  fetchExploreSettings,
  mergeSettings,
  readExploreSettings,
  updateExploreSettings,
} from "../services/explore/preferencesService";
import { EXPLORE_ACCOUNT_CACHE_RESET_EVENT } from "../services/explore/accountCache.js";
import { isConnectionFailure, shortErrorToast } from "../services/friendlyErrorService";
import { showToast } from "../services/toastService";
import { updatePrivacySettings } from "../services/explore/safetyService";
import { hideCurrentExploreMessageActivity } from "../services/explore/messageService";
import { t as i18nText } from "../../i18n/index";

const SETTINGS_STORAGE_KEY = "explore-user-settings";

// Calls back with the latest stored settings whenever any screen, another tab
// or an account change updates them.
export function subscribeExploreSettings(callback) {
  if (typeof window === "undefined") return () => {};
  const onUpdate = (event) => callback(event?.detail ? mergeSettings(event.detail) : readExploreSettings());
  const onStorage = (event) => {
    if (!event.key || event.key === SETTINGS_STORAGE_KEY) callback(readExploreSettings());
  };
  const onReset = () => callback(readExploreSettings());
  window.addEventListener(EXPLORE_SETTINGS_EVENT, onUpdate);
  window.addEventListener("storage", onStorage);
  window.addEventListener(EXPLORE_ACCOUNT_CACHE_RESET_EVENT, onReset);
  return () => {
    window.removeEventListener(EXPLORE_SETTINGS_EVENT, onUpdate);
    window.removeEventListener("storage", onStorage);
    window.removeEventListener(EXPLORE_ACCOUNT_CACHE_RESET_EVENT, onReset);
  };
}

// Live, read-only settings for components that only apply them (video, feed).
export function useExploreSettingsSnapshot() {
  const [settings, setSettings] = useState(readExploreSettings);
  useEffect(() => subscribeExploreSettings(setSettings), []);
  return settings;
}

export function useExplorePreferences() {
  const settings = useExploreSettingsSnapshot();
  const [feedback, setFeedback] = useState("");

  useEffect(() => {
    // The result arrives through EXPLORE_SETTINGS_EVENT when the server has newer values.
    fetchExploreSettings().catch(() => {});
  }, []);

  async function updateSection(section, patch) {
    const privacyPatch = {};
    if (section === "messages" && Object.hasOwn(patch, "showActiveStatus")) {
      privacyPatch.showActivity = Boolean(patch.showActiveStatus);
    }
    if (section === "feed" && Object.hasOwn(patch, "showSensitiveWarnings")) {
      privacyPatch.filterSensitiveContent = Boolean(patch.showSensitiveWarnings);
    }

    try {
      const [result] = await Promise.all([
        updateExploreSettings({ [section]: patch }),
        Object.keys(privacyPatch).length ? updatePrivacySettings(privacyPatch) : Promise.resolve(),
        privacyPatch.showActivity === false ? hideCurrentExploreMessageActivity() : Promise.resolve(),
      ]);
      if (result?.synced) {
        setFeedback(i18nText("exploreSettingsFix.settingsSavedAccount"));
        showToast("Settings updated.", "success");
      } else {
        setFeedback(i18nText("exploreSettingsFix.settingsSavedDevice"));
        showToast(i18nText("exploreSettingsFix.toastSavedOnDevice"), "info");
      }
    } catch (error) {
      // The change is kept on this device; say plainly that the account did not get it.
      setFeedback(i18nText("exploreSettingsFix.settingsSyncFailed"));
      showToast(
        isConnectionFailure(error)
          ? shortErrorToast(error, i18nText("exploreSettingsFix.toastSavedOnDevice"))
          : i18nText("exploreSettingsFix.toastSavedOnDevice"),
        "warning",
      );
    }
  }

  function clearCache() {
    clearExploreLocalCache();
    setFeedback("Local Explore cache cleared.");
    showToast("Explore cache cleared", "success");
  }

  return {
    clearCache,
    feedback,
    settings,
    updateSection,
  };
}
