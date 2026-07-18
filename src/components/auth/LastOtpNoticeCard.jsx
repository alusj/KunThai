import { createPortal } from "react-dom";
import { ShieldAlert } from "lucide-react";

// Centered floating caution shown right after the SECOND OTP is sent (account
// creation or password recovery). That second code is the last one allowed for
// this number until the 72-hour cooldown ends.
export default function LastOtpNoticeCard({ open, onCancel, onVerify }) {
  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-[1500] flex items-center justify-center px-4" role="presentation">
      <button
        type="button"
        aria-label="Close OTP notice"
        onClick={onCancel}
        className="absolute inset-0 bg-slate-950/60 backdrop-blur-[2px]"
      />
      <section
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="last-otp-title"
        className="kt-toast-expand-in relative w-full max-w-md overflow-hidden rounded-[28px] border border-amber-300 bg-white shadow-2xl shadow-amber-950/25"
      >
        <div className="h-1.5 bg-gradient-to-r from-amber-400 via-orange-500 to-rose-500" />
        <div className="p-5">
          <div className="flex items-start gap-3">
            <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-amber-100 text-amber-700 ring-1 ring-amber-200">
              <ShieldAlert size={24} />
            </span>
            <div className="min-w-0">
              <p className="text-[11px] font-black uppercase tracking-[0.18em] text-amber-700">Final OTP sent</p>
              <h2 id="last-otp-title" className="mt-1 text-xl font-black leading-tight text-slate-950">
                Stay close to your device
              </h2>
            </div>
          </div>

          <p className="mt-3 text-sm font-bold leading-6 text-slate-700">
            Please be sure to be around your device. This is the last OTP for today - a new code can only be
            requested after 72 hours. Enter the code as soon as it arrives.
          </p>

          <div className="mt-5 grid grid-cols-1 gap-2 sm:grid-cols-2">
            <button
              type="button"
              onClick={onCancel}
              className="kt-pressable h-12 rounded-2xl bg-slate-100 text-sm font-black text-slate-700 transition hover:bg-slate-200"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={onVerify}
              className="kt-pressable h-12 rounded-2xl bg-amber-500 text-sm font-black text-white shadow-lg shadow-amber-900/25 transition hover:bg-amber-600"
            >
              Verify code
            </button>
          </div>
        </div>
      </section>
    </div>,
    document.body,
  );
}
