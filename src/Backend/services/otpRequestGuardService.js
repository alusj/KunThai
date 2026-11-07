// Client-side OTP request pacing shared by account creation and password
// recovery. It mirrors the server limit in the otp-delivery function (5 codes
// per number per rolling hour): the fifth code in an hour is the last one, and
// the next can be requested once an hour has passed since the first. The
// server also caps codes at 10 per 24 hours and answers with its own message.
// The floating "stay near your device" card is triggered by the `isLast`
// flag (also returned as `isSecond` for existing callers).

const STORAGE_PREFIX = "kunthai.otpRequests:";
const MAX_OTP_REQUESTS = 5;
const COUNT_WINDOW_MS = 60 * 60 * 1000;

function storageKey(phone) {
  return `${STORAGE_PREFIX}${String(phone || "").replace(/\D/g, "")}`;
}

function readEntry(phone) {
  try {
    const entry = JSON.parse(localStorage.getItem(storageKey(phone)) || "null");
    if (!entry || typeof entry !== "object") return null;
    return entry;
  } catch {
    return null;
  }
}

function writeEntry(phone, entry) {
  try {
    localStorage.setItem(storageKey(phone), JSON.stringify(entry));
  } catch {
    // Guarding is best-effort; Supabase still rate limits on the server.
  }
}

export function formatOtpWaitTime(blockedUntil) {
  const remainingMs = Math.max(0, Number(blockedUntil || 0) - Date.now());
  const hours = Math.ceil(remainingMs / (60 * 60 * 1000));
  if (hours >= 2) return `${hours} hours`;
  const minutes = Math.max(1, Math.ceil(remainingMs / (60 * 1000)));
  return hours === 1 && minutes > 60 ? "1 hour" : `${minutes} minutes`;
}

export function getOtpBlockState(phone) {
  const entry = readEntry(phone);
  if (!entry?.blockedUntil) return { blocked: false, blockedUntil: 0 };
  if (Date.now() >= entry.blockedUntil) return { blocked: false, blockedUntil: 0 };
  return { blocked: true, blockedUntil: entry.blockedUntil };
}

// Call BEFORE sending an OTP. Throws a friendly error while the number is in
// its 72-hour cooldown; otherwise records the request and reports whether this
// is the final allowed OTP (the second one).
export function registerOtpRequest(phone) {
  const now = Date.now();
  const existing = readEntry(phone);

  if (existing?.blockedUntil && now < existing.blockedUntil) {
    const error = new Error(
      `OTP limit reached for this number. You can request a new code in ${formatOtpWaitTime(existing.blockedUntil)}.`,
    );
    error.code = "otp_rate_limited";
    error.blockedUntil = existing.blockedUntil;
    throw error;
  }

  const withinWindow = existing && now - Number(existing.firstAt || 0) < COUNT_WINDOW_MS && !existing.blockedUntil;
  const count = (withinWindow ? Number(existing.count || 0) : 0) + 1;
  const firstAt = withinWindow ? Number(existing.firstAt) : now;
  const entry = {
    count,
    firstAt,
    blockedUntil: count >= MAX_OTP_REQUESTS ? firstAt + COUNT_WINDOW_MS : 0,
  };
  writeEntry(phone, entry);

  const isLast = count === MAX_OTP_REQUESTS;
  return { count, isLast, isSecond: isLast, blockedUntil: entry.blockedUntil };
}

// A successful verification releases the guard so the next legitimate flow
// (e.g. a future recovery) starts fresh.
export function clearOtpRequests(phone) {
  try {
    localStorage.removeItem(storageKey(phone));
  } catch {
    // Best-effort cleanup.
  }
}
