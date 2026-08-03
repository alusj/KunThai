import { useState } from "react";
import { FiAlertTriangle, FiCheckCircle, FiX } from "react-icons/fi";
import AppPortal from "../../shared/AppPortal";
import { verificationStatuses } from "./verificationStatus";
import { useI18n, t } from "../../../i18n";

// Stable reason values (kept in English so the reported payload is consistent
// for support) paired with the translation key used only for display.
const reportReasons = [
  { value: "Verification concern", labelKey: "urride.verification.modal.reasonVerification" },
  { value: "Safety concern", labelKey: "urride.verification.modal.reasonSafety" },
  { value: "Wrong fleet details", labelKey: "urride.verification.modal.reasonWrongDetails" },
  { value: "Operator contact issue", labelKey: "urride.verification.modal.reasonContact" },
];

// Each verification action is a stable id (used by handleAction control flow);
// this maps that id to its display translation key.
const ACTION_LABEL_KEYS = {
  "View profile": "urride.verification.actions.viewProfile",
  "Continue carefully": "urride.verification.actions.continueCarefully",
  "Choose verified operators": "urride.verification.actions.chooseVerified",
  "Choose verified sellers": "urride.verification.actions.chooseVerifiedSellers",
  "Book operator": "urride.verification.actions.bookOperator",
  "Report concern": "urride.verification.actions.reportConcern",
};

export default function VerificationDetailsModal({
  status,
  operatorName,
  onBookOperator,
  onChooseVerified,
  onClose,
  onContinue,
  onReportConcern,
  onViewProfile,
}) {
  useI18n();
  const [busyAction, setBusyAction] = useState("");
  const [reportOpen, setReportOpen] = useState(false);
  const [reportReason, setReportReason] = useState(reportReasons[0].value);
  const [reportMessage, setReportMessage] = useState("");
  const [reportFeedback, setReportFeedback] = useState("");
  const [reportError, setReportError] = useState("");

  if (!status) return null;

  const config = verificationStatuses[status] || verificationStatuses.pending;

  async function handleAction(action) {
    if (busyAction) return;
    setBusyAction(action);

    try {
      if (action === "View profile") {
        await onViewProfile?.();
        onClose?.();
        return;
      }

      if (action === "Continue carefully") {
        await onContinue?.();
        onClose?.();
        return;
      }

      if (action === "Choose verified operators" || action === "Choose verified sellers") {
        await onChooseVerified?.();
        onClose?.();
        return;
      }

      if (action === "Book operator") {
        await onBookOperator?.();
        onClose?.();
        return;
      }

      if (action === "Report concern") {
        setReportOpen((open) => !open);
        setReportFeedback("");
        setReportError("");
        return;
      }

      onClose?.();
    } finally {
      setBusyAction("");
    }
  }

  async function handleSubmitConcern(event) {
    event.preventDefault();
    if (busyAction) return;

    const message = reportMessage.trim();
    if (message.length < 12) {
      setReportFeedback("");
      setReportError(t("urride.verification.modal.errorShort"));
      return;
    }

    setBusyAction("Report concern");
    setReportFeedback("");
    setReportError("");

    try {
      if (!onReportConcern) {
        throw new Error(t("urride.verification.modal.errorUnavailable"));
      }

      const result = await onReportConcern({
        reason: reportReason,
        message,
      });
      setReportMessage("");
      setReportFeedback(
        result?.synced === false
          ? t("urride.verification.modal.feedbackOffline")
          : t("urride.verification.modal.feedbackSent"),
      );
    } catch (error) {
      setReportError(error.message || t("urride.verification.modal.errorSend"));
    } finally {
      setBusyAction("");
    }
  }

  return (
    <AppPortal>
    <div className="fixed inset-0 z-[1200] flex items-center justify-center px-4 py-[calc(env(safe-area-inset-top)+1rem)] pb-[calc(env(safe-area-inset-bottom)+1rem)]">
      <button
        type="button"
        aria-label={t("urride.verification.modal.closeOverlay")}
        onClick={onClose}
        className="absolute inset-0 bg-slate-950/40"
      />

      <section className="kt-modal-enter relative flex max-h-[min(88dvh,42rem)] w-full max-w-md flex-col overflow-hidden rounded-3xl bg-white shadow-2xl">
        <div className={`rounded-t-3xl border-b px-5 py-4 ${config.panelClass}`}>
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide">{t("urride.verification.modal.statusLabel")}</p>
              <h2 className="mt-1 text-xl font-bold">{config.label}</h2>
              <p className="mt-1 text-sm">{operatorName}</p>
            </div>
            <button
              type="button"
              aria-label={t("urride.verification.modal.close")}
              onClick={onClose}
              className="h-9 w-9 rounded-full bg-white/80 flex items-center justify-center"
            >
              <FiX size={19} />
            </button>
          </div>
        </div>

        <div className="min-h-0 space-y-4 overflow-y-auto px-5 py-5">
          <p className="text-sm leading-6 text-gray-700">{config.detail}</p>

          <div className="space-y-2">
            {config.checks.map((check) => (
              <div key={check} className="flex items-center gap-2 text-sm text-gray-700">
                <FiCheckCircle size={16} className="text-gray-500" />
                <span>{check}</span>
              </div>
            ))}
          </div>

          <div className="grid gap-2 pt-1 sm:grid-cols-2">
            {config.actions.map((action, index) => (
              <button
                key={action}
                type="button"
                onClick={() => handleAction(action)}
                disabled={Boolean(busyAction)}
                className={`kt-pressable min-h-11 rounded-2xl px-4 text-sm font-semibold transition disabled:opacity-60 ${
                  index === 0
                    ? "bg-gray-950 text-white hover:bg-gray-800"
                    : "border border-gray-200 text-gray-700 hover:bg-gray-50"
                }`}
              >
                {busyAction === action ? t("urride.verification.modal.working") : t(ACTION_LABEL_KEYS[action] || "")}
              </button>
            ))}
          </div>

          {reportOpen ? (
            <form onSubmit={handleSubmitConcern} className="rounded-2xl border border-amber-100 bg-amber-50/70 p-4">
              <div className="flex items-start gap-3">
                <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white text-amber-700 shadow-sm">
                  <FiAlertTriangle size={18} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-black text-amber-950">{t("urride.verification.modal.reportTitle")}</p>
                  <p className="mt-1 text-xs font-semibold leading-5 text-amber-800">
                    {t("urride.verification.modal.reportIntro", { operator: operatorName || t("urride.verification.modal.operatorFallback") })}
                  </p>
                </div>
              </div>

              <label className="mt-4 block">
                <span className="mb-1 block text-xs font-black uppercase tracking-wide text-amber-900">{t("urride.verification.modal.reasonLabel")}</span>
                <select
                  value={reportReason}
                  onChange={(event) => setReportReason(event.target.value)}
                  className="h-11 w-full rounded-2xl border border-amber-200 bg-white px-3 text-sm font-bold text-slate-900 outline-none focus:border-amber-500"
                >
                  {reportReasons.map((reason) => (
                    <option key={reason.value} value={reason.value}>{t(reason.labelKey)}</option>
                  ))}
                </select>
              </label>

              <label className="mt-3 block">
                <span className="mb-1 block text-xs font-black uppercase tracking-wide text-amber-900">{t("urride.verification.modal.messageLabel")}</span>
                <textarea
                  rows={4}
                  value={reportMessage}
                  onChange={(event) => setReportMessage(event.target.value)}
                  placeholder={t("urride.verification.modal.messagePlaceholder")}
                  className="w-full resize-none rounded-2xl border border-amber-200 bg-white px-3 py-3 text-sm font-semibold leading-5 text-slate-900 outline-none placeholder:text-slate-400 focus:border-amber-500"
                />
              </label>

              {reportError ? (
                <p className="mt-3 rounded-2xl bg-red-50 px-3 py-2 text-xs font-black text-red-700">{reportError}</p>
              ) : null}

              {reportFeedback ? (
                <p className="mt-3 rounded-2xl bg-green-50 px-3 py-2 text-xs font-black text-green-700">{reportFeedback}</p>
              ) : null}

              <div className="mt-4 grid gap-2 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={() => {
                    setReportOpen(false);
                    setReportError("");
                  }}
                  className="h-11 rounded-2xl border border-amber-200 bg-white text-sm font-black text-amber-900 hover:bg-amber-50"
                >
                  {t("urride.verification.modal.cancel")}
                </button>
                <button
                  type="submit"
                  disabled={busyAction === "Report concern"}
                  className="h-11 rounded-2xl bg-slate-950 text-sm font-black text-white hover:bg-slate-800 disabled:opacity-60"
                >
                  {busyAction === "Report concern" ? t("urride.verification.modal.sending") : t("urride.verification.modal.send")}
                </button>
              </div>
            </form>
          ) : null}
        </div>
      </section>
    </div>
    </AppPortal>
  );
}
