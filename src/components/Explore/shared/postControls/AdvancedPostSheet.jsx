import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { HiOutlineAdjustmentsHorizontal, HiOutlineXMark } from "react-icons/hi2";

import { useBrowserBack } from "../../../../Backend/hooks/useBrowserBack";
import { haptics } from "../../../../Backend/services/feedbackService";
import { MAX_EXCLUDED_ACCOUNTS, normalizePostControls } from "../../../../Backend/services/explore/postControls";
import { useI18n } from "../../../../i18n";
import useBodyScrollLock from "../../../shared/useBodyScrollLock";
import ExcludedAccountsPicker from "./ExcludedAccountsPicker";

const SLIDE_MS = 220;

// The composer's Advanced sheet (and the owner's "Post settings" after
// publishing). About 75% of the screen, in the KunThai light or dark appearance, with sections and a
// fixed footer. Edits stay in the sheet until "Save settings"; Close drops
// them. Nothing reaches the database from here while composing: the composer
// sends the settings with the post itself.
export default function AdvancedPostSheet({
  open,
  initialControls,
  ownerId = "",
  title = "",
  loading = false,
  loadError = "",
  saving = false,
  onRetry,
  onClose,
  onSave,
}) {
  const { t } = useI18n();
  const [rendered, setRendered] = useState(open);
  const [shown, setShown] = useState(false);
  const [draft, setDraft] = useState(() => normalizePostControls(initialControls, { ownerId }));
  const [excludeOn, setExcludeOn] = useState(() => (initialControls?.excludedAccounts?.length || 0) > 0);
  const closeTimerRef = useRef(null);

  // Opening: mount, then slide up on the next frame. Closing: slide down, then unmount.
  useEffect(() => {
    window.clearTimeout(closeTimerRef.current);
    if (open) {
      setRendered(true);
      const frame = window.requestAnimationFrame(() => setShown(true));
      return () => window.cancelAnimationFrame(frame);
    }
    setShown(false);
    closeTimerRef.current = window.setTimeout(() => setRendered(false), SLIDE_MS);
    return () => window.clearTimeout(closeTimerRef.current);
  }, [open]);

  // Each opening starts from the saved settings (loaded ones arrive later in edit mode).
  const initialKey = JSON.stringify(initialControls || {});
  useEffect(() => {
    if (!open) return;
    const next = normalizePostControls(JSON.parse(initialKey), { ownerId });
    setDraft(next);
    setExcludeOn(next.excludedAccounts.length > 0);
  }, [open, initialKey, ownerId]);

  useBrowserBack(open, () => onClose?.(), "advanced-post-sheet");
  useBodyScrollLock(open);

  if (!rendered) return null;

  function setFlag(flag, value) {
    setDraft((current) => ({ ...current, [flag]: value }));
  }

  function save() {
    if (saving || loading) return;
    onSave?.(normalizePostControls({ ...draft, excludedAccounts: excludeOn ? draft.excludedAccounts : [] }, { ownerId }));
  }

  const body = loading ? (
    <p className="py-10 text-center text-sm font-bold text-[var(--kt-app-text-muted)]" role="status">{t("postControls.loading")}</p>
  ) : loadError ? (
    <div className="py-10 text-center" role="alert">
      <p className="text-sm font-bold text-rose-700 dark:text-rose-200">{loadError}</p>
      {onRetry ? (
        <button type="button" onClick={onRetry} className="mt-3 min-h-11 rounded-xl border border-[var(--kt-app-border)] bg-[var(--kt-app-surface-soft)] px-4 text-sm font-black text-[var(--kt-app-text)]">
          {t("postControls.retry")}
        </button>
      ) : null}
    </div>
  ) : (
    <>
      <Section title={t("postControls.sectionComments")}>
        <ToggleRow
          label={t("postControls.commentsDisabled")}
          hint={t("postControls.commentsDisabledHint")}
          checked={draft.commentsDisabled}
          onChange={(value) => setFlag("commentsDisabled", value)}
        />
        <ToggleRow
          label={t("postControls.commentsHidden")}
          hint={t("postControls.commentsHiddenHint")}
          checked={draft.commentsHidden}
          onChange={(value) => setFlag("commentsHidden", value)}
        />
        <ToggleRow
          label={t("postControls.commentsFollowersOnly")}
          hint={draft.commentsDisabled ? t("postControls.commentsOffOverrides") : t("postControls.commentsFollowersOnlyHint")}
          checked={draft.commentsFollowersOnly}
          muted={draft.commentsDisabled}
          onChange={(value) => setFlag("commentsFollowersOnly", value)}
        />
      </Section>

      <Section title={t("postControls.sectionLikes")}>
        <ToggleRow
          label={t("postControls.likesDisabled")}
          hint={t("postControls.likesDisabledHint")}
          checked={draft.likesDisabled}
          onChange={(value) => setFlag("likesDisabled", value)}
        />
        {!draft.likesDisabled ? (
          <ToggleRow
            label={t("postControls.likeCountHidden")}
            hint={t("postControls.likeCountHiddenHint")}
            checked={draft.likeCountHidden}
            onChange={(value) => setFlag("likeCountHidden", value)}
          />
        ) : null}
      </Section>

      <Section title={t("postControls.sectionReposts")}>
        <ToggleRow
          label={t("postControls.repostsDisabled")}
          hint={t("postControls.repostsDisabledHint")}
          checked={draft.repostsDisabled}
          onChange={(value) => setFlag("repostsDisabled", value)}
        />
      </Section>

      <Section title={t("postControls.sectionExclude")}>
        <ToggleRow
          label={t("postControls.excludeToggle")}
          hint={t("postControls.excludeHint")}
          checked={excludeOn}
          badge={excludeOn && draft.excludedAccounts.length ? t("postControls.excludedCount", { n: draft.excludedAccounts.length }) : ""}
          onChange={setExcludeOn}
        />
        {excludeOn ? (
          <ExcludedAccountsPicker
            ownerId={ownerId}
            accounts={draft.excludedAccounts}
            max={MAX_EXCLUDED_ACCOUNTS}
            onChange={(excludedAccounts) => setDraft((current) => ({ ...current, excludedAccounts }))}
          />
        ) : null}
      </Section>
    </>
  );

  return createPortal(
    <div className="fixed inset-0 z-[1500] flex items-end justify-center" role="presentation">
      <button
        type="button"
        aria-label={t("postControls.close")}
        tabIndex={-1}
        onClick={() => onClose?.()}
        className={`absolute inset-0 bg-slate-950/50 transition-opacity duration-200 ${shown ? "opacity-100" : "opacity-0"}`}
      />
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="kt-advanced-post-title"
        className={`relative flex h-[75dvh] max-h-[calc(100dvh-env(safe-area-inset-top)-12px)] w-full max-w-xl flex-col overflow-hidden rounded-t-[28px] bg-[var(--kt-app-surface)] text-[var(--kt-app-text)] shadow-[0_-24px_60px_rgba(2,6,23,0.35)] transition-transform duration-200 ease-out will-change-transform ${
          shown ? "translate-y-0" : "translate-y-full"
        }`}
      >
        <header className="flex flex-none items-start gap-3 border-b border-[var(--kt-app-border)] px-5 pb-3 pt-3">
          <div className="min-w-0 flex-1">
            <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-[var(--kt-app-border-strong)]" aria-hidden="true" />
            <h2 id="kt-advanced-post-title" className="flex items-center gap-2 text-lg font-black">
              <HiOutlineAdjustmentsHorizontal className="text-xl text-sky-700 dark:text-sky-300" aria-hidden="true" />
              {title || t("postControls.sheetTitle")}
            </h2>
            <p className="mt-0.5 text-xs font-semibold text-[var(--kt-app-text-muted)]">{t("postControls.sheetSubtitle")}</p>
          </div>
          <button
            type="button"
            onClick={() => onClose?.()}
            aria-label={t("postControls.close")}
            className="mt-4 grid h-11 w-11 flex-none place-items-center rounded-full bg-[var(--kt-app-surface-soft)] text-xl text-[var(--kt-app-text-soft)]"
          >
            <HiOutlineXMark aria-hidden="true" />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4" data-kt-advanced-scroll>
          {body}
        </div>

        <footer className="flex flex-none gap-3 border-t border-[var(--kt-app-border)] bg-[var(--kt-app-surface)] px-4 pt-3 pb-[calc(12px+env(safe-area-inset-bottom))]">
          <button
            type="button"
            onClick={() => onClose?.()}
            className="min-h-12 flex-1 rounded-2xl border border-[var(--kt-app-border)] bg-[var(--kt-app-surface-soft)] text-sm font-black text-[var(--kt-app-text)]"
          >
            {t("postControls.close")}
          </button>
          <button
            type="button"
            onClick={save}
            disabled={saving || loading || Boolean(loadError)}
            className="min-h-12 flex-[1.4] rounded-2xl bg-sky-700 text-sm font-black text-white disabled:opacity-50 dark:bg-sky-500 dark:text-slate-950"
          >
            {saving ? t("postControls.saving") : t("postControls.save")}
          </button>
        </footer>
      </section>
    </div>,
    document.body,
  );
}

function Section({ title, children }) {
  return (
    <section className="mb-4 rounded-[22px] border border-[var(--kt-app-border)] bg-[var(--kt-app-surface-soft)] p-2">
      <h3 className="px-3 pb-1 pt-2 text-[11px] font-black uppercase tracking-[0.14em] text-sky-700 dark:text-sky-300">{title}</h3>
      {children}
    </section>
  );
}

function ToggleRow({ label, hint, checked, muted = false, badge = "", onChange }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      // Same feel as Fleet HQ's alert switches: a clear buzz as it turns on,
      // a lighter one as it turns off (on top of the app-wide switch tick).
      data-kt-feedback="off"
      onClick={() => {
        if (checked) haptics.light("explore");
        else haptics.medium("explore");
        onChange?.(!checked);
      }}
      className={`flex min-h-14 w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left transition hover:bg-slate-900/5 dark:hover:bg-white/5 ${muted ? "opacity-60" : ""}`}
    >
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-2 text-sm font-black text-[var(--kt-app-text)]">
          {label}
          {badge ? <span className="rounded-full bg-sky-100 px-2 py-0.5 text-[11px] font-black text-sky-800 dark:bg-sky-400/15 dark:text-sky-200">{badge}</span> : null}
        </span>
        {hint ? <span className="mt-0.5 block text-xs font-semibold leading-5 text-[var(--kt-app-text-muted)]">{hint}</span> : null}
      </span>
      <span
        aria-hidden="true"
        className={`relative h-7 w-12 flex-none rounded-full transition-colors ${checked ? "bg-sky-600 dark:bg-sky-500" : "bg-slate-300 dark:bg-slate-600"}`}
      >
        <span className={`absolute top-1 h-5 w-5 rounded-full bg-[#ffffff] shadow transition-transform ${checked ? "translate-x-6" : "translate-x-1"}`} />
      </span>
    </button>
  );
}
