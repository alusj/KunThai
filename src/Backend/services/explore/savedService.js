import {
  LEGACY_COLLECTIONS_KEY,
  collectionNameTaken,
  getCollectionsStorageKey,
  normalizeCollectionName,
} from "./profilePostsModel";

// Saved collections live on this device, one list per signed-in account.
const DEFAULT_COLLECTION_ID = "all";
const LEGACY_MIGRATED_KEY = `${LEGACY_COLLECTIONS_KEY}:migrated`;

export class SavedCollectionError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "SavedCollectionError";
    this.code = code;
  }
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

function writeCollections(userId, collections) {
  const key = getCollectionsStorageKey(userId);
  if (!key) return;
  try {
    localStorage.setItem(key, JSON.stringify(collections));
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
      writeCollections(userId, legacy);
    }
    localStorage.removeItem(LEGACY_COLLECTIONS_KEY);
    localStorage.setItem(LEGACY_MIGRATED_KEY, userId);
  } catch {
    // Ignore unavailable storage.
  }
}

export function readSavedCollections(userId = "") {
  if (!userId) return [];
  migrateLegacyCollections(userId);
  return readJsonArray(getCollectionsStorageKey(userId));
}

export function createSavedCollection(userId, name) {
  const title = normalizeCollectionName(name);
  const collections = readSavedCollections(userId);
  if (!userId || !title) return collections;
  if (collectionNameTaken(collections, title)) {
    throw new SavedCollectionError("duplicate", "You already have a collection with that name.");
  }

  const next = [
    ...collections,
    {
      id: `collection-${Date.now()}`,
      name: title,
      postIds: [],
      createdAt: new Date().toISOString(),
    },
  ];
  writeCollections(userId, next);
  return next;
}

export function renameSavedCollection(userId, collectionId, name) {
  const title = normalizeCollectionName(name);
  const collections = readSavedCollections(userId);
  if (!userId || !collectionId || !title) return collections;
  if (collectionNameTaken(collections, title, collectionId)) {
    throw new SavedCollectionError("duplicate", "You already have a collection with that name.");
  }

  const next = collections.map((collection) => (collection.id === collectionId ? { ...collection, name: title } : collection));
  writeCollections(userId, next);
  return next;
}

export function deleteSavedCollection(userId, collectionId) {
  const next = readSavedCollections(userId).filter((collection) => collection.id !== collectionId);
  writeCollections(userId, next);
  return next;
}

export function toggleSavedItemInCollection(userId, collectionId, postId) {
  if (!collectionId || collectionId === DEFAULT_COLLECTION_ID || !postId) {
    return readSavedCollections(userId);
  }

  const next = readSavedCollections(userId).map((collection) => {
    if (collection.id !== collectionId) return collection;
    const postIds = new Set(collection.postIds || []);
    if (postIds.has(postId)) postIds.delete(postId);
    else postIds.add(postId);
    return { ...collection, postIds: Array.from(postIds) };
  });

  writeCollections(userId, next);
  return next;
}

export function itemIsInCollection(collection, postId) {
  return Boolean(collection?.postIds?.includes?.(postId));
}
