// Pure Explore settings model (no imports, safe in node tests).

export const DEFAULT_EXPLORE_SETTINGS = Object.freeze({
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
  account: {},
  feedbackFx: {
    sounds: true,
    vibration: true,
    banners: true,
    explore: true,
    messages: true,
    marketplace: true,
    transport: true,
  },
});

const SECTIONS = Object.keys(DEFAULT_EXPLORE_SETTINGS);

function plainObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

export function mergeSettings(settings = {}) {
  const source = plainObject(settings);
  return Object.fromEntries(
    SECTIONS.map((section) => [section, { ...DEFAULT_EXPLORE_SETTINGS[section], ...plainObject(source[section]) }]),
  );
}

// Applies { section: { key: value } } onto settings, key by key, so a patch
// for one toggle never resets the rest of its section.
export function applySettingsPatch(settings, patch = {}) {
  const base = mergeSettings(settings);
  const next = { ...base };
  Object.entries(plainObject(patch)).forEach(([section, values]) => {
    if (!SECTIONS.includes(section)) return;
    next[section] = { ...base[section], ...plainObject(values) };
  });
  return mergeSettings(next);
}

// A server row only counts as saved settings when it holds at least one section.
export function hasServerSettings(value) {
  return Object.keys(plainObject(value)).some((key) => SECTIONS.includes(key));
}
