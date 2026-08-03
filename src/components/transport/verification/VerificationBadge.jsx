import { FiInfo } from "react-icons/fi";
import { verificationStatuses } from "./verificationStatus";
import { useI18n } from "../../../i18n";

export default function VerificationBadge({ status, onClick }) {
  useI18n();
  const config = verificationStatuses[status] || verificationStatuses.pending;

  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-bold ${config.colorClass}`}
    >
      {config.label}
      <FiInfo size={13} />
    </button>
  );
}
