import supabase from "../../lib/supabaseClient";
import { isMissingTable } from "./errors";

const BLOCKED_USERS_KEY = "explore-blocked-users";
const PRIVACY_SETTINGS_KEY = "explore-privacy-settings";
const PRIVACY_TABLE = "explore_user_privacy_settings";
const ACTION_LIMIT_KEY = "explore-safety-actions";

const DEFAULT_PRIVACY_SETTINGS = {
  defaultPostPrivacy: "public",
  allowMessages: "followers",
  showActivity: true,
  allowMentions: true,
  filterSensitiveContent: true,
};

function readArray(key) {
  try {
    const value = JSON.parse(localStorage.getItem(key) || "[]");
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

function writeArray(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

async function getCurrentUserId() {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return user?.id || "";
}

export function readBlockedUsers() {
  return new Set(readArray(BLOCKED_USERS_KEY));
}

export function writeBlockedUsers(value) {
  writeArray(BLOCKED_USERS_KEY, Array.from(value));
}

export function blockUserLocally(userId) {
  if (!userId) return readBlockedUsers();
  const next = readBlockedUsers();
  next.add(userId);
  writeBlockedUsers(next);
  return next;
}

export function unblockUserLocally(userId) {
  const next = readBlockedUsers();
  next.delete(userId);
  writeBlockedUsers(next);
  return next;
}

export async function blockExploreUser(targetUserId, reason = "blocked from Explore") {
  const userId = await getCurrentUserId();
  const next = blockUserLocally(targetUserId);

  if (!userId || !targetUserId || userId === targetUserId) {
    return next;
  }

  const { error } = await supabase.from("explore_user_blocks").upsert(
    {
      blocker_id: userId,
      blocked_id: targetUserId,
      reason,
    },
    { onConflict: "blocker_id,blocked_id" },
  );

  if (error && !isMissingTable(error)) {
    throw error;
  }

  return next;
}

export async function unblockExploreUser(targetUserId) {
  const userId = await getCurrentUserId();
  const next = unblockUserLocally(targetUserId);

  if (!userId || !targetUserId) {
    return next;
  }

  const { error } = await supabase
    .from("explore_user_blocks")
    .delete()
    .eq("blocker_id", userId)
    .eq("blocked_id", targetUserId);

  if (error && !isMissingTable(error)) {
    throw error;
  }

  return next;
}

export function readPrivacySettings() {
  try {
    const value = JSON.parse(localStorage.getItem(PRIVACY_SETTINGS_KEY) || "null");
    return value && typeof value === "object"
      ? { ...DEFAULT_PRIVACY_SETTINGS, ...value }
      : DEFAULT_PRIVACY_SETTINGS;
  } catch {
    return DEFAULT_PRIVACY_SETTINGS;
  }
}

export function writePrivacySettings(settings) {
  const next = { ...DEFAULT_PRIVACY_SETTINGS, ...settings };
  localStorage.setItem(PRIVACY_SETTINGS_KEY, JSON.stringify(next));
  return next;
}

export async function fetchPrivacySettings() {
  const localSettings = readPrivacySettings();
  const userId = await getCurrentUserId();

  if (!userId) {
    return localSettings;
  }

  const { data, error } = await supabase
    .from(PRIVACY_TABLE)
    .select("settings")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    if (isMissingTable(error)) {
      return localSettings;
    }
    throw error;
  }

  return data?.settings ? writePrivacySettings(data.settings) : localSettings;
}

export async function updatePrivacySettings(settings) {
  const next = writePrivacySettings(settings);
  const userId = await getCurrentUserId();

  if (!userId) {
    return next;
  }

  const { error } = await supabase.from(PRIVACY_TABLE).upsert(
    {
      user_id: userId,
      settings: next,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" },
  );

  if (error && !isMissingTable(error)) {
    throw error;
  }

  return next;
}

export function canRunSafetyAction(action, limit = 8) {
  const now = Date.now();
  const windowMs = 60 * 1000;
  const actions = readArray(ACTION_LIMIT_KEY).filter((item) => now - item.time < windowMs);
  const actionCount = actions.filter((item) => item.action === action).length;

  if (actionCount >= limit) {
    writeArray(ACTION_LIMIT_KEY, actions);
    return false;
  }

  writeArray(ACTION_LIMIT_KEY, [...actions, { action, time: now }]);
  return true;
}

export function contentHasModerationFlags(value) {
  const text = String(value || "").toLowerCase();
  const patterns = [
    "child abuse",
    "explicit nude",
    "kill yourself",
    "nude",
    "porn",
    "scam",
    "terror",
  ];

  return patterns.filter((pattern) => text.includes(pattern));
}

export async function moderateExplorePost({ body = "", media = {}, signal = undefined }) {
  const response = await fetch(`${window.location.origin}/api/moderate-post`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    signal,
    body: JSON.stringify({
      body,
      media,
    }),
  });

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(data?.reason || "Unable to complete safety review.");
  }

  return data;
}

export function buildModerationMediaPayload(media = {}) {
  const videoFrameDataUrls = Array.isArray(media.videoFrameDataUrls) ? media.videoFrameDataUrls : [];

  return {
    hasMedia: Boolean(media.imageDataUrl || media.videoDataUrl || media.videoUrl || videoFrameDataUrls.length || media.audioDataUrl),
    imageDataUrl: media.imageDataUrl || "",
    videoDataUrl: media.videoDataUrl || "",
    videoUrl: media.videoUrl || "",
    videoFrameDataUrls,
    videoFrameExtractionFailed: Boolean(media.videoFrameExtractionFailed),
    videoReviewRequired: Boolean(media.videoReviewRequired),
    audioDataUrl: media.audioDataUrl || "",
    imageName: media.imageName || "",
    videoName: media.videoName || "",
    audioName: media.audioName || "",
    imageType: media.imageType || "",
    videoType: media.videoType || "",
    audioType: media.audioType || "",
  };
}
