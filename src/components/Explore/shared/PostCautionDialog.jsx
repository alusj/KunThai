import { createPortal } from "react-dom";
import { ExternalLink, ShieldAlert } from "lucide-react";

import { haptics } from "../../../Backend/services/feedbackService";
import { useI18n } from "../../../i18n";

const POLICY_LINKS = [
  { labelKey: "post.communityStandards", href: "/policy-center" },
  { labelKey: "post.termsOfUse", href: "/terms" },
  { labelKey: "post.privacyPolicy", href: "/privacy" },
];

const CAUTION_RULE_KEYS = ["post.cautionRule1", "post.cautionRule2", "post.cautionRule3"];

// Shown every time a member publishes to Explore. KunThai does not
// pre-moderate posts, so the author confirms responsibility before the
// content goes live.
export default function PostCautionDialog({ open, onCancel, onConfirm, submitting = false }) {
  const { t } = useI18n();
  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-[1450] flex items-center justify-center" role="presentation">
      <button
        type="button"
        aria-label={t("post.goBackEditAria")}
        onClick={onCancel}
        className="kt-backdrop absolute inset-0 bg-slate-950/65 backdrop-blur-[2px]"
      />
      <section
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="post-caution-title"
        className="kt-toast-expand-in relative m-3 w-full max-w-md overflow-hidden rounded-[28px] border border-orange-300 bg-white shadow-2xl shadow-orange-950/25"
      >
        <div className="h-1.5 bg-gradient-to-r from-orange-500 via-rose-500 to-red-600" />

        <div className="p-5">
          <div className="flex items-start gap-3">
            <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-orange-100 text-orange-700 ring-1 ring-orange-200">
              <ShieldAlert size={24} />
            </span>
            <div className="min-w-0">
              <p className="text-[11px] font-black uppercase tracking-[0.18em] text-orange-700">{t("post.strictPostingCheck")}</p>
              <h2 id="post-caution-title" className="mt-1 text-xl font-black leading-tight text-slate-950">
                {t("post.goesLiveImmediately")}
              </h2>
            </div>
          </div>

          <p className="mt-3 text-sm font-bold leading-6 text-slate-700">
            {t("post.cautionIntro")}
          </p>

          <div className="mt-4 grid gap-2 rounded-2xl border border-orange-200 bg-orange-50 p-3">
            {CAUTION_RULE_KEYS.map((ruleKey) => (
              <div key={ruleKey} className="flex gap-2 text-xs font-black leading-5 text-orange-950">
                <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-orange-600" />
                <span>{t(ruleKey)}</span>
              </div>
            ))}
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            {POLICY_LINKS.map((link) => (
              <a
                key={link.href}
                href={link.href}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-black text-slate-700 transition hover:border-orange-300 hover:bg-orange-50 hover:text-orange-800"
              >
                {t(link.labelKey)}
                <ExternalLink size={12} />
              </a>
            ))}
          </div>

          <div className="mt-5 grid grid-cols-1 gap-2 sm:grid-cols-2">
            <button
              type="button"
              onClick={onCancel}
              className="kt-pressable h-12 rounded-2xl bg-slate-100 text-sm font-black text-slate-700 transition hover:bg-slate-200"
            >
              {t("post.goBackEdit")}
            </button>
            <button
              type="button"
              disabled={submitting}
              onClick={() => {
                haptics.light("explore");
                onConfirm?.();
              }}
              className="kt-pressable h-12 rounded-2xl bg-orange-500 text-sm font-black text-white shadow-lg shadow-orange-900/25 transition hover:bg-orange-600 disabled:opacity-60"
            >
              {submitting ? t("post.publishing") : t("post.acceptPublish")}
            </button>
          </div>
        </div>
      </section>
    </div>,
    document.body,
  );
}
