import { useEffect, useRef, useState } from "react";

import supabase from "../lib/supabaseClient";
import { fetchHashtagSuggestions, normalizeHashtag } from "../services/explore/hashtagService";
import { searchExplorePeople } from "../services/explore/searchService";

// Detects an active "@mention" or "#hashtag" token immediately before the
// cursor. The token ends as soon as a space is typed, which closes the popup.
export function detectComposerTrigger(value, cursor) {
  const beforeCursor = String(value || "").slice(0, cursor);

  const mention = beforeCursor.match(/(?:^|\s)@([a-zA-Z0-9_]*)$/);
  if (mention) {
    const query = mention[1] || "";
    return { type: "mention", query, start: cursor - query.length - 1, end: cursor };
  }

  const hashtag = beforeCursor.match(/(?:^|\s)#([a-zA-Z0-9_]*)$/);
  if (hashtag) {
    const query = hashtag[1] || "";
    return { type: "hashtag", query, start: cursor - query.length - 1, end: cursor };
  }

  return null;
}

// Inline @mention / #hashtag autocomplete for any text input or textarea.
// Typing "@" surfaces people (until a space ends the mention); typing "#"
// surfaces the user's saved hashtags. Selecting a suggestion replaces the
// token at the cursor.
export function useMentionHashtagAutocomplete({ value, onValueChange, inputRef }) {
  const [trigger, setTrigger] = useState(null);
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const hashtagCacheRef = useRef(null);

  function handleInputChange(event) {
    const nextValue = event.target.value;
    const cursor = event.target.selectionStart ?? nextValue.length;
    onValueChange?.(nextValue);
    setTrigger(detectComposerTrigger(nextValue, cursor));
  }

  function closeSuggestions() {
    setTrigger(null);
    setResults([]);
  }

  function insertToken(prefix, rawToken) {
    const token = String(rawToken || "").trim().replace(/^[@#]+/, "");
    if (!token || !trigger) return;

    const replacement = `${prefix}${token} `;
    const nextValue = `${String(value).slice(0, trigger.start)}${replacement}${String(value).slice(trigger.end)}`;
    const nextCursor = trigger.start + replacement.length;
    onValueChange?.(nextValue);
    closeSuggestions();
    window.setTimeout(() => {
      const input = inputRef?.current;
      if (!input) return;
      input.focus();
      input.setSelectionRange?.(nextCursor, nextCursor);
    }, 0);
  }

  function selectSuggestion(item) {
    if (!item) return;
    if (item.type === "people") insertToken("@", item.username);
    else insertToken("#", item.tag);
  }

  useEffect(() => {
    if (!trigger) return undefined;
    let active = true;

    const timer = window.setTimeout(async () => {
      setLoading(true);
      try {
        if (trigger.type === "mention") {
          const people = await searchExplorePeople(trigger.query);
          if (active) setResults(people.filter((item) => item.type === "people" && item.username).slice(0, 6));
        } else {
          if (!hashtagCacheRef.current) {
            const {
              data: { user },
            } = await supabase.auth.getUser().catch(() => ({ data: { user: null } }));
            hashtagCacheRef.current = await fetchHashtagSuggestions(user?.id || "");
          }
          const query = normalizeHashtag(trigger.query);
          const tags = (hashtagCacheRef.current || [])
            .filter((item) => !query || item.tag.includes(query))
            .slice(0, 6)
            .map((item) => ({ ...item, type: "hashtag" }));
          if (active) setResults(tags);
        }
      } catch {
        if (active) setResults([]);
      } finally {
        if (active) setLoading(false);
      }
    }, trigger.query ? 220 : 0);

    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [trigger?.type, trigger?.query]); // eslint-disable-line react-hooks/exhaustive-deps -- start/end shift on every keystroke without changing the lookup.

  return { trigger, results, loading, handleInputChange, selectSuggestion, closeSuggestions };
}
