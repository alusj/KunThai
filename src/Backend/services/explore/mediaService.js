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

export async function uploadMediaDataUrl(dataUrl, mediaType, userId) {
  if (!dataUrl || !String(dataUrl).startsWith("data:")) {
    return dataUrl || "";
  }

  const response = await fetch(dataUrl);
  const blob = await response.blob();
  const fallback = mediaType === "image" || mediaType === "profile" ? "jpg" : mediaType === "video" ? "mp4" : "webm";
  const extension = getFileExtensionFromMime(blob.type, fallback);
  const filePath = `${userId}/${mediaType}-${Date.now()}.${extension}`;

  const { error } = await supabase.storage.from(EXPLORE_MEDIA_BUCKET).upload(filePath, blob, {
    cacheControl: "3600",
    upsert: false,
    contentType: blob.type || undefined,
  });

  if (error) {
    if (error.message?.toLowerCase?.().includes("bucket")) {
      throw new Error("Explore media bucket is not installed yet.");
    }

    throw error;
  }

  const { data } = supabase.storage.from(EXPLORE_MEDIA_BUCKET).getPublicUrl(filePath);
  return data?.publicUrl || "";
}
