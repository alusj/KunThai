import supabase from "../../lib/supabaseClient";
import { isMissingTable } from "./errors";

const EXPLORE_SETTINGS_KEY = "explore-user-settings";
const PREFERENCES_TABLE = "explore_user_preferences";
export const EXPLORE_SETTINGS_EVENT = "kuntai-explore-settings-updated";

export const DEFAULT_EXPLORE_SETTINGS = {
  notifications: {
    reactions: true,
    comments: true,
    mentions: true,
    follows: true,
    messages: true,
    followedPosts: true,
    milestones: true,
    safetyAlerts: true,
  },
  video: {
    autoplay: true,
    defaultMuted: false,
    reduceData: false,
  },
  feed: {
    defaultTab: "UrFeed",
    language: "auto",
    showSuggestedAccounts: true,
    showSensitiveWarnings: true,
  },
  messages: {
    showTypingStatus: true,
    showActiveStatus: true,
    allowVoiceNotes: true,
    readReceipts: true,
  },
  account: {
    compactMenu: false,
  },
};

function mergeSettings(settings = {}) {
  return {
    notifications: { ...DEFAULT_EXPLORE_SETTINGS.notifications, ...(settings.notifications || {}) },
    video: { ...DEFAULT_EXPLORE_SETTINGS.video, ...(settings.video || {}) },
    feed: { ...DEFAULT_EXPLORE_SETTINGS.feed, ...(settings.feed || {}) },
    messages: { ...DEFAULT_EXPLORE_SETTINGS.messages, ...(settings.messages || {}) },
    account: { ...DEFAULT_EXPLORE_SETTINGS.account, ...(settings.account || {}) },
  };
}

async function getCurrentUserId() {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return user?.id || "";
}

export function readExploreSettings() {
  try {
    const value = JSON.parse(localStorage.getItem(EXPLORE_SETTINGS_KEY) || "null");
    return mergeSettings(value && typeof value === "object" ? value : {});
  } catch {
    return DEFAULT_EXPLORE_SETTINGS;
  }
}

export function writeExploreSettings(settings) {
  const next = mergeSettings(settings);
  localStorage.setItem(EXPLORE_SETTINGS_KEY, JSON.stringify(next));
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(EXPLORE_SETTINGS_EVENT, { detail: next }));
  }
  return next;
}

export async function fetchExploreSettings() {
  const localSettings = readExploreSettings();
  const userId = await getCurrentUserId();

  if (!userId) {
    return localSettings;
  }

  const { data, error } = await supabase
    .from(PREFERENCES_TABLE)
    .select("settings")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    if (isMissingTable(error)) {
      return localSettings;
    }
    throw error;
  }

  if (!data?.settings) {
    return localSettings;
  }

  return writeExploreSettings(data.settings);
}

export async function updateExploreSettings(patch) {
  const next = writeExploreSettings({ ...readExploreSettings(), ...patch });
  const userId = await getCurrentUserId();

  if (!userId) {
    return next;
  }

  const { error } = await supabase.from(PREFERENCES_TABLE).upsert(
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

export function clearExploreLocalCache() {
  [
    "explore-navigation",
    "explore-recent-searches",
    "explore-post-draft",
    "explore-message-activity",
    "explore-posting-jobs",
  ].forEach((key) => localStorage.removeItem(key));
}
