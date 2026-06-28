import supabase from "../../lib/supabaseClient";
import { isMissingTable } from "./errors";

const USER_CARE_TABLE = "user_care_feedback";
const VOICE_BUCKET = "user-care-voice-notes";
const SCREENSHOT_BUCKET = "user-care-screenshots";
const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024;
const IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);
const AUDIO_TYPES = new Set(["audio/webm", "audio/ogg", "audio/mp4", "audio/mpeg"]);

function unavailableError() {
  const error = new Error("Your Voice is being prepared. Please use Report a Problem for now.");
  error.code = "USER_CARE_UNAVAILABLE";
  return error;
}

function normalizeFeedback(row = {}) {
  return {
    id: row.id,
    feedbackType: row.feedback_type || "other",
    category: row.category || "other",
    title: row.title || "Feedback",
    message: row.message || "",
    voiceNotePath: row.voice_note_url || "",
    screenshotPath: row.screenshot_url || "",
    currentScreen: row.current_screen || "",
    status: row.status || "submitted",
    adminReply: row.admin_reply || "",
    adminSeen: Boolean(row.admin_seen),
    createdAt: row.created_at || new Date().toISOString(),
    updatedAt: row.updated_at || row.created_at || new Date().toISOString(),
  };
}

function createFeedbackId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (token) => {
    const value = Math.floor(Math.random() * 16);
    const normalized = token === "x" ? value : (value & 0x3) | 0x8;
    return normalized.toString(16);
  });
}

function extensionFor(file, fallback) {
  const fromName = String(file?.name || "").split(".").pop()?.toLowerCase();
  if (fromName && /^[a-z0-9]{2,5}$/.test(fromName)) return fromName === "jpeg" ? "jpg" : fromName;
  const byType = {
    "image/png": "png",
    "image/jpeg": "jpg",
    "image/webp": "webp",
    "audio/ogg": "ogg",
    "audio/mp4": "m4a",
    "audio/mpeg": "mp3",
    "audio/webm": "webm",
  };
  return byType[file?.type] || fallback;
}

async function currentUser() {
  const { data, error } = await supabase.auth.getUser();
  if (error) throw error;
  if (!data?.user?.id) throw new Error("Sign in to send feedback to KunThai.");
  return data.user;
}

async function uploadAttachment(bucket, path, file) {
  const { error } = await supabase.storage.from(bucket).upload(path, file, {
    cacheControl: "3600",
    contentType: file.type,
    upsert: false,
  });
  if (error) {
    if (/bucket not found|not found/i.test(error.message || "")) throw unavailableError();
    throw error;
  }
  return path;
}

async function removeAttachments(items = []) {
  await Promise.all(items.map(({ bucket, path }) => supabase.storage.from(bucket).remove([path]).catch(() => null)));
}

export function validateUserCareAttachment(file, kind) {
  if (!file) return "";
  if (file.size > MAX_ATTACHMENT_BYTES) return `${kind === "image" ? "Screenshot" : "Voice note"} must be 5MB or smaller.`;
  const allowed = kind === "image" ? IMAGE_TYPES : AUDIO_TYPES;
  if (!allowed.has(String(file.type || "").toLowerCase())) {
    return kind === "image" ? "Choose a PNG, JPG, JPEG, or WebP image." : "Choose a supported voice-note recording.";
  }
  return "";
}

export async function fetchUserCareFeedback() {
  const user = await currentUser();
  const { data, error } = await supabase
    .from(USER_CARE_TABLE)
    .select("id, feedback_type, category, title, message, voice_note_url, screenshot_url, current_screen, status, admin_reply, admin_seen, created_at, updated_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(30);

  if (error) {
    if (isMissingTable(error)) throw unavailableError();
    throw error;
  }
  return (data || []).map(normalizeFeedback);
}

export async function createUserCareFeedback(input = {}) {
  const user = await currentUser();
  const title = String(input.title || "").trim().slice(0, 120);
  const message = String(input.message || "").trim().slice(0, 2000);
  const screenshot = input.screenshot || null;
  const voiceNote = input.voiceNote || null;

  if (!title) throw new Error("Add a title for your feedback.");
  if (!message && !screenshot && !voiceNote) throw new Error("Add a message, screenshot, or voice note.");
  const screenshotError = validateUserCareAttachment(screenshot, "image");
  if (screenshotError) throw new Error(screenshotError);
  const voiceError = validateUserCareAttachment(voiceNote, "audio");
  if (voiceError) throw new Error(voiceError);

  const feedbackId = createFeedbackId();
  const uploaded = [];

  try {
    let screenshotPath = "";
    let voiceNotePath = "";
    if (screenshot) {
      screenshotPath = `user-care/${user.id}/${feedbackId}.${extensionFor(screenshot, "png")}`;
      await uploadAttachment(SCREENSHOT_BUCKET, screenshotPath, screenshot);
      uploaded.push({ bucket: SCREENSHOT_BUCKET, path: screenshotPath });
    }
    if (voiceNote) {
      voiceNotePath = `user-care/${user.id}/${feedbackId}.${extensionFor(voiceNote, "webm")}`;
      await uploadAttachment(VOICE_BUCKET, voiceNotePath, voiceNote);
      uploaded.push({ bucket: VOICE_BUCKET, path: voiceNotePath });
    }

    const payload = {
      id: feedbackId,
      user_id: user.id,
      feedback_type: input.feedbackType,
      category: input.category,
      title,
      message: message || null,
      screenshot_url: screenshotPath || null,
      voice_note_url: voiceNotePath || null,
      current_screen: String(input.currentScreen || "").slice(0, 180) || null,
    };
    const { data, error } = await supabase.from(USER_CARE_TABLE).insert(payload).select().single();
    if (error) {
      if (isMissingTable(error)) throw unavailableError();
      throw error;
    }
    return normalizeFeedback(data);
  } catch (error) {
    await removeAttachments(uploaded);
    throw error;
  }
}
