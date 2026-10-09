// Answers typed into a Join KunThai application are kept on this device (per
// account and application) until they reach KunThai, so closing the app or
// losing the connection mid-form loses nothing.

const PREFIX = "kunthai.join.draftAnswers.";

export function draftStorageKey(userId = "", applicationId = "") {
  return userId && applicationId ? `${PREFIX}${userId}.${applicationId}` : "";
}

function storage(store) {
  if (store) return store;
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

export function readLocalDraft(userId, applicationId, store) {
  const key = draftStorageKey(userId, applicationId);
  const target = storage(store);
  if (!key || !target) return null;
  try {
    const value = JSON.parse(target.getItem(key) || "null");
    return value && typeof value === "object" && value.answers && typeof value.answers === "object" ? value : null;
  } catch {
    return null;
  }
}

export function writeLocalDraft(userId, applicationId, answers = {}, store, now = Date.now()) {
  const key = draftStorageKey(userId, applicationId);
  const target = storage(store);
  if (!key || !target) return;
  try {
    if (!answers || !Object.keys(answers).length) {
      target.removeItem(key);
      return;
    }
    target.setItem(key, JSON.stringify({ answers, savedAt: now }));
  } catch {
    // Storage full or blocked: the form still works, only without the copy.
  }
}

export function clearLocalDraft(userId, applicationId, store) {
  const key = draftStorageKey(userId, applicationId);
  const target = storage(store);
  if (!key || !target) return;
  try {
    target.removeItem(key);
  } catch {
    // Nothing to clear.
  }
}

// The answers to show: the server's, with any unsaved local answer on top.
// restoredKeys lists the answers that came from this device.
export function mergeRestoredAnswers(serverAnswers = {}, localDraft = null) {
  const local = localDraft?.answers || {};
  const answers = { ...(serverAnswers || {}) };
  const restoredKeys = [];
  for (const [key, value] of Object.entries(local)) {
    if (JSON.stringify(answers[key] ?? null) !== JSON.stringify(value ?? null)) {
      answers[key] = value;
      restoredKeys.push(key);
    }
  }
  return { answers, restoredKeys };
}
