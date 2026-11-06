import { useEffect, useState } from "react";
import { MessageSquareText } from "lucide-react";
import { requestOtpBySms } from "../../Backend/services/authService";
import { useI18n } from "../../i18n";

// Phone codes arrive on WhatsApp first. SMS is sent only when WhatsApp fails
// for certain, or when the person taps this button — never just because
// WhatsApp is slow. It unlocks a little after the code was sent (`sentAt`, ms)
// and works once per code; a new `sentAt` (resend) resets it. Depending on the
// server's SMS mode the SMS carries the same code or its own code; either one
// completes the same sign-in attempt.
const WAIT_SECONDS = 20;

export default function OtpSmsFallbackButton({ phone, sentAt, disabled = false }) {
  const { t } = useI18n();
  const [now, setNow] = useState(() => Date.now());
  const [requested, setRequested] = useState(false);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    setRequested(false);
    setNow(Date.now());
  }, [sentAt]);

  const secondsLeft = Math.max(0, Math.ceil((Number(sentAt || 0) + WAIT_SECONDS * 1000 - now) / 1000));

  useEffect(() => {
    if (!sentAt || secondsLeft <= 0) return undefined;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [sentAt, secondsLeft]);

  if (!phone || !sentAt) return null;

  if (requested) {
    return (
      <p className="text-center text-sm font-semibold text-emerald-700" role="status">
        {t("auth.smsFallbackSent")}
      </p>
    );
  }

  async function handleClick() {
    setSending(true);
    await requestOtpBySms(phone);
    setSending(false);
    setRequested(true);
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={disabled || sending || secondsLeft > 0}
      className="flex w-full items-center justify-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold text-blue-700 transition hover:bg-blue-50 disabled:text-slate-400 disabled:hover:bg-transparent"
    >
      <MessageSquareText size={16} aria-hidden="true" />
      {secondsLeft > 0 ? t("auth.smsFallbackIn", { seconds: secondsLeft }) : t("auth.smsFallback")}
    </button>
  );
}
