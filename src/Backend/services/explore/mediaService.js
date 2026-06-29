import supabase from "../../lib/supabaseClient";
import { EXPLORE_MEDIA_BUCKET } from "./constants";

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

export async function uploadMediaFile(file, mediaType, userId) {
  if (!file) {
    return "";
  }

  const fallback = mediaType === "image" || mediaType === "profile" ? "jpg" : mediaType === "video" ? "mp4" : "webm";
  const extension = getFileExtensionFromMime(file.type, fallback);
  const filePath = `${userId}/${mediaType}-${Date.now()}.${extension}`;

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

  if (lastError) throw lastError;

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
