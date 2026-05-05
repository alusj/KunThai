import { FiCheckCircle, FiX } from "react-icons/fi";
import { verificationStatuses } from "./verificationStatus";

export default function VerificationDetailsModal({ status, operatorName, onClose }) {
  if (!status) return null;

  const config = verificationStatuses[status] || verificationStatuses.pending;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
      <button
        type="button"
        aria-label="Close verification details overlay"
        onClick={onClose}
        className="absolute inset-0 bg-slate-950/40"
      />

      <section className="relative w-full max-w-md rounded-3xl bg-white shadow-2xl">
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

        <div className="space-y-4 px-5 py-5">
          <p className="text-sm leading-6 text-gray-700">{config.detail}</p>

          <div className="space-y-2">
            {config.checks.map((check) => (
              <div key={check} className="flex items-center gap-2 text-sm text-gray-700">
                <FiCheckCircle size={16} className="text-gray-500" />
                <span>{check}</span>
              </div>
            ))}
          </div>

          <div className="flex flex-wrap gap-2 pt-1">
            {config.actions.map((action, index) => (
              <button
                key={action}
                type="button"
                className={`h-10 rounded-2xl px-4 text-sm font-semibold transition ${
                  index === 0
                    ? "bg-gray-950 text-white hover:bg-gray-800"
                    : "border border-gray-200 text-gray-700 hover:bg-gray-50"
                }`}
              >
                {action}
              </button>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
