import { useEffect, useState } from "react";

import {
  fetchSellerHeaderState,
  searchSellerWorkspace,
} from "../services/marketplace/sellerHeaderService";

const DEFAULT_HEADER_STATE = {
  orderCount: 0,
  messageCount: 0,
  notificationCount: 0,
  searchSuggestions: [],
};

export function useSellerHeader() {
  const [headerState, setHeaderState] = useState(DEFAULT_HEADER_STATE);
  const [query, setQuery] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [loading, setLoading] = useState(true);

  async function loadHeaderState(active = true) {
    const nextState = await fetchSellerHeaderState();
    if (active) {
      setHeaderState({ ...DEFAULT_HEADER_STATE, ...nextState });
    }
    if (active) {
      setLoading(false);
    }
  }

  useEffect(() => {
    let active = true;

    loadHeaderState(active);

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    function handleMessageSent() {
      loadHeaderState(true);
    }

    window.addEventListener("marketplace-message-sent", handleMessageSent);
    return () => window.removeEventListener("marketplace-message-sent", handleMessageSent);
  }, []);

  useEffect(() => {
    let active = true;

    searchSellerWorkspace(query).then((results) => {
      if (active) {
        setSearchResults(results);
      }
    });

    return () => {
      active = false;
    };
  }, [query]);

  return {
    ...headerState,
    query,
    setQuery,
    searchResults,
    loading,
  };
}
