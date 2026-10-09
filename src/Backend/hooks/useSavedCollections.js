import { useEffect, useState } from "react";

import {
  createSavedCollection,
  deleteSavedCollection,
  readSavedCollections,
  renameSavedCollection,
  toggleSavedItemInCollection,
} from "../services/explore/savedService";

// Collections are kept per account: pass the signed-in user's id.
export function useSavedCollections(userId = "") {
  const [collections, setCollections] = useState(() => readSavedCollections(userId));

  useEffect(() => {
    setCollections(readSavedCollections(userId));
  }, [userId]);

  // Each action returns the new list, or throws (e.g. a duplicate name).
  function createCollection(name) {
    const next = createSavedCollection(userId, name);
    setCollections(next);
    return next;
  }

  function renameCollection(collectionId, name) {
    const next = renameSavedCollection(userId, collectionId, name);
    setCollections(next);
    return next;
  }

  function deleteCollection(collectionId) {
    const next = deleteSavedCollection(userId, collectionId);
    setCollections(next);
    return next;
  }

  function toggleItem(collectionId, postId) {
    const next = toggleSavedItemInCollection(userId, collectionId, postId);
    setCollections(next);
    return next;
  }

  return {
    collections,
    createCollection,
    deleteCollection,
    renameCollection,
    toggleItem,
  };
}
