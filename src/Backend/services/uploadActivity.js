// Whether a large upload (an Explore video) is in flight right now.
//
// Background refreshers poll Supabase every 20 seconds. On a slow phone
// connection those requests compete with the upload for the same bandwidth, so
// they skip their timed refresh while an upload runs. Realtime updates and
// user actions are unaffected.
let activeUploads = 0;

export function beginHeavyUpload() {
  activeUploads += 1;
  let ended = false;
  return function endHeavyUpload() {
    if (ended) return;
    ended = true;
    activeUploads = Math.max(0, activeUploads - 1);
  };
}

export function isHeavyUploadActive() {
  return activeUploads > 0;
}
