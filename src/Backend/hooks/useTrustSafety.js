import { useState } from "react";

import {
  blockExploreUser,
  readBlockedUsers,
  readPrivacySettings,
  unblockExploreUser,
  writePrivacySettings,
} from "../services/explore/safetyService";

export function useTrustSafety() {
  const [blockedUsers, setBlockedUsers] = useState(readBlockedUsers);
  const [privacySettings, setPrivacySettings] = useState(readPrivacySettings);
  const [feedback, setFeedback] = useState("");

  async function blockUser(userId, reason) {
    try {
      const next = await blockExploreUser(userId, reason);
      setBlockedUsers(new Set(next));
      setFeedback("User blocked.");
    } catch (error) {
      setFeedback(error.message || "Unable to block user.");
    }
  }

  async function unblockUser(userId) {
    try {
      const next = await unblockExploreUser(userId);
      setBlockedUsers(new Set(next));
      setFeedback("User unblocked.");
    } catch (error) {
      setFeedback(error.message || "Unable to unblock user.");
    }
  }

  function updatePrivacySettings(patch) {
    const next = writePrivacySettings({ ...privacySettings, ...patch });
    setPrivacySettings(next);
    setFeedback("Privacy settings updated.");
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
