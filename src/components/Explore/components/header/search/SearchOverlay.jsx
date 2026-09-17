import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { RefreshCw, Search, Sparkles, X } from "lucide-react";

import { useExploreSearch } from "../../../../../Backend/hooks/useExploreSearch";
import { openPublicCodeResult } from "../../../../../Backend/services/publicCodeService";
import PublicCodeResultCard from "../../../../shared/PublicCodeResultCard";
import { usePublicCodeLookup } from "../../../../../Backend/hooks/usePublicCodeLookup";
import { useI18n } from "../../../../../i18n";
import { useAiAvailability } from "../../../../../Backend/hooks/useAiTask";
import { useExploreAiSearch } from "../../../../../Backend/hooks/useExploreAiSearch";
import { isNaturalLanguageQuery } from "../../../../../Backend/services/ai/exploreAiModels";
import SearchFilters from "./SearchFilters";
import SearchResultItem from "./SearchResultItem";

export default function SearchOverlay({ initialQuery = "", onClose, onOpenResult, open }) {
  const { t } = useI18n();
  const inputRef = useRef(null);
  const search = useExploreSearch();
  const codeLookup = usePublicCodeLookup(open ? search.query : "");
  const aiAvailability = useAiAvailability();
  const aiSearch = useExploreAiSearch();
  // AI results belong to the exact phrase they were run for; editing the
  // query drops back to ordinary search until the person asks again.
  const aiActive = aiSearch.status !== "idle" && aiSearch.query === search.query.trim();
  const offerAiSearch = aiAvailability.available && !aiActive && isNaturalLanguageQuery(search.query);

  useEffect(() => {
    if (open) {
      if (initialQuery) search.setQuery(initialQuery);
      setTimeout(() => inputRef.current?.focus(), 60);
    }
    // search is intentionally omitted: the hook returns a new object each render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialQuery, open]);

  if (!open) {
    return null;
  }

  function close() {
    aiSearch.reset();
    search.reset();
    onClose?.();
  }

  function openResult(item) {
    search.remember(item.query || search.query || item.title);
    onOpenResult?.(item);
    close();
  }

  function submitSearch() {
    if (aiActive && aiSearch.results[0]) {
      openResult(aiSearch.results[0]);
      return;
    }
    if (search.results[0]) {
      openResult(search.results[0]);
      return;
    }
    if (search.query.trim()) {
      search.remember();
    }
  }

  return createPortal(
    <>
      <button type="button" aria-label={t("explore.closeSearch")} onClick={close} className="fixed inset-0 z-40 cursor-default bg-slate-950/10" />

      <div className="fixed inset-x-2 top-[calc(var(--kt-safe-area-top)+0.5rem)] z-50 sm:inset-x-5">
        <div className="overflow-hidden rounded-[24px] border border-slate-200 bg-white shadow-2xl">
          <div className="flex items-center gap-2 p-2">
            <div className="flex h-11 min-w-0 flex-1 items-center gap-2 rounded-2xl bg-slate-100 px-3 text-slate-500">
              <Search className="h-[18px] w-[18px] flex-none text-slate-400" strokeWidth={2.25} />
              <input
                ref={inputRef}
                type="text"
                value={search.query}
                onChange={(event) => search.setQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") submitSearch();
                  if (event.key === "Escape") close();
                }}
                placeholder={t("explore.searchPlaceholder")}
                className="min-w-0 flex-1 bg-transparent text-sm font-semibold text-slate-900 outline-none placeholder:text-slate-400"
              />
            </div>
            <button
              type="button"
              onClick={close}
              className="flex h-11 w-11 flex-none items-center justify-center rounded-2xl bg-slate-100 text-xl text-slate-700"
              aria-label={t("explore.minimizeSearch")}
            >
              <X size={19} strokeWidth={2.25} />
            </button>
          </div>

          <SearchFilters active={search.filter} onChange={search.setFilter} />

          <div className="max-h-[min(70vh,520px)] overflow-y-auto border-t border-slate-100 p-3">
            {!search.query.trim() ? (
              <div className="space-y-4">
                {search.recent.length ? (
                  <section>
                    <div className="mb-2 flex items-center justify-between">
                      <p className="text-xs font-black uppercase tracking-[0.14em] text-slate-400">{t("explore.recent")}</p>
                      <button type="button" onClick={search.clearRecent} className="text-xs font-black text-sky-700">
                        {t("explore.clear")}
                      </button>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {search.recent.map((item) => (
                        <span key={item} className="inline-flex max-w-full items-center overflow-hidden rounded-2xl bg-slate-100 text-sm font-bold text-slate-600">
                          <button
                            type="button"
                            onClick={() => search.setQuery(item)}
                            className="kt-pressable min-w-0 truncate px-3 py-2 text-left"
                          >
                            {item}
                          </button>
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              search.removeRecent(item);
                            }}
                            className="kt-pressable flex h-9 w-9 shrink-0 items-center justify-center text-slate-400 hover:text-rose-600"
                            aria-label={t("explore.removeRecent", { term: item })}
                          >
                            <X size={14} strokeWidth={2.5} />
                          </button>
                        </span>
                      ))}
                    </div>
                  </section>
                ) : null}

                <section>
                  <p className="mb-2 text-xs font-black uppercase tracking-[0.14em] text-slate-400">{t("explore.suggested")}</p>
                  <div className="flex flex-wrap gap-2">
                    {search.suggestions.map((item) => (
                      <button
                        key={item}
                        type="button"
                        onClick={() => search.setQuery(item)}
                        className="rounded-2xl bg-sky-50 px-3 py-2 text-sm font-bold text-sky-700"
                      >
                        {item}
                      </button>
                    ))}
                  </div>
                </section>
              </div>
            ) : (
              <div className="space-y-2">
                {codeLookup.kind ? (
                  <PublicCodeResultCard
                    lookup={codeLookup}
                    surface="explore"
                    onOpen={(result) => {
                      close();
                      if (result.kind === "kunthai") {
                        window.dispatchEvent(new CustomEvent("kuntai-open-profile", {
                          detail: { userId: result.userId, displayName: result.title, avatarUrl: result.avatarUrl },
                        }));
                        return;
                      }
                      openPublicCodeResult(result);
                    }}
                  />
                ) : null}
                {offerAiSearch ? (
                  <button
                    type="button"
                    onClick={() => aiSearch.run(search.query)}
                    className="kt-pressable flex w-full items-center gap-3 rounded-2xl border border-indigo-100 bg-indigo-50 px-4 py-3 text-left"
                  >
                    <span className="grid h-9 w-9 flex-none place-items-center rounded-xl bg-white text-indigo-700 shadow-sm">
                      <Sparkles size={17} />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-sm font-black text-indigo-800">{t("ai.explore.searchWithAi")}</span>
                      <span className="block truncate text-xs font-semibold text-indigo-600/80">{t("ai.explore.searchWithAiHint")}</span>
                    </span>
                  </button>
                ) : null}

                {aiActive ? (
                  <section className="space-y-2 rounded-2xl border border-indigo-100 bg-indigo-50/60 p-3" aria-live="polite">
                    <div className="flex items-center justify-between gap-2">
                      <p className="flex items-center gap-1.5 text-xs font-black uppercase tracking-[0.14em] text-indigo-700">
                        <Sparkles size={13} />
                        {t("ai.explore.aiResults")}
                      </p>
                      <button type="button" onClick={aiSearch.reset} className="text-xs font-black text-slate-500">
                        {aiSearch.status === "loading" ? t("ai.stop") : t("ai.explore.backToResults")}
                      </button>
                    </div>

                    {aiSearch.status === "loading" ? (
                      <p className="rounded-2xl bg-white px-4 py-3 text-sm font-bold text-slate-500">{t("ai.explore.aiSearching")}</p>
                    ) : null}

                    {aiSearch.status === "error" ? (
                      <div className="flex items-center justify-between gap-2 rounded-2xl bg-rose-50 px-4 py-3 text-sm font-bold text-rose-700" role="alert">
                        <span className="min-w-0">{aiSearch.error?.message}</span>
                        {aiSearch.error?.retryable ? (
                          <button type="button" onClick={() => aiSearch.run(search.query)} className="inline-flex flex-none items-center gap-1 text-xs font-black">
                            <RefreshCw size={12} />
                            {t("ai.retry")}
                          </button>
                        ) : null}
                      </div>
                    ) : null}

                    {aiSearch.status === "done" ? (
                      <>
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="text-xs font-bold text-slate-500">{t("ai.explore.lookedFor")}</span>
                          {[
                            ...aiSearch.intent.keywords,
                            ...aiSearch.intent.hashtags.map((tag) => `#${tag}`),
                            ...aiSearch.topicNames,
                          ].map((term) => (
                            <span key={term} className="rounded-full bg-white px-2.5 py-1 text-xs font-black text-indigo-700 shadow-sm">
                              {term}
                            </span>
                          ))}
                        </div>
                        {aiSearch.usedInterests ? (
                          <p className="text-[11px] font-semibold text-slate-500">{t("ai.explore.usedInterests")}</p>
                        ) : null}
                        {aiSearch.results.length ? (
                          aiSearch.results.map((item) => (
                            <SearchResultItem key={`ai-${item.type}-${item.id}`} item={item} onOpen={openResult} />
                          ))
                        ) : (
                          <p className="rounded-2xl bg-white px-4 py-3 text-sm font-bold text-slate-500">{t("ai.explore.noAiResults")}</p>
                        )}
                      </>
                    ) : null}
                  </section>
                ) : null}

                {aiActive ? null : search.loading ? <p className="rounded-2xl bg-slate-50 px-4 py-3 text-sm font-bold text-slate-500">{t("explore.searching")}</p> : null}
                {!aiActive && search.error ? <p className="rounded-2xl bg-rose-50 px-4 py-3 text-sm font-bold text-rose-600">{search.error}</p> : null}
                {!aiActive && !search.loading && !search.results.length ? (
                  <p className="rounded-2xl bg-slate-50 px-4 py-3 text-sm font-bold text-slate-500">{t("explore.noResultsYet")}</p>
                ) : null}
                {aiActive
                  ? null
                  : search.results.map((item) => (
                      <SearchResultItem key={`${item.type}-${item.id}`} item={item} onOpen={openResult} />
                    ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </>,
    document.body,
  );
}
