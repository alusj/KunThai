import { useCallback, useEffect, useState } from "react";

import { useI18n } from "../../i18n";
import { useAiAvailability, useAiTask } from "./useAiTask";

// KAI — inline "See translation" for text someone else wrote.
//
// Translates into the reader's current KunThai language. Results are kept for
// the session, so scrolling a thread, closing it and opening it again never
// pays for the same translation twice (the server caches identical requests
// across people as well).

const TRANSLATION_MEMORY = new Map();
const MEMORY_LIMIT = 200;

function memoryKey(locale, text) {
  return `${locale}\u0000${text}`;
}

export function useAiTranslation(text, { surface = "explore", screen = "" } = {}) {
  const { locale } = useI18n();
  const { available } = useAiAvailability();
  const ai = useAiTask({ surface, screen });
  const source = String(text || "").trim();
  const key = memoryKey(locale, source);

  const [showTranslation, setShowTranslation] = useState(() => TRANSLATION_MEMORY.has(key));
  const remembered = TRANSLATION_MEMORY.get(key) || "";
  const translated = remembered || (ai.task === "text.translate" ? ai.result?.text || "" : "");

  useEffect(() => {
    if (!translated || TRANSLATION_MEMORY.has(key)) return;
    TRANSLATION_MEMORY.set(key, translated);
    if (TRANSLATION_MEMORY.size > MEMORY_LIMIT) {
      TRANSLATION_MEMORY.delete(TRANSLATION_MEMORY.keys().next().value);
    }
  }, [key, translated]);

  const translate = useCallback(() => {
    if (!source) return;
    setShowTranslation(true);
    if (TRANSLATION_MEMORY.has(key)) return;
    ai.run({ task: "text.translate", input: { text: source, targetLanguage: locale } });
  }, [ai, key, locale, source]);

  const showOriginal = useCallback(() => {
    ai.stop();
    setShowTranslation(false);
  }, [ai]);

  return {
    available,
    loading: ai.loading,
    error: ai.error,
    translated,
    showing: showTranslation && Boolean(translated),
    requested: showTranslation,
    translate,
    showOriginal,
    retry: ai.regenerate,
  };
}
