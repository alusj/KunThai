import { useEffect, useMemo, useState } from "react";

import {
  clearRecentSearches,
  getSuggestedSearches,
  readRecentSearches,
  saveRecentSearch,
  searchExplore,
} from "../services/explore/searchService";

export function useExploreSearch(open) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const [results, setResults] = useState([]);
  const [recent, setRecent] = useState(readRecentSearches);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const suggestions = useMemo(() => getSuggestedSearches(), [open]);

  useEffect(() => {
    let active = true;
    const trimmed = query.trim();

    if (!trimmed) {
      setResults([]);
      setLoading(false);
      setError("");
      return undefined;
    }

    setLoading(true);
    const timeout = setTimeout(() => {
      searchExplore(trimmed, filter)
        .then((items) => {
          if (active) setResults(items);
        })
        .catch((err) => {
          if (active) setError(err.message || "Unable to search Explore.");
        })
        .finally(() => {
          if (active) setLoading(false);
        });
    }, 180);

    return () => {
      active = false;
      clearTimeout(timeout);
    };
  }, [filter, query]);

  function remember(value = query) {
    setRecent(saveRecentSearch(value));
  }

  function clearRecent() {
    clearRecentSearches();
    setRecent([]);
  }

  function reset() {
    setQuery("");
    setFilter("all");
    setResults([]);
    setError("");
  }

  return {
    query,
    setQuery,
    filter,
    setFilter,
    results,
    recent,
    suggestions,
    loading,
    error,
    clearRecent,
    remember,
    reset,
  };
}
