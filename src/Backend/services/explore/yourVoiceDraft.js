// A Your Voice form saved with "Save draft", on this device and per account,
// until it is sent or cleared. Files cannot be stored: a screenshot or voice
// note is added again.

const PREFIX = "kunthai.yourVoice.draft.";

function target(store) {
  if (store) return store;
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

export function readVoiceDraft(userId, store) {
  const storage = target(store);
  if (!userId || !storage) return null;
  try {
    const draft = JSON.parse(storage.getItem(PREFIX + userId) || "null");
    return draft && typeof draft === "object" && draft.form && typeof draft.form === "object" ? draft : null;
  } catch {
    return null;
  }
}

export function writeVoiceDraft(userId, form, currentScreen, store, now = Date.now()) {
  const storage = target(store);
  if (!userId || !storage) return false;
  try {
    storage.setItem(PREFIX + userId, JSON.stringify({ form, currentScreen, savedAt: now }));
    return true;
  } catch {
    return false;
  }
}

export function clearVoiceDraft(userId, store) {
  const storage = target(store);
  if (!userId || !storage) return;
  try {
    storage.removeItem(PREFIX + userId);
  } catch {
    // Nothing to clear.
  }
}
