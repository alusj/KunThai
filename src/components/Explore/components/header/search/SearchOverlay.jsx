import { useEffect, useRef } from "react";
import { HiOutlineMagnifyingGlass, HiOutlineXMark } from "react-icons/hi2";

import { useExploreSearch } from "../../../../../Backend/hooks/useExploreSearch";
import SearchFilters from "./SearchFilters";
import SearchResultItem from "./SearchResultItem";

export default function SearchOverlay({ onClose, onOpenResult, open }) {
  const inputRef = useRef(null);
  const search = useExploreSearch(open);

  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 60);
    }
  }, [open]);

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

  return (
    <>
      <button type="button" aria-label="Close search" onClick={close} className="fixed inset-0 z-40 cursor-default bg-slate-950/10" />

      <div className="absolute inset-x-2 top-2 z-50 sm:inset-x-5">
        <div className="overflow-hidden rounded-[24px] border border-slate-200 bg-white shadow-2xl">
          <div className="flex items-center gap-2 p-2">
            <div className="flex h-11 min-w-0 flex-1 items-center gap-2 rounded-2xl bg-slate-100 px-3 text-slate-500">
              <HiOutlineMagnifyingGlass className="flex-none text-lg" />
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
              <HiOutlineXMark />
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
                        <button
                          key={item}
                          type="button"
                          onClick={() => search.setQuery(item)}
                          className="rounded-2xl bg-slate-100 px-3 py-2 text-sm font-bold text-slate-600"
                        >
                          {item}
                        </button>
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
    </>
  );
}
