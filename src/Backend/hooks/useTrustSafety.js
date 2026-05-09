import { useEffect, useState } from "react";

import {
  blockExploreUser,
  readBlockedUsers,
  fetchPrivacySettings,
  readPrivacySettings,
  unblockExploreUser,
  updatePrivacySettings as syncPrivacySettings,
} from "../services/explore/safetyService";
import { showToast } from "../services/toastService";

export function useTrustSafety() {
  const [blockedUsers, setBlockedUsers] = useState(readBlockedUsers);
  const [privacySettings, setPrivacySettings] = useState(readPrivacySettings);
  const [feedback, setFeedback] = useState("");

  useEffect(() => {
    let active = true;

    fetchPrivacySettings()
      .then((settings) => {
        if (active) setPrivacySettings(settings);
      })
      .catch(() => {});

    return () => {
      active = false;
    };
  }, []);

  async function blockUser(userId, reason) {
    try {
      const next = await blockExploreUser(userId, reason);
      setBlockedUsers(new Set(next));
      setFeedback("User blocked.");
      showToast("User blocked.", "success");
    } catch (error) {
      setFeedback(error.message || "Unable to block user.");
    }
  }

  async function unblockUser(userId) {
    try {
      const next = await unblockExploreUser(userId);
      setBlockedUsers(new Set(next));
      setFeedback("User unblocked.");
      showToast("User unblocked.", "success");
    } catch (error) {
      setFeedback(error.message || "Unable to unblock user.");
    }
  }

  async function updatePrivacySettings(patch) {
    const optimistic = { ...privacySettings, ...patch };
    setPrivacySettings(optimistic);

    try {
      const next = await syncPrivacySettings(optimistic);
      setPrivacySettings(next);
      setFeedback("Privacy settings updated.");
      showToast("Privacy settings updated.", "success");
    } catch (error) {
      setFeedback(error.message || "Privacy settings saved on this device.");
    }
  }

  return {
    blockedUsers,
    blockUser,
    feedback,
    privacySettings,
    unblockUser,
    updatePrivacySettings,
  };
}
