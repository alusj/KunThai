import { useEffect, useState } from "react";
import { friendlyErrorMessage } from "../services/friendlyErrorService";

import {
  clearExploreLocalCache,
  fetchExploreSettings,
  readExploreSettings,
  updateExploreSettings,
} from "../services/explore/preferencesService";
import { showToast } from "../services/toastService";
import {
  readPrivacySettings,
  updatePrivacySettings,
} from "../services/explore/safetyService";
import { hideCurrentExploreMessageActivity } from "../services/explore/messageService";

export function useExplorePreferences() {
  const [settings, setSettings] = useState(readExploreSettings);
  const [feedback, setFeedback] = useState("");

  useEffect(() => {
    let active = true;

    fetchExploreSettings()
      .then((next) => {
        if (active) setSettings(next);
      })
      .catch(() => {});

    return () => {
      active = false;
    };
  }, []);

  async function updateSection(section, patch) {
    const nextSection = { ...(settings[section] || {}), ...patch };
    const optimistic = { ...settings, [section]: nextSection };
    setSettings(optimistic);

    try {
      const privacyPatch = {};
      if (section === "messages" && Object.hasOwn(patch, "showActiveStatus")) {
        privacyPatch.showActivity = Boolean(patch.showActiveStatus);
      }
      if (section === "feed" && Object.hasOwn(patch, "showSensitiveWarnings")) {
        privacyPatch.filterSensitiveContent = Boolean(patch.showSensitiveWarnings);
      }
      const [next] = await Promise.all([
        updateExploreSettings({ [section]: nextSection }),
        Object.keys(privacyPatch).length
          ? updatePrivacySettings({ ...readPrivacySettings(), ...privacyPatch })
          : Promise.resolve(),
        privacyPatch.showActivity === false ? hideCurrentExploreMessageActivity() : Promise.resolve(),
      ]);
      setSettings(next);
      setFeedback("Settings updated.");
      showToast("Settings updated.", "success");
    } catch (error) {
      setFeedback(friendlyErrorMessage(error, "Settings saved on this device."));
    }
  }

  function clearCache() {
    clearExploreLocalCache();
    setFeedback("Local Explore cache cleared.");
    showToast("Local Explore cache cleared.", "success");
  }

  return {
    clearCache,
    feedback,
    settings,
    updateSection,
  };
}
