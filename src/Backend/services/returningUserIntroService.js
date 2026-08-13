export const RETURNING_USER_INTRO_AWAY_MS = 30 * 60 * 1000;

const ACTIVITY_KEY_PREFIX = "kunthai.returningIntro.lastActivity:";

function activityKey(userId) {
  return `${ACTIVITY_KEY_PREFIX}${String(userId || "")}`;
}

export function readReturningUserActivity(userId) {
  if (!userId || typeof localStorage === "undefined") return 0;
  try {
    return Number(localStorage.getItem(activityKey(userId)) || 0);
  } catch {
    return 0;
  }
}

export function markReturningUserActivity(userId, timestamp = Date.now()) {
  if (!userId || typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(activityKey(userId), String(Number(timestamp) || Date.now()));
  } catch {
    // Storage failures only disable the optional returning-user intro.
  }
}

export function shouldShowReturningUserIntro(userId, now = Date.now(), lastActivity = readReturningUserActivity(userId)) {
  const previous = Number(lastActivity || 0);
  return Boolean(userId && previous > 0 && Number(now) - previous >= RETURNING_USER_INTRO_AWAY_MS);
}
