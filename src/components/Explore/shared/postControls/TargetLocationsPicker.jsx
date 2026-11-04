import { useEffect, useRef, useState } from "react";
import { HiOutlineMapPin, HiOutlineXMark } from "react-icons/hi2";

import { haptics } from "../../../../Backend/services/feedbackService";
import { resolveTargetArea, searchTargetAreas } from "../../../../Backend/services/explore/postControlsService";
import { MAX_TARGET_LOCATIONS, normalizeTargetLocations } from "../../../../Backend/services/explore/postControls";
import { useI18n } from "../../../../i18n";
import { usePopupRoom } from "./usePopupRoom";

const SEARCH_DEBOUNCE_MS = 350;

// Up to 5 cities, districts or regions where the post should be discovered.
// Search favours the United States but covers every country. Suggestions
// open above the field. Only the KunThai region and a label are kept.
export default function TargetLocationsPicker({ locations = [], onChange }) {
  const { t } = useI18n();
  const [query, setQuery] = useState("");
  const [state, setState] = useState({ status: "idle", results: [] });
  const [focused, setFocused] = useState(false);
  const [notice, setNotice] = useState("");
  const [resolvingKey, setResolvingKey] = useState("");
  const inputRef = useRef(null);
  const wrapRef = useRef(null);
  const requestRef = useRef(0);
  const blurTimerRef = useRef(0);
  const pressRef = useRef(null);
  const atLimit = locations.length >= MAX_TARGET_LOCATIONS;
  const chosen = new Set(locations.map((location) => location.label.toLowerCase()));

  useEffect(() => {
    const value = query.trim();
    if (value.length < 2) {
      setState({ status: value ? "short" : "idle", results: [] });
      return undefined;
    }
    const requestId = requestRef.current + 1;
    requestRef.current = requestId;
    const controller = typeof AbortController === "function" ? new AbortController() : null;
    setState((current) => ({ status: "loading", results: current.results }));
    const timer = window.setTimeout(() => {
      searchTargetAreas(value, { signal: controller?.signal })
        .then((results) => {
          if (requestRef.current === requestId) setState({ status: results.length ? "results" : "empty", results });
        })
        .catch((error) => {
          if (error?.name === "AbortError" || requestRef.current !== requestId) return;
          setState({ status: "error", results: [] });
        });
    }, SEARCH_DEBOUNCE_MS);
    return () => {
      window.clearTimeout(timer);
      controller?.abort();
    };
  }, [query]);

  useEffect(() => () => window.clearTimeout(blurTimerRef.current), []);

  useEffect(() => {
    if (focused) wrapRef.current?.scrollIntoView?.({ block: "end", behavior: "smooth" });
  }, [focused, state.status]);

  async function pick(area) {
    if (atLimit || chosen.has(area.label.toLowerCase()) || resolvingKey) return;
    setResolvingKey(area.key);
    setNotice("");
    try {
      const location = await resolveTargetArea(area);
      if (!location) {
        setNotice(t("postControls.locationNoRegion"));
        return;
      }
      haptics.selection("explore");
      onChange?.(normalizeTargetLocations([...locations, location]));
      setQuery("");
      inputRef.current?.focus();
    } catch {
      setNotice(t("postControls.searchError"));
    } finally {
      setResolvingKey("");
    }
  }

  function remove(label) {
    haptics.light("explore");
    onChange?.(locations.filter((location) => location.label !== label));
  }

  const showPopup = focused && state.status !== "idle";
  const popupRoom = usePopupRoom(wrapRef, showPopup, [state.status, state.results.length]);

  return (
    <div className="px-2 pb-2">
      {locations.length ? (
        <ul className="mb-3 flex flex-wrap gap-2">
          {locations.map((location) => (
            <li key={`${location.id}-${location.label}`} className="flex max-w-full items-center gap-1.5 rounded-full bg-teal-50 py-1 pl-3 pr-1 dark:bg-white/10">
              <HiOutlineMapPin className="flex-none text-sm text-teal-700 dark:text-teal-300" aria-hidden="true" />
              <span className="min-w-0 truncate text-xs font-black text-[var(--kt-app-text)]">{location.label}</span>
              <button
                type="button"
                onClick={() => remove(location.label)}
                aria-label={t("postControls.remove", { name: location.label })}
                className="grid h-8 w-8 flex-none place-items-center rounded-full text-[var(--kt-app-text-muted)] hover:bg-slate-900/5 dark:hover:bg-white/10"
              >
                <HiOutlineXMark aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {notice ? <p className="mb-2 text-xs font-bold text-amber-700 dark:text-amber-200" role="status">{notice}</p> : null}

      {atLimit ? (
        <p className="mb-2 text-xs font-bold text-amber-700 dark:text-amber-200">{t("postControls.locationLimit", { n: MAX_TARGET_LOCATIONS })}</p>
      ) : (
        <div ref={wrapRef} className="relative">
          {showPopup ? (
            <div
              style={{ maxHeight: popupRoom }}
              className="absolute bottom-full left-0 right-0 z-10 mb-2 overflow-y-auto overscroll-contain rounded-2xl border border-[var(--kt-app-border)] bg-[var(--kt-app-surface-raised)] p-1 shadow-[0_-12px_32px_rgba(2,6,23,0.22)]"
              role="listbox"
              aria-label={t("postControls.locationSearchLabel")}
            >
              {state.status === "short" ? <Note>{t("postControls.searchMin")}</Note> : null}
              {state.status === "loading" && !state.results.length ? <Note>{t("postControls.searching")}</Note> : null}
              {state.status === "empty" ? <Note>{t("postControls.locationNoResults")}</Note> : null}
              {state.status === "error" ? <Note tone="error">{t("postControls.searchError")}</Note> : null}
              {(state.status === "results" || state.status === "loading") && state.results.map((area) => {
                const added = chosen.has(area.label.toLowerCase());
                return (
                  <button
                    key={area.key}
                    type="button"
                    role="option"
                    aria-selected={added}
                    disabled={added}
                    onPointerDown={(event) => {
                      event.preventDefault();
                      pressRef.current = { key: area.key, x: event.clientX, y: event.clientY };
                    }}
                    onPointerUp={(event) => {
                      const press = pressRef.current;
                      pressRef.current = null;
                      if (!press || press.key !== area.key) return;
                      if (Math.abs(event.clientY - press.y) > 10 || Math.abs(event.clientX - press.x) > 10) return;
                      event.preventDefault();
                      pick(area);
                    }}
                    onPointerCancel={() => {
                      pressRef.current = null;
                    }}
                    onClick={(event) => {
                      if (event.detail === 0) pick(area);
                    }}
                    className="flex min-h-12 w-full items-center gap-3 rounded-xl px-2 py-2 text-left hover:bg-slate-900/5 disabled:opacity-60 dark:hover:bg-white/5"
                  >
                    <HiOutlineMapPin className="flex-none text-lg text-teal-700 dark:text-teal-300" aria-hidden="true" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-black text-[var(--kt-app-text)]">{area.name}</span>
                      <span className="block truncate text-xs font-semibold text-[var(--kt-app-text-muted)]">{area.label}</span>
                    </span>
                    {resolvingKey === area.key ? (
                      <span className="h-4 w-4 flex-none animate-spin rounded-full border-2 border-sky-300 border-t-sky-700" aria-hidden="true" />
                    ) : added ? (
                      <span className="text-[11px] font-black text-sky-700 dark:text-sky-300">{t("postControls.alreadyAdded")}</span>
                    ) : null}
                  </button>
                );
              })}
            </div>
          ) : null}
          <label className="flex min-h-12 items-center gap-2 rounded-2xl border border-[var(--kt-app-border-strong)] bg-[var(--kt-app-surface)] px-3 focus-within:border-sky-500">
            <HiOutlineMapPin className="flex-none text-lg text-[var(--kt-app-text-muted)]" aria-hidden="true" />
            <span className="sr-only">{t("postControls.locationSearchLabel")}</span>
            <input
              ref={inputRef}
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onFocus={() => {
                window.clearTimeout(blurTimerRef.current);
                setFocused(true);
              }}
              onBlur={() => {
                window.clearTimeout(blurTimerRef.current);
                blurTimerRef.current = window.setTimeout(() => setFocused(false), 300);
              }}
              placeholder={t("postControls.locationSearchPlaceholder")}
              autoComplete="off"
              spellCheck={false}
              enterKeyHint="search"
              className="h-12 min-w-0 flex-1 bg-transparent text-base font-semibold text-[var(--kt-app-text)] shadow-none outline-none ring-0 placeholder:text-[var(--kt-app-text-muted)] focus:outline-none focus-visible:outline-none"
            />
          </label>
        </div>
      )}
    </div>
  );
}

function Note({ children, tone = "" }) {
  return (
    <p className={`px-3 py-3 text-center text-sm font-bold ${tone === "error" ? "text-rose-700 dark:text-rose-200" : "text-[var(--kt-app-text-muted)]"}`} role="status">
      {children}
    </p>
  );
}
