// Every field that asks for a KunThai account (add an operator, a store admin,
// a Space member, share visibility credits) works like the Explore "Exclude
// accounts" search: type a name, an @username or a KunThai ID and pick the
// account from the suggestions above the field (the keyboard owns the space
// below it). A full KunThai ID is checked automatically: the account it
// belongs to shows at once, or the field says no account has it.
//
// The field stays a KunThai ID field for the screen that holds it: picking an
// account writes that account's KunThai ID into `value` (onChange) and hands
// the account to `onPick`, so the screen's own lookup and submit keep working.

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { CheckCircle2, Search } from "lucide-react";

import { searchAccountsToExclude } from "../../Backend/services/explore/postControlsService";
import { haptics } from "../../Backend/services/feedbackService";
import { useI18n } from "../../i18n";
import Avatar from "../Explore/shared/Avatar";

const SEARCH_DEBOUNCE_MS = 300;
const MIN_QUERY = 2;
const KUNTHAI_ID_PATTERN = /^\s*KTU[\s-]?[A-Z0-9]/i;

function compact(value = "") {
  return String(value || "").replace(/[\s-]/g, "").toUpperCase();
}

function nearestScroller(element) {
  for (let node = element?.parentElement; node && node !== document.body; node = node.parentElement) {
    const overflowY = window.getComputedStyle(node).overflowY;
    if (overflowY === "auto" || overflowY === "scroll") return node;
  }
  return null;
}

export default function KunThaiAccountSearchField({
  value = "",
  onChange,
  onPick,
  excludeUserId = "",
  placeholder,
  ariaLabel,
  disabled = false,
  autoFocus = false,
  inputClassName = "",
  // Off where the screen shows its own card for the account it found.
  showConfirmation = true,
}) {
  const { t } = useI18n();
  const [state, setState] = useState({ status: "idle", results: [] });
  const [focused, setFocused] = useState(false);
  const [picked, setPicked] = useState(null);
  const [room, setRoom] = useState(240);
  const wrapRef = useRef(null);
  const inputRef = useRef(null);
  const requestRef = useRef(0);
  const blurTimerRef = useRef(0);
  const pressRef = useRef(null);
  const query = String(value || "").trim();
  const isIdQuery = KUNTHAI_ID_PATTERN.test(query);
  const pickedShown = picked && compact(picked.kunthaiId) === compact(query) ? picked : null;
  // A full KunThai ID with exactly one account is the auto check's answer.
  const idMatch = !pickedShown && isIdQuery && state.status === "results" && state.results.length === 1 ? state.results[0] : null;
  const confirmed = pickedShown || idMatch;

  useEffect(() => {
    if (pickedShown || query.replace(/^@/, "").length < MIN_QUERY) {
      requestRef.current += 1;
      setState({ status: query && !pickedShown ? "short" : "idle", results: [] });
      return undefined;
    }
    const requestId = requestRef.current + 1;
    requestRef.current = requestId;
    const controller = typeof AbortController === "function" ? new AbortController() : null;
    setState((current) => ({ status: "loading", results: current.results }));
    const timer = window.setTimeout(() => {
      searchAccountsToExclude(query, { ownerId: excludeUserId, signal: controller?.signal })
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
    // `pickedShown` changes exactly when `query` stops matching the pick.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, excludeUserId, Boolean(pickedShown)]);

  useEffect(() => () => window.clearTimeout(blurTimerRef.current), []);

  // An exact KunThai ID with one account needs no list: the card below says it.
  const showPopup = focused && !confirmed && state.status !== "idle" && !(isIdQuery && state.status === "short");

  // The list opens above the field; it is only as tall as the space above
  // the field inside its scroll area, so every row can really be tapped.
  useLayoutEffect(() => {
    if (!showPopup) return undefined;
    function measure() {
      const anchor = wrapRef.current;
      if (!anchor) return;
      const scroller = nearestScroller(anchor);
      const top = scroller ? scroller.getBoundingClientRect().top : 0;
      setRoom(Math.max(96, Math.min(240, Math.floor(anchor.getBoundingClientRect().top - top - 12))));
    }
    measure();
    window.visualViewport?.addEventListener("resize", measure);
    window.addEventListener("resize", measure);
    const timer = window.setTimeout(measure, 350);
    return () => {
      window.visualViewport?.removeEventListener("resize", measure);
      window.removeEventListener("resize", measure);
      window.clearTimeout(timer);
    };
  }, [showPopup, state.status, state.results.length]);

  function pick(account) {
    haptics.selection();
    setPicked(account);
    onChange?.(account.kunthaiId);
    onPick?.(account);
    setFocused(false);
    inputRef.current?.blur();
  }

  return (
    <div className="min-w-0">
      <div ref={wrapRef} className="relative">
        {showPopup ? (
          <div
            style={{ maxHeight: room }}
            className="absolute bottom-full left-0 right-0 z-30 mb-2 overflow-y-auto overscroll-contain rounded-2xl border border-slate-200 bg-white p-1 shadow-[0_-12px_32px_rgba(2,6,23,0.22)]"
            role="listbox"
            aria-label={ariaLabel || t("postControls.searchPlaceholder")}
          >
            {state.status === "short" ? <PopupNote>{t("postControls.searchMin")}</PopupNote> : null}
            {state.status === "loading" && !state.results.length ? <PopupNote>{t("postControls.searching")}</PopupNote> : null}
            {state.status === "empty" ? <PopupNote>{isIdQuery ? t("postControls.noIdMatch") : t("postControls.noResults")}</PopupNote> : null}
            {state.status === "error" ? <PopupNote tone="error">{t("postControls.searchError")}</PopupNote> : null}
            {(state.status === "results" || state.status === "loading") && state.results.map((account) => (
              <button
                key={account.id}
                type="button"
                role="option"
                aria-selected="false"
                // iOS closes the keyboard (and moves the sheet) before a click
                // arrives, so a tap is taken on finger-up; a drag is not a pick.
                onPointerDown={(event) => {
                  event.preventDefault();
                  pressRef.current = { id: account.id, x: event.clientX, y: event.clientY };
                }}
                onPointerUp={(event) => {
                  const press = pressRef.current;
                  pressRef.current = null;
                  if (!press || press.id !== account.id) return;
                  if (Math.abs(event.clientY - press.y) > 10 || Math.abs(event.clientX - press.x) > 10) return;
                  event.preventDefault();
                  pick(account);
                }}
                onPointerCancel={() => {
                  pressRef.current = null;
                }}
                onClick={(event) => {
                  if (event.detail === 0) pick(account);
                }}
                aria-label={t("postControls.chooseAccount", { name: account.name || account.username })}
                className="flex min-h-14 w-full items-center gap-3 rounded-xl px-2 py-2 text-left hover:bg-slate-100"
              >
                <Avatar name={account.name || account.username} src={account.avatarUrl} size="sm" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-black text-slate-950">{account.name || `@${account.username}`}</span>
                  <span className="block truncate text-xs font-semibold text-slate-500">
                    {account.username ? `@${account.username} · ` : ""}{account.kunthaiId}
                  </span>
                </span>
              </button>
            ))}
          </div>
        ) : null}

        <label className="relative block">
          <Search size={16} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" aria-hidden="true" />
          <span className="sr-only">{ariaLabel || t("postControls.searchPlaceholder")}</span>
          <input
            ref={inputRef}
            type="search"
            value={value}
            disabled={disabled}
            autoFocus={autoFocus}
            onChange={(event) => onChange?.(event.target.value)}
            onFocus={() => {
              window.clearTimeout(blurTimerRef.current);
              setFocused(true);
            }}
            // Let a tap on a suggestion land before the list closes.
            onBlur={() => {
              window.clearTimeout(blurTimerRef.current);
              blurTimerRef.current = window.setTimeout(() => setFocused(false), 300);
            }}
            placeholder={placeholder || t("postControls.searchPlaceholder")}
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            enterKeyHint="search"
            className={`h-12 w-full min-w-0 rounded-2xl border border-slate-200 bg-slate-50 pl-10 pr-4 text-base font-semibold text-slate-950 outline-none transition placeholder:text-slate-400 focus:border-sky-500 focus:bg-white focus:ring-4 focus:ring-sky-100 disabled:opacity-60 ${inputClassName}`}
          />
        </label>
      </div>

      {confirmed && showConfirmation ? (
        <div className="mt-2 flex items-center gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-2.5" role="status" aria-live="polite">
          <Avatar name={confirmed.name || confirmed.username} src={confirmed.avatarUrl} size="sm" />
          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-1.5 text-[11px] font-black uppercase tracking-wide text-emerald-700">
              <CheckCircle2 size={13} aria-hidden="true" />
              {t("postControls.accountFound")}
            </span>
            <span className="block truncate text-sm font-black text-slate-950">{confirmed.name || `@${confirmed.username}`}</span>
            <span className="block truncate text-xs font-semibold text-slate-500">
              {confirmed.username ? `@${confirmed.username} · ` : ""}{confirmed.kunthaiId}
            </span>
          </span>
          {pickedShown && !disabled ? (
            <button
              type="button"
              onClick={() => {
                setPicked(null);
                onChange?.("");
                window.requestAnimationFrame(() => inputRef.current?.focus());
              }}
              className="kt-touchable h-9 flex-none rounded-xl px-3 text-xs font-black text-emerald-800 hover:bg-emerald-100"
            >
              {t("postControls.changeAccount")}
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function PopupNote({ children, tone = "" }) {
  return (
    <p className={`px-3 py-3 text-center text-sm font-bold ${tone === "error" ? "text-rose-700" : "text-slate-500"}`} role="status">
      {children}
    </p>
  );
}
