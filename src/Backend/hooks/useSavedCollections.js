import { useState } from "react";

import {
  createSavedCollection,
  deleteSavedCollection,
  readSavedCollections,
  toggleSavedItemInCollection,
} from "../services/explore/savedService";

export function useSavedCollections() {
  const [collections, setCollections] = useState(readSavedCollections);

  function createCollection(name) {
    setCollections(createSavedCollection(name));
  }

  function deleteCollection(collectionId) {
    setCollections(deleteSavedCollection(collectionId));
  }

  function toggleItem(collectionId, postId) {
    setCollections(toggleSavedItemInCollection(collectionId, postId));
  }

  return {
    collections,
    createCollection,
    deleteCollection,
    toggleItem,
  };
}
