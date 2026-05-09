import { useEffect, useState } from "react";

import {
  clearExploreLocalCache,
  fetchExploreSettings,
  readExploreSettings,
  updateExploreSettings,
} from "../services/explore/preferencesService";
import { showToast } from "../services/toastService";

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
      const next = await updateExploreSettings({ [section]: nextSection });
      setSettings(next);
      setFeedback("Settings updated.");
      showToast("Settings updated.", "success");
    } catch (error) {
      setFeedback(error.message || "Settings saved on this device.");
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
