import { Check } from "lucide-react";

import { DELETION_REASON_KEYS } from "../../Backend/services/accountDeletionReasonService";
import { t, useI18n } from "../../i18n";

// "Why are you leaving?" on every delete confirmation: suggested reasons to
// tick (any number) and a note of the person's own. Nothing is required.
// value: { reasons: string[], note: string }.
export default function DeletionReasonPicker({ value, onChange, disabled = false, className = "" }) {
  useI18n();
  const reasons = value?.reasons || [];
  const note = value?.note || "";

  function toggle(key) {
    const next = reasons.includes(key) ? reasons.filter((item) => item !== key) : [...reasons, key];
    onChange?.({ reasons: next, note });
  }

  return (
    <fieldset className={`min-w-0 ${className}`} disabled={disabled}>
      <legend className="text-sm font-black text-slate-900">{t("accountDeletion.reasonTitle")}</legend>
      <div className="mt-2 flex flex-wrap gap-2">
        {DELETION_REASON_KEYS.map((key) => {
          const selected = reasons.includes(key);
          return (
            <button
              key={key}
              type="button"
              aria-pressed={selected}
              onClick={() => toggle(key)}
              className={`kt-touchable inline-flex min-h-9 items-center gap-1.5 rounded-full border px-3 py-1.5 text-left text-xs font-bold transition disabled:opacity-60 ${
                selected ? "border-rose-300 bg-rose-50 text-rose-800" : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
              }`}
            >
              {selected ? <Check size={13} strokeWidth={3} /> : null}
              {t(`accountDeletion.reasons.${key}`)}
            </button>
          );
        })}
      </div>
      <textarea
        value={note}
        onChange={(event) => onChange?.({ reasons, note: event.target.value.slice(0, 1000) })}
        placeholder={t("accountDeletion.reasonNotePlaceholder")}
        aria-label={t("accountDeletion.reasonTitle")}
        rows={3}
        className="mt-3 w-full resize-none rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-900 outline-none focus:border-rose-300 focus:ring-2 focus:ring-rose-500/15"
      />
    </fieldset>
  );
}
