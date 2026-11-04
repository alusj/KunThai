import { useEffect, useRef, useState } from "react";
import { HiOutlineMagnifyingGlass, HiOutlineXMark } from "react-icons/hi2";

import { searchAccountsToExclude } from "../../../../Backend/services/explore/postControlsService";
import { normalizeExcludedAccounts } from "../../../../Backend/services/explore/postControls";
import { haptics } from "../../../../Backend/services/feedbackService";
import { useI18n } from "../../../../i18n";
import Avatar from "../Avatar";

const SEARCH_DEBOUNCE_MS = 300;
const MIN_QUERY = 2;

// Search by name, @username or KunThai ID, pick several accounts as chips.
// Suggestions open above the field (the keyboard owns the space below it).
export default function ExcludedAccountsPicker({ accounts = [], ownerId = "", max = 100, onChange }) {
  const { t } = useI18n();
  const [query, setQuery] = useState("");
  const [state, setState] = useState({ status: "idle", results: [] });
  const [focused, setFocused] = useState(false);
  const inputRef = useRef(null);
  const wrapRef = useRef(null);
  const requestRef = useRef(0);
  const selectedIds = new Set(accounts.map((account) => account.id));
  const atLimit = accounts.length >= max;

  useEffect(() => {
    const value = query.trim();
    if (value.replace(/^@/, "").length < MIN_QUERY) {
      setState({ status: value ? "short" : "idle", results: [] });
      return undefined;
    }
    const requestId = requestRef.current + 1;
    requestRef.current = requestId;
    const controller = typeof AbortController === "function" ? new AbortController() : null;
    setState((current) => ({ status: "loading", results: current.results }));
    const timer = window.setTimeout(() => {
      searchAccountsToExclude(value, { ownerId, signal: controller?.signal })
        .then((results) => {
          if (requestRef.current !== requestId) return;
          setState({ status: results.length ? "results" : "empty", results });
        })
        .catch(() => {
          if (requestRef.current !== requestId) return;
          setState({ status: "error", results: [] });
        });
    }, SEARCH_DEBOUNCE_MS);
    return () => {
      window.clearTimeout(timer);
      controller?.abort();
    };
  }, [query, ownerId]);

  // Keep the field low in the sheet so the suggestions above it have room.
  useEffect(() => {
    if (!focused) return;
    wrapRef.current?.scrollIntoView?.({ block: "end", behavior: "smooth" });
  }, [focused, state.status]);

  function add(account) {
    if (atLimit || selectedIds.has(account.id)) return;
    haptics.selection("explore");
    onChange?.(normalizeExcludedAccounts([...accounts, account], { ownerId }));
    setQuery("");
    inputRef.current?.focus();
  }

  function remove(id) {
    haptics.light("explore");
    onChange?.(accounts.filter((account) => account.id !== id));
  }

  const showPopup = focused && state.status !== "idle";

  return (
    <div className="px-2 pb-2">
      {accounts.length ? (
        <ul className="mb-3 flex flex-wrap gap-2" aria-label={t("postControls.excludedCount", { n: accounts.length })}>
          {accounts.map((account) => (
            <li key={account.id} className="flex max-w-full items-center gap-2 rounded-full bg-sky-50 py-1 pl-1 pr-1 dark:bg-white/10">
              <Avatar name={account.name || account.username} src={account.avatarUrl} size="xs" />
              <span className="min-w-0 truncate text-xs font-black text-[var(--kt-app-text)]">
                {account.unavailable ? t("postControls.unavailableAccount") : account.name || `@${account.username}`}
              </span>
              <button
                type="button"
                onClick={() => remove(account.id)}
                aria-label={t("postControls.remove", { name: account.name || account.username || t("postControls.unavailableAccount") })}
                className="grid h-8 w-8 flex-none place-items-center rounded-full text-[var(--kt-app-text-muted)] hover:bg-slate-900/5 dark:hover:bg-white/10"
              >
                <HiOutlineXMark aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {atLimit ? (
        <p className="mb-2 text-xs font-bold text-amber-700 dark:text-amber-200">{t("postControls.limitReached", { n: max })}</p>
      ) : (
        <div ref={wrapRef} className="relative">
          {showPopup ? (
            <div
              className="absolute bottom-full left-0 right-0 z-10 mb-2 max-h-60 overflow-y-auto rounded-2xl border border-[var(--kt-app-border)] bg-[var(--kt-app-surface-raised)] p-1 shadow-[0_-12px_32px_rgba(2,6,23,0.22)]"
              role="listbox"
              aria-label={t("postControls.searchLabel")}
            >
              {state.status === "short" ? <PopupNote>{t("postControls.searchMin")}</PopupNote> : null}
              {state.status === "loading" && !state.results.length ? <PopupNote>{t("postControls.searching")}</PopupNote> : null}
              {state.status === "empty" ? <PopupNote>{t("postControls.noResults")}</PopupNote> : null}
              {state.status === "error" ? <PopupNote tone="error">{t("postControls.searchError")}</PopupNote> : null}
              {(state.status === "results" || state.status === "loading") && state.results.map((account) => {
                const added = selectedIds.has(account.id);
                return (
                  <button
                    key={account.id}
                    type="button"
                    role="option"
                    aria-selected={added}
                    disabled={added}
                    // Keep focus in the field so the keyboard stays up.
                    onPointerDown={(event) => event.preventDefault()}
                    onClick={() => add(account)}
                    aria-label={t("postControls.add", { name: account.name || account.username })}
                    className="flex min-h-14 w-full items-center gap-3 rounded-xl px-2 py-2 text-left hover:bg-slate-900/5 dark:hover:bg-white/5 disabled:opacity-60"
                  >
                    <Avatar name={account.name || account.username} src={account.avatarUrl} size="sm" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-black text-[var(--kt-app-text)]">{account.name || `@${account.username}`}</span>
                      <span className="block truncate text-xs font-semibold text-[var(--kt-app-text-muted)]">
                        {account.username ? `@${account.username} · ` : ""}{account.kunthaiId}
                      </span>
                    </span>
                    {added ? <span className="text-[11px] font-black text-sky-700 dark:text-sky-300">{t("postControls.alreadyAdded")}</span> : null}
                  </button>
                );
              })}
            </div>
          ) : null}
          <label className="flex min-h-12 items-center gap-2 rounded-2xl border border-[var(--kt-app-border-strong)] bg-[var(--kt-app-surface)] px-3 focus-within:border-sky-500">
            <HiOutlineMagnifyingGlass className="flex-none text-lg text-[var(--kt-app-text-muted)]" aria-hidden="true" />
            <span className="sr-only">{t("postControls.searchLabel")}</span>
            <input
              ref={inputRef}
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
              placeholder={t("postControls.searchPlaceholder")}
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              enterKeyHint="search"
              className="h-12 min-w-0 flex-1 bg-transparent text-base font-semibold text-[var(--kt-app-text)] outline-none placeholder:text-[var(--kt-app-text-muted)]"
            />
          </label>
        </div>
      )}
    </div>
  );
}

function PopupNote({ children, tone = "" }) {
  return (
    <p className={`px-3 py-3 text-center text-sm font-bold ${tone === "error" ? "text-rose-700 dark:text-rose-200" : "text-[var(--kt-app-text-muted)]"}`} role="status">
      {children}
    </p>
  );
}
