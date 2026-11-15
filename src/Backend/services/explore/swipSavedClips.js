import { Capacitor } from "@capacitor/core";

import { readExploreSettings } from "./preferencesService";
import { recordLifecycle } from "../lifecycleAudit";

// A few Swip clips kept as files on the phone, so Swip still has something
// to play with no internet (and the next clips start at once with it).
//
// iPhone only. Android's WebView keeps the video it has streamed in its own
// disk cache and plays it again offline; the iPhone's web view keeps nothing
// of a streamed video, so without these files Swip was empty offline.
//
// The files are downloaded by the phone itself (not into the page's memory:
// that got the page ended by iOS, see swipStartupPrefetch.js) and played
// straight from disk.

const ENABLED = Capacitor.getPlatform() === "ios";
const INDEX_KEY = "kt-swip-saved-clips";
const FOLDER = "swip-clips";
// Clips kept ready ahead of the one being watched.
export const SAVED_CLIPS_AHEAD = 3;
const LARGEST_CLIP_BYTES = 40 * 1024 * 1024;

// { id, url, file, post, savedAt, watched }
let entries = readIndex();
let folderUri = "";
let preparing = null;
let request = null;
let running = false;

function readIndex() {
  if (!ENABLED) return [];
  try {
    const stored = JSON.parse(localStorage.getItem(INDEX_KEY) || "[]");
    return Array.isArray(stored) ? stored.filter((entry) => entry?.id && entry.file && entry.url) : [];
  } catch {
    return [];
  }
}

function writeIndex() {
  try {
    localStorage.setItem(INDEX_KEY, JSON.stringify(entries));
  } catch {
    // Storage full or unavailable: the files are simply not remembered.
  }
}

async function filesystem() {
  return import("@capacitor/filesystem");
}

async function deleteFile(file) {
  try {
    const { Filesystem, Directory } = await filesystem();
    await Filesystem.deleteFile({ path: `${FOLDER}/${file}`, directory: Directory.Cache });
  } catch {
    // Already gone.
  }
}

// Finds the folder and drops whatever the list and the folder disagree on
// (iOS may clear cached files when the phone runs short of space).
function prepare() {
  if (!ENABLED) return Promise.resolve();
  if (!preparing) {
    preparing = (async () => {
      const { Filesystem, Directory } = await filesystem();
      try {
        await Filesystem.mkdir({ path: FOLDER, directory: Directory.Cache, recursive: true });
      } catch {
        // Already there.
      }
      const { uri } = await Filesystem.getUri({ path: FOLDER, directory: Directory.Cache });
      const { files } = await Filesystem.readdir({ path: FOLDER, directory: Directory.Cache });
      const onDisk = new Set((files || []).map((item) => item.name));
      const listed = new Set(entries.map((entry) => entry.file));
      entries = entries.filter((entry) => onDisk.has(entry.file));
      writeIndex();
      await Promise.all([...onDisk].filter((name) => !listed.has(name)).map(deleteFile));
      folderUri = String(uri || "").replace(/\/+$/, "");
    })().catch(() => {});
  }
  return preparing;
}

// Resolves once the saved clips can be played.
export function savedSwipClipsReady() {
  return prepare();
}

// The address of a clip's file on the phone, or "" (then it streams).
export function savedSwipClipUrl(postId, videoUrl = "") {
  if (!folderUri || !postId) return "";
  const entry = entries.find((item) => item.id === String(postId));
  if (!entry || (videoUrl && entry.url !== videoUrl)) return "";
  return Capacitor.convertFileSrc(`${folderUri}/${entry.file}`);
}

// The posts whose clips are on the phone, those not watched yet first.
export function savedSwipPosts() {
  if (!folderUri) return [];
  return [...entries]
    .sort((first, second) => Number(first.watched) - Number(second.watched) || first.savedAt - second.savedAt)
    .map((entry) => entry.post)
    .filter(Boolean);
}

export function markSavedSwipClipWatched(postId) {
  const entry = entries.find((item) => item.id === String(postId));
  if (!entry || entry.watched) return;
  entry.watched = true;
  writeIndex();
}

// The file would not play, or its post is gone.
export function dropSavedSwipClip(postId) {
  const entry = entries.find((item) => item.id === String(postId));
  if (!entry) return;
  entries = entries.filter((item) => item !== entry);
  writeIndex();
  deleteFile(entry.file);
}

// Another account, or signed out: nothing of the last account's stays.
export function forgetSavedSwipClips() {
  if (!ENABLED) return;
  const files = entries.map((entry) => entry.file);
  entries = [];
  request = null;
  try {
    localStorage.removeItem(INDEX_KEY);
  } catch {
    // Storage unavailable.
  }
  files.forEach(deleteFile);
}

function mayDownload() {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return false;
  const connection = typeof navigator !== "undefined" ? navigator.connection : null;
  return !connection?.saveData && !readExploreSettings().video.reduceData;
}

function fileNameFor(post) {
  const id = String(post.id).replace(/[^a-zA-Z0-9_-]/g, "");
  const extension = /\.(mp4|mov|m4v|webm)(?:$|[?#])/i.exec(post.video_url)?.[1]?.toLowerCase() || "mp4";
  return id ? `${id}.${extension}` : "";
}

async function saveClip(post) {
  const file = fileNameFor(post);
  if (!file) return;
  const { Filesystem, Directory } = await filesystem();
  const path = `${FOLDER}/${file}`;
  try {
    await Filesystem.downloadFile({ url: post.video_url, path, directory: Directory.Cache, recursive: true });
    const { size } = await Filesystem.stat({ path, directory: Directory.Cache });
    if (!size || size > LARGEST_CLIP_BYTES) throw new Error("clip size");
    entries = [
      ...entries.filter((entry) => entry.id !== String(post.id)),
      {
        id: String(post.id),
        url: post.video_url,
        file,
        // A shared Swip is kept as it arrived (its video named only in the
        // repost details), so it still credits the original when read back.
        post: post.swipRepost ? { ...post, video_url: "", swipRepost: undefined } : post,
        savedAt: Date.now(),
        watched: false,
      },
    ];
    writeIndex();
    recordLifecycle("swip-saved-clip", "saved", `${Math.round(size / 1024)} KB, ${entries.length} kept`);
  } catch {
    // No connection, or the clip is gone: it streams when reached, as before.
    await deleteFile(file);
  }
}

async function fill({ posts, inUseIds, topUp }) {
  await prepare();
  if (!folderUri || !mayDownload()) return;
  const usable = (posts || []).filter((post) => post?.id && post.video_url && !post.pending && /^https?:/i.test(post.video_url));
  const stored = (post) => entries.some((entry) => entry.id === String(post.id) && entry.url === post.video_url);
  let wanted;
  if (topUp) {
    // A fresh start: only make up the number still unwatched, from the top
    // of the feed, and leave the unwatched ones alone.
    const unwatched = entries.filter((entry) => !entry.watched).length;
    wanted = usable.filter((post) => !stored(post)).slice(0, Math.max(0, SAVED_CLIPS_AHEAD - unwatched));
  } else {
    wanted = usable.slice(0, SAVED_CLIPS_AHEAD);
  }
  const held = new Set([...(inUseIds || []).map(String), ...wanted.map((post) => String(post.id))]);

  for (const post of wanted) {
    // A newer request (Swip moved on) replaces this one.
    if (request) return;
    if (stored(post)) continue;
    // Room first: watched clips go before unwatched ones, oldest first; a
    // clip on screen (or about to be) is never taken.
    const removable = entries
      .filter((entry) => !held.has(entry.id) && (!topUp || entry.watched))
      .sort((first, second) => Number(second.watched) - Number(first.watched) || first.savedAt - second.savedAt);
    while (entries.length >= SAVED_CLIPS_AHEAD && removable.length) {
      dropSavedSwipClip(removable.shift().id);
    }
    await saveClip(post);
  }
}

// Keeps these posts' clips on the phone (the first SAVED_CLIPS_AHEAD of
// them). `inUseIds`: clips on screen now, whose files must stay. `topUp`:
// see fill(). Runs in the background, one download at a time.
export function keepSwipClips(posts, { inUseIds = [], topUp = false } = {}) {
  if (!ENABLED) return;
  request = { posts, inUseIds, topUp };
  if (running) return;
  running = true;
  (async () => {
    while (request) {
      const next = request;
      request = null;
      await fill(next).catch(() => {});
    }
    running = false;
  })();
}
