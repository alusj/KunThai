import { Capacitor, registerPlugin } from "@capacitor/core";

import supabase from "../../lib/supabaseClient";
import { getSignedMessageMedia } from "../explore/messageService";
import { isPrivateMediaRef } from "../explore/messageInboxModels.js";

// Long-press "Save image", "Copy image" and "Report" (2026-11-03), for chat
// photos and photos shown full screen.

const KunThaiPhotos = registerPlugin("KunThaiPhotos");

// A stored image reference as a URL the app can download: private chat photos
// (private:explore-message-media/...) get a short-lived signed link.
export async function downloadableImageUrl(url) {
  if (!url) return "";
  if (isPrivateMediaRef(url)) {
    const signed = await getSignedMessageMedia(url);
    return signed?.url || "";
  }
  return url;
}

async function fetchImageBlob(url) {
  const href = await downloadableImageUrl(url);
  if (!href) throw new Error("This photo is not available.");
  const response = await fetch(href, { credentials: "omit" });
  if (!response.ok) throw new Error("This photo could not be downloaded.");
  return response.blob();
}

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || "").split(",")[1] || "");
    reader.onerror = () => reject(reader.error || new Error("Unable to read the photo."));
    reader.readAsDataURL(blob);
  });
}

function extensionFor(type = "") {
  if (type.includes("png")) return "png";
  if (type.includes("webp")) return "webp";
  if (type.includes("heic")) return "heic";
  return "jpg";
}

// Saves the photo to the phone's Photos (gallery). On the web it downloads.
// Returns "saved", or "denied" when the person turned Photos access off.
export async function saveImageToPhotos(url) {
  const blob = await fetchImageBlob(url);
  const type = blob.type && blob.type.startsWith("image/") ? blob.type : "image/jpeg";
  const filename = `KunThai-${Date.now()}.${extensionFor(type)}`;
  if (Capacitor.isNativePlatform()) {
    try {
      await KunThaiPhotos.saveImage({ data: await blobToBase64(blob), mimeType: type, filename });
      return "saved";
    } catch (error) {
      if (error?.code === "PHOTOS_DENIED") return "denied";
      throw error;
    }
  }
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(link.href), 4000);
  return "saved";
}

async function pngBlob(blob) {
  if (blob.type === "image/png") return blob;
  const bitmap = await createImageBitmap(blob);
  try {
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    canvas.getContext("2d").drawImage(bitmap, 0, 0);
    return await new Promise((resolve, reject) => canvas.toBlob((png) => (png ? resolve(png) : reject(new Error("No PNG"))), "image/png"));
  } finally {
    bitmap.close?.();
  }
}

// Copies the picture itself. Where the phone refuses, copies its link
// instead. Returns "image", "link" or "" (nothing copied).
export async function copyImageToClipboard(url) {
  try {
    if (typeof ClipboardItem !== "undefined" && navigator.clipboard?.write) {
      // The item is handed over at once with a promise, so Safari still
      // counts it as part of the tap.
      const item = new ClipboardItem({ "image/png": fetchImageBlob(url).then(pngBlob) });
      await navigator.clipboard.write([item]);
      return "image";
    }
  } catch {
    // Fall back to the link below.
  }
  try {
    const href = isPrivateMediaRef(url) ? "" : url;
    if (!href) return "";
    await navigator.clipboard.writeText(href);
    return "link";
  } catch {
    return "";
  }
}

export const REPORT_REASONS = ["nudity", "harassment", "scam", "violence", "spam", "other"];

// Files a report; the database snapshots what was reported and opens a case
// in the admin panel's Reports queue. targetType: "explore_message",
// "marketplace_message" or "image" (a public photo; targetId is its address).
// Returns { alreadyReported }.
export async function reportContent({ targetType, targetId, reason, details = "", reportedUserId = null, context = "" }) {
  const { error } = await supabase.from("message_media_reports").insert({
    target_type: targetType,
    target_id: String(targetId || ""),
    reason: REPORT_REASONS.includes(reason) ? reason : "other",
    details: String(details || "").trim().slice(0, 500),
    reported_user_id: reportedUserId || null,
    context: String(context || "").slice(0, 40),
  });
  if (error?.code === "23505") return { alreadyReported: true };
  if (error) throw new Error(error.message);
  return { alreadyReported: false };
}
