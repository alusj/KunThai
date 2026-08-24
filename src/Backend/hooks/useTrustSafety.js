import { useEffect, useRef, useState } from "react";
import { friendlyErrorMessage } from "../services/friendlyErrorService";

import {
  blockExploreUser,
  fetchBlockedAccountSummaries,
  fetchBlockedIdentityKeys,
  fetchBlockedUsers,
  readBlockedUsers,
  fetchPrivacySettings,
  readPrivacySettings,
  unblockExploreIdentity,
  updatePrivacySettings as syncPrivacySettings,
} from "../services/explore/safetyService";
import { readExploreSettings, updateExploreSettings } from "../services/explore/preferencesService";
import { hideCurrentExploreMessageActivity } from "../services/explore/messageService";
import { showToast } from "../services/toastService";

export function useTrustSafety() {
  const [blockedUsers, setBlockedUsers] = useState(readBlockedUsers);
  const [blockedAccounts, setBlockedAccounts] = useState([]);
  const [blockedAccountsLoading, setBlockedAccountsLoading] = useState(true);
  const [privacySettings, setPrivacySettings] = useState(readPrivacySettings);
  const [feedback, setFeedback] = useState("");
  const [unblockingUsers, setUnblockingUsers] = useState(() => new Set());
  const [updatingSettings, setUpdatingSettings] = useState(() => new Set());
  const privacySettingsRef = useRef(privacySettings);

  useEffect(() => {
    privacySettingsRef.current = privacySettings;
  }, [privacySettings]);

  useEffect(() => {
    let active = true;

    fetchPrivacySettings()
      .then((settings) => {
        if (active) setPrivacySettings(settings);
      })
      .catch(() => {});

    fetchBlockedUsers()
      .then(() => fetchBlockedIdentityKeys())
      .then((blocked) => {
        if (active) setBlockedUsers(new Set(blocked));
      })
      .catch(() => {});

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    setBlockedAccountsLoading(true);
    fetchBlockedAccountSummaries(blockedUsers)
      .then((accounts) => {
        if (active) setBlockedAccounts(accounts);
      })
      .catch(() => {
        if (active) setBlockedAccounts([]);
      })
      .finally(() => {
        if (active) setBlockedAccountsLoading(false);
      });
    return () => {
      active = false;
    };
  }, [blockedUsers]);

  async function blockUser(userId, reason) {
    try {
      const next = await blockExploreUser(userId, reason);
      setBlockedUsers(new Set(next));
      setFeedback("User blocked.");
      showToast("User blocked.", "success");
    } catch (error) {
      setFeedback(friendlyErrorMessage(error, "Unable to block user."));
    }
  }

  async function unblockUser(userId) {
    const identityKey = typeof userId === "string" ? userId : userId?.key || userId?.id || "";
    if (!identityKey || unblockingUsers.has(identityKey)) return;
    setUnblockingUsers((current) => new Set(current).add(identityKey));
    try {
      const next = await unblockExploreIdentity(userId);
      setBlockedUsers(new Set(next));
      setFeedback("User unblocked.");
      showToast("User unblocked.", "success");
    } catch (error) {
      setFeedback(friendlyErrorMessage(error, "Unable to unblock user."));
      showToast(friendlyErrorMessage(error, "Unable to unblock user."), "danger");
    } finally {
      setUnblockingUsers((current) => {
        const next = new Set(current);
        next.delete(identityKey);
        return next;
      });
    }
  }

  async function updatePrivacySettings(patch) {
    const keys = Object.keys(patch || {});
    if (!keys.length) return;
    const optimistic = { ...privacySettingsRef.current, ...patch };
    privacySettingsRef.current = optimistic;
    setPrivacySettings(optimistic);
    setUpdatingSettings((current) => new Set([...current, ...keys]));

    try {
      const exploreSettings = readExploreSettings();
      const behaviorPatch = {};
      if (Object.hasOwn(patch, "showActivity")) {
        behaviorPatch.messages = { ...exploreSettings.messages, showActiveStatus: Boolean(patch.showActivity) };
      }
      if (Object.hasOwn(patch, "filterSensitiveContent")) {
        behaviorPatch.feed = { ...exploreSettings.feed, showSensitiveWarnings: Boolean(patch.filterSensitiveContent) };
      }

      const [next] = await Promise.all([
        syncPrivacySettings(optimistic),
        Object.keys(behaviorPatch).length ? updateExploreSettings(behaviorPatch) : Promise.resolve(),
        patch.showActivity === false ? hideCurrentExploreMessageActivity() : Promise.resolve(),
      ]);
      privacySettingsRef.current = next;
      setPrivacySettings(next);
      setFeedback("Privacy settings updated.");
      showToast("Privacy settings updated.", "success");
    } catch (error) {
      setFeedback(friendlyErrorMessage(error, "Privacy settings saved on this device."));
      showToast(friendlyErrorMessage(error, "Privacy setting was saved on this device, but could not sync yet."), "warning");
    } finally {
      setUpdatingSettings((current) => {
        const next = new Set(current);
        keys.forEach((key) => next.delete(key));
        return next;
      });
    }
  }

  return {
    blockedAccounts,
    blockedAccountsLoading,
    blockedUsers,
    blockUser,
    feedback,
    privacySettings,
    unblockingUsers,
    unblockUser,
    updatingSettings,
    updatePrivacySettings,
  };
}
