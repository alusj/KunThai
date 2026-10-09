import supabase from "../../lib/supabaseClient";
import {
  LEGACY_COLLECTIONS_KEY,
  getCollectionsStorageKey,
  normalizeCollectionName,
} from "./profilePostsModel";
import { isDuplicateNameError, isUuid, mapServerCollections, planCollectionUpload } from "./savedCollectionsModel";

// Saved collections belong to the account (explore_saved_collections and
// explore_saved_collection_items on the server). This device keeps a copy per
// account in localStorage as an offline cache. Collections made on this
// device before syncing existed are uploaded once per account.
const LEGACY_MIGRATED_KEY = `${LEGACY_COLLECTIONS_KEY}:migrated`;
const UPLOADED_KEY_PREFIX = `${LEGACY_COLLECTIONS_KEY}:uploaded:`;
const COLLECTION_COLUMNS = "id,name,created_at,explore_saved_collection_items(post_id)";

export class SavedCollectionError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "SavedCollectionError";
    this.code = code;
  }
}

function duplicateError() {
  return new SavedCollectionError("duplicate", "You already have a collection with that name.");
}

function readJsonArray(key) {
  if (!key) return [];
  try {
    const value = JSON.parse(localStorage.getItem(key) || "[]");
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

// The offline copy for one account.
export function cacheSavedCollections(userId, collections) {
  const key = getCollectionsStorageKey(userId);
  if (!key) return;
  try {
    localStorage.setItem(key, JSON.stringify(collections || []));
  } catch {
    // Storage can be full or unavailable; the in-memory list still updates.
  }
}

// Collections saved before they were kept per account belong to whoever
// signs in first afterwards; the old shared list is then removed.
function migrateLegacyCollections(userId) {
  try {
    if (!userId || localStorage.getItem(LEGACY_MIGRATED_KEY)) return;
    const legacy = readJsonArray(LEGACY_COLLECTIONS_KEY);
    if (legacy.length && !localStorage.getItem(getCollectionsStorageKey(userId))) {
      cacheSavedCollections(userId, legacy);
    }
    localStorage.removeItem(LEGACY_COLLECTIONS_KEY);
    localStorage.setItem(LEGACY_MIGRATED_KEY, userId);
  } catch {
    // Ignore unavailable storage.
  }
}

// The cached list (instant, works offline).
export function readSavedCollections(userId = "") {
  if (!userId) return [];
  migrateLegacyCollections(userId);
  return readJsonArray(getCollectionsStorageKey(userId));
}

function localUploadDone(userId) {
  try {
    return Boolean(localStorage.getItem(`${UPLOADED_KEY_PREFIX}${userId}`));
  } catch {
    return true;
  }
}

function markLocalUploadDone(userId) {
  try {
    localStorage.setItem(`${UPLOADED_KEY_PREFIX}${userId}`, new Date().toISOString());
  } catch {
    // Without storage the next load simply checks again (uploads are idempotent).
  }
}

export async function fetchSavedCollections(userId) {
  const { data, error } = await supabase
    .from("explore_saved_collections")
    .select(COLLECTION_COLUMNS)
    .eq("user_id", userId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return mapServerCollections(data);
}

async function addItems(userId, collectionId, postIds) {
  const rows = postIds.filter(isUuid).map((postId) => ({ collection_id: collectionId, post_id: postId, user_id: userId }));
  if (!rows.length) return;
  const { error } = await supabase
    .from("explore_saved_collection_items")
    .upsert(rows, { onConflict: "collection_id,post_id", ignoreDuplicates: true });
  if (!error) return;
  // A deleted post (23503) fails the whole batch: keep the ones that still exist.
  if (String(error.code) !== "23503") throw error;
  for (const row of rows) {
    const { error: rowError } = await supabase
      .from("explore_saved_collection_items")
      .upsert(row, { onConflict: "collection_id,post_id", ignoreDuplicates: true });
    if (rowError && String(rowError.code) !== "23503") throw rowError;
  }
}

// Loads the account's collections. The first time this account syncs on this
// device, collections that only exist here are uploaded (merged by name).
export async function syncSavedCollections(userId) {
  if (!userId) return [];
  let server = await fetchSavedCollections(userId);
  if (localUploadDone(userId)) return server;

  const plan = planCollectionUpload(readSavedCollections(userId), server);
  for (const entry of plan) {
    let collectionId = entry.serverId;
    if (!collectionId) {
      const { data, error } = await supabase
        .from("explore_saved_collections")
        .insert({ user_id: userId, name: entry.name })
        .select("id")
        .single();
      if (error && !isDuplicateNameError(error)) throw error;
      collectionId = data?.id || "";
      if (!collectionId) {
        // Created meanwhile on another device: merge into that one.
        server = await fetchSavedCollections(userId);
        collectionId = server.find((collection) => collection.name.toLowerCase() === entry.name.toLowerCase())?.id || "";
      }
    }
    if (collectionId) await addItems(userId, collectionId, entry.postIds);
  }

  markLocalUploadDone(userId);
  return plan.length ? fetchSavedCollections(userId) : server;
}

export async function createSavedCollection(userId, name) {
  const title = normalizeCollectionName(name);
  if (!userId || !title) throw new SavedCollectionError("invalid", "Enter a collection name.");
  const { data, error } = await supabase
    .from("explore_saved_collections")
    .insert({ user_id: userId, name: title })
    .select(COLLECTION_COLUMNS)
    .single();
  if (isDuplicateNameError(error)) throw duplicateError();
  if (error) throw error;
  return mapServerCollections([data])[0];
}

export async function renameSavedCollection(userId, collectionId, name) {
  const title = normalizeCollectionName(name);
  if (!userId || !collectionId || !title) throw new SavedCollectionError("invalid", "Enter a collection name.");
  const { error } = await supabase
    .from("explore_saved_collections")
    .update({ name: title })
    .eq("id", collectionId)
    .eq("user_id", userId);
  if (isDuplicateNameError(error)) throw duplicateError();
  if (error) throw error;
}

export async function deleteSavedCollection(userId, collectionId) {
  const { error } = await supabase
    .from("explore_saved_collections")
    .delete()
    .eq("id", collectionId)
    .eq("user_id", userId);
  if (error) throw error;
}

export async function setSavedItemInCollection(userId, collectionId, postId, included) {
  if (!userId || !isUuid(collectionId) || !postId) return;
  if (included) {
    await addItems(userId, collectionId, [postId]);
    return;
  }
  const { error } = await supabase
    .from("explore_saved_collection_items")
    .delete()
    .eq("collection_id", collectionId)
    .eq("post_id", postId)
    .eq("user_id", userId);
  if (error) throw error;
}

export function itemIsInCollection(collection, postId) {
  return Boolean(collection?.postIds?.includes?.(postId));
}
