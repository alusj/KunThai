const COLLECTIONS_KEY = "explore-saved-collections";
const DEFAULT_COLLECTION_ID = "all";

function readJsonArray(key) {
  try {
    const value = JSON.parse(localStorage.getItem(key) || "[]");
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

function writeCollections(collections) {
  localStorage.setItem(COLLECTIONS_KEY, JSON.stringify(collections));
}

export function readSavedCollections() {
  return readJsonArray(COLLECTIONS_KEY);
}

export function createSavedCollection(name) {
  const title = String(name || "").trim();
  if (!title) return readSavedCollections();

  const collections = readSavedCollections();
  const next = [
    ...collections,
    {
      id: `collection-${Date.now()}`,
      name: title,
      postIds: [],
      createdAt: new Date().toISOString(),
    },
  ];
  writeCollections(next);
  return next;
}

export function deleteSavedCollection(collectionId) {
  const next = readSavedCollections().filter((collection) => collection.id !== collectionId);
  writeCollections(next);
  return next;
}

export function toggleSavedItemInCollection(collectionId, postId) {
  if (!collectionId || collectionId === DEFAULT_COLLECTION_ID || !postId) {
    return readSavedCollections();
  }

  const next = readSavedCollections().map((collection) => {
    if (collection.id !== collectionId) return collection;
    const postIds = new Set(collection.postIds || []);
    if (postIds.has(postId)) postIds.delete(postId);
    else postIds.add(postId);
    return { ...collection, postIds: Array.from(postIds) };
  });

  writeCollections(next);
  return next;
}

export function itemIsInCollection(collection, postId) {
  return Boolean(collection?.postIds?.includes?.(postId));
}
