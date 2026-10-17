// What the one-request upload's watchdog does on each tick (pure, so it runs
// under `node --test`; mediaService.js owns the request).
//
// While bytes are still going out, silence for UPLOAD_STALL_MS means the
// request is stuck: stop it and continue.
//
// Once every byte is reported sent, silence is normal: the storage server is
// saving the file, and on iPhone the progress can report "all sent" while iOS
// is still transmitting from its own buffer. Stopping then threw away uploads
// that were about to finish (the "stuck at 56%" advert videos, which were in
// fact stored). So the watchdog asks storage whether the file is there every
// VERIFY_EVERY_MS, and only gives up after FINISH_WAIT_MS.

export const UPLOAD_STALL_MS = 40_000;
export const FINISH_WAIT_MS = 3 * 60_000;
export const VERIFY_EVERY_MS = 8_000;
// Give the server's own answer a moment before asking.
export const FIRST_VERIFY_AFTER_MS = 4_000;

// -> "wait" | "verify" | "stall"
export function directUploadWatchdogAction({
  now,
  lastProgressAt,
  allSentAt = 0,
  lastVerifyAt = 0,
  verifying = false,
} = {}) {
  if (!allSentAt) {
    return now - lastProgressAt >= UPLOAD_STALL_MS ? "stall" : "wait";
  }
  if (now - allSentAt >= FINISH_WAIT_MS) return "stall";
  if (verifying || now - allSentAt < FIRST_VERIFY_AFTER_MS) return "wait";
  return now - lastVerifyAt >= VERIFY_EVERY_MS ? "verify" : "wait";
}

// A HEAD answer for the uploaded object: stored when it exists with the full
// size (a size the server doesn't report is accepted).
export function isStoredObjectResponse({ ok = false, status = 0, contentLength = null } = {}, expectedBytes = 0) {
  if (!ok || status < 200 || status >= 300) return false;
  const length = contentLength === null || contentLength === undefined || contentLength === "" ? NaN : Number(contentLength);
  if (!Number.isFinite(length) || !expectedBytes) return true;
  return length === Number(expectedBytes);
}
