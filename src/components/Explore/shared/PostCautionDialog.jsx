import { createPortal } from "react-dom";
import { ExternalLink, ShieldAlert } from "lucide-react";

import { haptics } from "../../../Backend/services/feedbackService";

const POLICY_LINKS = [
  { label: "Community standards", href: "/policy-center" },
  { label: "Terms of use", href: "/terms" },
  { label: "Privacy policy", href: "/privacy" },
];

// Shown every time a member publishes to Explore. KunThai does not
// pre-moderate posts, so the author confirms responsibility before the
// content goes live.
export default function PostCautionDialog({ open, onCancel, onConfirm, submitting = false }) {
  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-[1450] flex items-end justify-center sm:items-center" role="presentation">
      <button
        type="button"
        aria-label="Go back and edit this post"
        onClick={onCancel}
        className="kt-backdrop absolute inset-0 bg-slate-950/55 backdrop-blur-[2px]"
      />
      <section
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="post-caution-title"
        className="kt-toast-expand-in relative m-3 w-full max-w-md rounded-[28px] border border-amber-100 bg-white p-5 shadow-2xl"
      >
        <div className="flex items-start gap-3">
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-amber-100 text-amber-700">
            <ShieldAlert size={24} />
          </span>
          <div className="min-w-0">
            <p className="text-[11px] font-black uppercase tracking-[0.18em] text-amber-700">Content responsibility</p>
            <h2 id="post-caution-title" className="mt-1 text-xl font-black leading-tight text-slate-950">
              Before this goes live
            </h2>
          </div>
        </div>

        <p className="mt-3 text-sm font-semibold leading-6 text-slate-600">
          KunThai does not review posts before they are published — what you share reaches the community
          exactly as you post it. Please keep your content safe and respectful. If a post breaks our
          community standards and we detect it, the response is immediate: a strike on your account or
          permanent deletion, depending on how serious the content is.
        </p>

        <div className="mt-4 flex flex-wrap gap-2">
          {POLICY_LINKS.map((link) => (
            <a
              key={link.href}
              href={link.href}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-black text-slate-700 transition hover:border-amber-200 hover:bg-amber-50 hover:text-amber-800"
            >
              {link.label}
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
            Go back & edit
          </button>
          <button
            type="button"
            disabled={submitting}
            onClick={() => {
              haptics.light("explore");
              onConfirm?.();
            }}
            className="kt-pressable h-12 rounded-2xl bg-emerald-600 text-sm font-black text-white shadow-lg shadow-emerald-900/15 transition hover:bg-emerald-700 disabled:opacity-60"
          >
            Content is safe — Post
          </button>
        </div>
      </section>
    </div>,
    document.body,
  );
}
