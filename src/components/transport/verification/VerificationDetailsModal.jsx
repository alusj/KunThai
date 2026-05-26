import { useState } from "react";
import { FiCheckCircle, FiX } from "react-icons/fi";
import AppPortal from "../../shared/AppPortal";
import { verificationStatuses } from "./verificationStatus";

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
  const [busyAction, setBusyAction] = useState("");

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
        await onReportConcern?.();
        return;
      }

      onClose?.();
    } finally {
      setBusyAction("");
    }
  }

  return (
    <AppPortal>
    <div className="fixed inset-0 z-[1200] flex items-center justify-center px-4 py-[calc(env(safe-area-inset-top)+1rem)] pb-[calc(env(safe-area-inset-bottom)+1rem)]">
      <button
        type="button"
        aria-label="Close verification details overlay"
        onClick={onClose}
        className="absolute inset-0 bg-slate-950/40"
      />

      <section className="kt-modal-enter relative flex max-h-[min(88dvh,42rem)] w-full max-w-md flex-col overflow-hidden rounded-3xl bg-white shadow-2xl">
        <div className={`rounded-t-3xl border-b px-5 py-4 ${config.panelClass}`}>
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide">Verification Status</p>
              <h2 className="mt-1 text-xl font-bold">{config.label}</h2>
              <p className="mt-1 text-sm">{operatorName}</p>
            </div>
            <button
              type="button"
              aria-label="Close verification details"
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
                {busyAction === action ? "Working..." : action}
              </button>
            ))}
          </div>
        </div>
      </section>
    </div>
    </AppPortal>
  );
}
