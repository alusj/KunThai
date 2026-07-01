import supabase from "../../lib/supabaseClient";
import * as tus from "tus-js-client";
import { EXPLORE_MEDIA_BUCKET } from "./constants";

export const MAX_EXPLORE_VIDEO_BYTES = 100 * 1024 * 1024;
const RESUMABLE_UPLOAD_THRESHOLD_BYTES = 6 * 1024 * 1024;
const RESUMABLE_CHUNK_BYTES = 6 * 1024 * 1024;

function getFileExtensionFromMime(mimeType, fallback = "bin") {
  const map = {
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
  };

  return map[mimeType] || fallback;
}

function dataUrlToBlob(dataUrl) {
  const match = String(dataUrl || "").match(/^data:([^;,]+)?(;base64)?,(.*)$/s);
  if (!match) throw new Error("Unable to prepare media for upload.");
  const mimeType = match[1] || "application/octet-stream";
  const binary = match[2] ? window.atob(match[3]) : decodeURIComponent(match[3]);
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  return new Blob([bytes], { type: mimeType });
}

function isRetryableUploadError(error) {
  const message = String(error?.message || error || "").toLowerCase();
  const status = Number(error?.statusCode || error?.status || 0);
  return !navigator.onLine || !status || status === 408 || status === 429 || status >= 500 ||
    message.includes("load failed") || message.includes("failed to fetch") || message.includes("network request failed") || message.includes("timeout");
}

function uploadDelay(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function getDirectStorageEndpoint() {
  const supabaseUrl = new URL(supabase.supabaseUrl);
  const projectId = supabaseUrl.hostname.split(".")[0];
  return `https://${projectId}.storage.supabase.co/storage/v1/upload/resumable`;
}

function normalizeUploadError(error, file) {
  const message = String(error?.message || error || "");
  const normalized = message.toLowerCase();
  if (normalized.includes("exceeded the maximum allowed size") || normalized.includes("maximum allowed size") || normalized.includes("entity too large")) {
    const sizeMb = Math.max(1, Math.ceil(Number(file?.size || 0) / (1024 * 1024)));
    return new Error(`This video is ${sizeMb}MB. KunThai accepts videos up to 100MB; compress the file and try again.`);
  }
  return error instanceof Error ? error : new Error(message || "Unable to upload media.");
}

async function uploadMediaFileResumable(file, filePath, options = {}) {
  const { data, error } = await supabase.auth.getSession();
  const accessToken = data?.session?.access_token;
  if (error || !accessToken) throw error || new Error("Sign in again before uploading this video.");

  await new Promise((resolve, reject) => {
    const upload = new tus.Upload(file, {
      endpoint: getDirectStorageEndpoint(),
      retryDelays: [0, 1_000, 3_000, 5_000, 10_000],
      headers: {
        authorization: `Bearer ${accessToken}`,
        "x-upsert": "false",
      },
      uploadDataDuringCreation: true,
      removeFingerprintOnSuccess: true,
      chunkSize: RESUMABLE_CHUNK_BYTES,
      metadata: {
        bucketName: EXPLORE_MEDIA_BUCKET,
        objectName: filePath,
        contentType: file.type || "application/octet-stream",
        cacheControl: "3600",
      },
      onError: (uploadError) => reject(normalizeUploadError(uploadError, file)),
      onProgress: (bytesUploaded, bytesTotal) => options.onProgress?.(bytesUploaded, bytesTotal),
      onSuccess: () => resolve(),
    });

    upload.findPreviousUploads()
      .then((previousUploads) => {
        if (previousUploads.length) upload.resumeFromPreviousUpload(previousUploads[0]);
        upload.start();
      })
      .catch(reject);
  });
}

export async function uploadMediaDataUrl(dataUrl, mediaType, userId) {
  const mediaUrl = String(dataUrl || "");
  const isLocalMediaUrl = mediaUrl.startsWith("data:") || mediaUrl.startsWith("blob:");

  if (!mediaUrl || !isLocalMediaUrl) {
    return dataUrl || "";
  }

  const blob = mediaUrl.startsWith("data:")
    ? dataUrlToBlob(mediaUrl)
    : await fetch(mediaUrl).then((response) => {
        if (!response.ok) throw new Error("Unable to prepare media for upload.");
        return response.blob();
      });
  return uploadMediaFile(blob, mediaType, userId);
}

export async function uploadMediaFile(file, mediaType, userId, options = {}) {
  if (!file) {
    return "";
  }

  const fallback = mediaType === "image" || mediaType === "profile" ? "jpg" : mediaType === "video" ? "mp4" : "webm";
  const extension = getFileExtensionFromMime(file.type, fallback);
  const filePath = `${userId}/${mediaType}-${Date.now()}.${extension}`;

  if (mediaType === "video" && Number(file.size || 0) > MAX_EXPLORE_VIDEO_BYTES) {
    throw normalizeUploadError(new Error("The object exceeded the maximum allowed size"), file);
  }

  if (Number(file.size || 0) > RESUMABLE_UPLOAD_THRESHOLD_BYTES) {
    await uploadMediaFileResumable(file, filePath, options);
    const { data } = supabase.storage.from(EXPLORE_MEDIA_BUCKET).getPublicUrl(filePath);
    return data?.publicUrl || "";
  }

  let lastError = null;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const { error } = await supabase.storage.from(EXPLORE_MEDIA_BUCKET).upload(filePath, file, {
        cacheControl: "3600",
        upsert: false,
        contentType: file.type || undefined,
      });

      if (!error) {
        lastError = null;
        break;
      }
      const errorMessage = String(error.message || "").toLowerCase();
      if (errorMessage.includes("already exists") || errorMessage.includes("duplicate")) {
        lastError = null;
        break;
      }
      if (errorMessage.includes("bucket")) throw new Error("Explore media bucket is not installed yet.");
      lastError = error;
    } catch (error) {
      lastError = error;
    }

    if (!isRetryableUploadError(lastError) || attempt === 2) break;
    await uploadDelay(800 * (attempt + 1));
  }

  if (lastError) throw normalizeUploadError(lastError, file);

  const { data } = supabase.storage.from(EXPLORE_MEDIA_BUCKET).getPublicUrl(filePath);
  return data?.publicUrl || "";
}

export async function removeUploadedMediaUrl(mediaUrl) {
  try {
    const url = new URL(String(mediaUrl || ""));
    const pathPrefix = `/storage/v1/object/public/${EXPLORE_MEDIA_BUCKET}/`;

    if (!url.pathname.startsWith(pathPrefix)) {
      return;
    }

    const filePath = decodeURIComponent(url.pathname.slice(pathPrefix.length));
    if (!filePath) {
      return;
    }

    const { error } = await supabase.storage.from(EXPLORE_MEDIA_BUCKET).remove([filePath]);
    if (error) {
      throw error;
    }
  } catch (error) {
    if (error instanceof TypeError) {
      return;
    }

    throw error;
  }
}
