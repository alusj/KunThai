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
  const mediaUrl = String(dataUrl || "");
  const isLocalMediaUrl = mediaUrl.startsWith("data:") || mediaUrl.startsWith("blob:");

  if (!mediaUrl || !isLocalMediaUrl) {
    return dataUrl || "";
  }

  const response = await fetch(mediaUrl);

  if (!response.ok) {
    throw new Error("Unable to prepare media for upload.");
  }

  const blob = await response.blob();
  return uploadMediaFile(blob, mediaType, userId);
}

export async function uploadMediaFile(file, mediaType, userId) {
  if (!file) {
    return "";
  }

  const fallback = mediaType === "image" || mediaType === "profile" ? "jpg" : mediaType === "video" ? "mp4" : "webm";
  const extension = getFileExtensionFromMime(file.type, fallback);
  const filePath = `${userId}/${mediaType}-${Date.now()}.${extension}`;

  const { error } = await supabase.storage.from(EXPLORE_MEDIA_BUCKET).upload(filePath, file, {
    cacheControl: "3600",
    upsert: false,
    contentType: file.type || undefined,
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
