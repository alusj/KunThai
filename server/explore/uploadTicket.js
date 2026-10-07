// Upload tickets for Explore media (POST /api/explore-upload).
//
// Storage refused the signed-in person's own token on uploads ("Invalid
// Compact JWS") while the rest of Supabase accepted it. The server checks who
// the person is, then asks Storage (with the service role) for a one-time
// signed upload URL inside that person's own folder. The phone uploads with
// that ticket, which Storage checks instead of the person's token.

export const EXPLORE_MEDIA_BUCKET = "explore-media";
export const MAX_EXPLORE_UPLOAD_BYTES = 50 * 1024 * 1024;

const EXTENSIONS = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "audio/webm": "webm",
  "audio/mpeg": "mp3",
  "audio/mp4": "m4a",
  "audio/ogg": "ogg",
  "audio/wav": "wav",
  "video/mp4": "mp4",
  "video/webm": "webm",
  "video/quicktime": "mov",
  "video/x-m4v": "m4v",
};
const MEDIA_TYPES = { video: "video/", image: "image/", profile: "image/", audio: "audio/" };

export class UploadTicketError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

// Validates the request and returns the storage path for this person's file.
export function planUpload({ userId, mediaType, contentType, size, now = Date.now(), nonce = "" }) {
  const kind = String(mediaType || "");
  const type = String(contentType || "").split(";")[0].trim().toLowerCase();
  const bytes = Number(size || 0);
  if (!userId) throw new UploadTicketError(401, "unauthenticated", "Sign in again to continue.");
  if (!MEDIA_TYPES[kind]) throw new UploadTicketError(400, "bad_media_type", "This kind of file cannot be posted.");
  if (type && !type.startsWith(MEDIA_TYPES[kind])) throw new UploadTicketError(400, "bad_content_type", "This kind of file cannot be posted.");
  if (!Number.isFinite(bytes) || bytes <= 0) throw new UploadTicketError(400, "bad_size", "This file is empty.");
  if (bytes > MAX_EXPLORE_UPLOAD_BYTES) {
    throw new UploadTicketError(413, "too_large", "KunThai accepts files up to 50MB; trim or compress it and try again.");
  }
  const fallback = kind === "video" ? "mp4" : kind === "audio" ? "webm" : "jpg";
  const extension = EXTENSIONS[type] || fallback;
  const suffix = String(nonce || "").replace(/[^a-z0-9]/gi, "").slice(0, 12);
  return {
    path: `${userId}/${kind}-${now}${suffix ? `-${suffix}` : ""}.${extension}`,
    contentType: type || `${MEDIA_TYPES[kind]}${extension}`,
  };
}
