import { useCallback, useEffect, useRef, useState } from "react";

import { t as i18nText } from "../../i18n/index";
import { collectionNameTaken, normalizeCollectionName } from "../services/explore/profilePostsModel";
import { isUuid, toggleCollectionPost } from "../services/explore/savedCollectionsModel";
import {
  SavedCollectionError,
  cacheSavedCollections,
  createSavedCollection,
  deleteSavedCollection,
  readSavedCollections,
  renameSavedCollection,
  setSavedItemInCollection,
  syncSavedCollections,
} from "../services/explore/savedService";
import { showToast } from "../services/toastService";

function isDuplicate(error) {
  return error instanceof SavedCollectionError && error.code === "duplicate";
}

// A create cut short (app closed mid-request) is not shown from the cache.
function readCachedCollections(userId) {
  return readSavedCollections(userId).filter((collection) => !collection?.pending);
}

// Collections are kept per account: pass the signed-in user's id. The server
// is the source of truth; the list shows the cached copy at once, then the
// account's list. Every change shows immediately and is undone (with a toast)
// if the server refuses it. A duplicate name throws a SavedCollectionError
// with code "duplicate" for the form to show.
export function useSavedCollections(userId = "") {
  const [collections, setCollections] = useState(() => readCachedCollections(userId));
  const [syncing, setSyncing] = useState(false);
  const listRef = useRef(collections);
  const userRef = useRef(userId);
  const inFlightRef = useRef(new Set());

  const commit = useCallback((next) => {
    listRef.current = next;
    setCollections(next);
    cacheSavedCollections(userRef.current, next);
  }, []);

  const refresh = useCallback(async () => {
    const owner = userRef.current;
    if (!owner) return listRef.current;
    const server = await syncSavedCollections(owner);
    if (userRef.current !== owner) return listRef.current;
    // Keep collections still being created so a refresh cannot drop them.
    const pending = listRef.current.filter((collection) => inFlightRef.current.has(collection.id));
    commit([...server, ...pending]);
    return listRef.current;
  }, [commit]);

  useEffect(() => {
    userRef.current = userId;
    const cached = readCachedCollections(userId);
    listRef.current = cached;
    setCollections(cached);
    if (!userId) return undefined;

    let active = true;
    setSyncing(true);
    refresh()
      .catch(() => {
        // Offline or the server is unreachable: the cached copy stays.
      })
      .finally(() => {
        if (active) setSyncing(false);
      });
    return () => {
      active = false;
    };
  }, [refresh, userId]);

  async function createCollection(name) {
    const title = normalizeCollectionName(name);
    if (!userId || !title) return listRef.current;
    if (collectionNameTaken(listRef.current, title)) {
      throw new SavedCollectionError("duplicate", "You already have a collection with that name.");
    }

    const tempId = `pending-${Date.now()}`;
    inFlightRef.current.add(tempId);
    commit([...listRef.current, { id: tempId, name: title, postIds: [], createdAt: new Date().toISOString(), pending: true }]);
    try {
      const created = await createSavedCollection(userId, title);
      commit(listRef.current.map((collection) => (collection.id === tempId ? created : collection)));
      return listRef.current;
    } catch (error) {
      commit(listRef.current.filter((collection) => collection.id !== tempId));
      if (isDuplicate(error)) {
        refresh().catch(() => {});
      } else {
        showToast(i18nText("exploreNativeFix.collectionSaveFailed"), "danger");
      }
      throw error;
    } finally {
      inFlightRef.current.delete(tempId);
    }
  }

  async function renameCollection(collectionId, name) {
    const title = normalizeCollectionName(name);
    const current = listRef.current.find((collection) => collection.id === collectionId);
    if (!userId || !current || !title) return listRef.current;
    if (collectionNameTaken(listRef.current, title, collectionId)) {
      throw new SavedCollectionError("duplicate", "You already have a collection with that name.");
    }

    const previousName = current.name;
    commit(listRef.current.map((collection) => (collection.id === collectionId ? { ...collection, name: title } : collection)));
    try {
      await renameSavedCollection(userId, collectionId, title);
      return listRef.current;
    } catch (error) {
      commit(listRef.current.map((collection) => (collection.id === collectionId ? { ...collection, name: previousName } : collection)));
      if (!isDuplicate(error)) showToast(i18nText("exploreNativeFix.collectionUpdateFailed"), "danger");
      throw error;
    }
  }

  async function deleteCollection(collectionId) {
    const index = listRef.current.findIndex((collection) => collection.id === collectionId);
    if (!userId || index < 0) return listRef.current;

    const removed = listRef.current[index];
    commit(listRef.current.filter((collection) => collection.id !== collectionId));
    try {
      await deleteSavedCollection(userId, collectionId);
      return listRef.current;
    } catch (error) {
      const next = [...listRef.current];
      next.splice(Math.min(index, next.length), 0, removed);
      commit(next);
      showToast(i18nText("exploreNativeFix.collectionDeleteFailed"), "danger");
      throw error;
    }
  }

  // Adds the post to the collection, or removes it if it is already there.
  async function toggleItem(collectionId, postId) {
    const collection = listRef.current.find((entry) => entry.id === collectionId);
    if (!userId || !collection || !postId || !isUuid(collectionId)) return listRef.current;

    const include = !(collection.postIds || []).includes(postId);
    commit(toggleCollectionPost(listRef.current, collectionId, postId));
    try {
      await setSavedItemInCollection(userId, collectionId, postId, include);
    } catch {
      const now = listRef.current.find((entry) => entry.id === collectionId);
      if (now && (now.postIds || []).includes(postId) === include) {
        commit(toggleCollectionPost(listRef.current, collectionId, postId));
      }
      showToast(i18nText("exploreNativeFix.collectionUpdateFailed"), "danger");
    }
    return listRef.current;
  }

  return {
    collections,
    createCollection,
    deleteCollection,
    refresh,
    renameCollection,
    syncing,
    toggleItem,
  };
}
