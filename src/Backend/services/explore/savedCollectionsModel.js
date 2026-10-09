import { normalizeCollectionName } from "./profilePostsModel.js";

// Pure helpers for saved collections synced to the account (no network, no
// storage), shared by savedService and useSavedCollections and unit tested.

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value) {
  return UUID_PATTERN.test(String(value || ""));
}

export function isDuplicateNameError(error) {
  return String(error?.code || "") === "23505";
}

// Rows from explore_saved_collections with their explore_saved_collection_items.
export function mapServerCollections(rows = []) {
  return (rows || [])
    .filter((row) => row?.id)
    .map((row) => ({
      id: row.id,
      name: normalizeCollectionName(row.name),
      postIds: Array.from(new Set((row.explore_saved_collection_items || row.items || []).map((item) => item?.post_id).filter(Boolean))),
      createdAt: row.created_at || "",
    }))
    .sort((left, right) => String(left.createdAt).localeCompare(String(right.createdAt)));
}

// What to upload the first time an account syncs: each collection kept on
// this device that the server does not have yet (matched by name, ignoring
// case), and the device's posts missing from a collection the server already
// has. Only post ids that can exist on the server (uuids) are sent.
export function planCollectionUpload(local = [], server = []) {
  const serverByName = new Map(
    (server || []).map((collection) => [normalizeCollectionName(collection.name).toLowerCase(), collection]),
  );
  const plan = [];
  const seen = new Set();

  for (const collection of local || []) {
    const name = normalizeCollectionName(collection?.name);
    const key = name.toLowerCase();
    if (!name || seen.has(key)) continue;
    seen.add(key);
    const postIds = Array.from(new Set((collection.postIds || []).filter(isUuid)));
    const existing = serverByName.get(key);
    if (existing) {
      const have = new Set(existing.postIds || []);
      const missing = postIds.filter((postId) => !have.has(postId));
      if (missing.length) plan.push({ name: existing.name, serverId: existing.id, postIds: missing });
    } else {
      plan.push({ name, serverId: "", postIds });
    }
  }
  return plan;
}

export function toggleCollectionPost(collections = [], collectionId = "", postId = "") {
  return (collections || []).map((collection) => {
    if (collection.id !== collectionId) return collection;
    const postIds = new Set(collection.postIds || []);
    if (postIds.has(postId)) postIds.delete(postId);
    else postIds.add(postId);
    return { ...collection, postIds: Array.from(postIds) };
  });
}
