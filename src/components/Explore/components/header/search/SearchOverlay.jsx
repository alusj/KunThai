import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { Search, X } from "lucide-react";

import { useExploreSearch } from "../../../../../Backend/hooks/useExploreSearch";
import { openPublicCodeResult } from "../../../../../Backend/services/publicCodeService";
import PublicCodeResultCard from "../../../../shared/PublicCodeResultCard";
import { usePublicCodeLookup } from "../../../../../Backend/hooks/usePublicCodeLookup";
import SearchFilters from "./SearchFilters";
import SearchResultItem from "./SearchResultItem";

export default function SearchOverlay({ initialQuery = "", onClose, onOpenResult, open }) {
  const inputRef = useRef(null);
  const search = useExploreSearch();
  const codeLookup = usePublicCodeLookup(open ? search.query : "");

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
    search.reset();
    onClose?.();
  }

  function openResult(item) {
    search.remember(item.query || search.query || item.title);
    onOpenResult?.(item);
    close();
  }

  function submitSearch() {
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
      <button type="button" aria-label="Close search" onClick={close} className="fixed inset-0 z-40 cursor-default bg-slate-950/10" />

      <div className="fixed inset-x-2 top-2 z-50 sm:inset-x-5">
        <div className="overflow-hidden rounded-[24px] border border-slate-200 bg-white shadow-2xl">
          <div className="flex items-center gap-2 p-2">
            <div className="flex h-11 min-w-0 flex-1 items-center gap-2 rounded-2xl bg-slate-100 px-3 text-slate-500">
              <Search className="flex-none text-slate-400" size={18} strokeWidth={2.25} />
              <input
                ref={inputRef}
                type="text"
                value={search.query}
                onChange={(event) => search.setQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") submitSearch();
                  if (event.key === "Escape") close();
                }}
                placeholder="Search posts, videos, people, #topics..."
                className="min-w-0 flex-1 bg-transparent text-sm font-semibold text-slate-900 outline-none placeholder:text-slate-400"
              />
            </div>
            <button
              type="button"
              onClick={close}
              className="flex h-11 w-11 flex-none items-center justify-center rounded-2xl bg-slate-100 text-xl text-slate-700"
              aria-label="Minimize search"
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
                      <p className="text-xs font-black uppercase tracking-[0.14em] text-slate-400">Recent</p>
                      <button type="button" onClick={search.clearRecent} className="text-xs font-black text-sky-700">
                        Clear
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
                            aria-label={`Remove ${item} from recent searches`}
                          >
                            <X size={14} strokeWidth={2.5} />
                          </button>
                        </span>
                      ))}
                    </div>
                  </section>
                ) : null}

                <section>
                  <p className="mb-2 text-xs font-black uppercase tracking-[0.14em] text-slate-400">Suggested</p>
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
                {search.loading ? <p className="rounded-2xl bg-slate-50 px-4 py-3 text-sm font-bold text-slate-500">Searching...</p> : null}
                {search.error ? <p className="rounded-2xl bg-rose-50 px-4 py-3 text-sm font-bold text-rose-600">{search.error}</p> : null}
                {!search.loading && !search.results.length ? (
                  <p className="rounded-2xl bg-slate-50 px-4 py-3 text-sm font-bold text-slate-500">No results yet.</p>
                ) : null}
                {search.results.map((item) => (
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
