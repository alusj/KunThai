import { FiInfo } from "react-icons/fi";
import { verificationStatuses } from "./verificationStatus";
import { useI18n } from "../../../i18n";
import { uiText as translateUi } from "../../../i18n/index.js";

export default function VerificationBadge({ status, onClick, className = "" }) {
  useI18n();
  const config = verificationStatuses[status] || verificationStatuses.pending;

  return (
    <button
      type="button"
      onClick={onClick}
      className={`${className || "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs"} border font-bold ${config.colorClass}`}
    >
      {translateUi(config.label)}
      <FiInfo size={13} />
    </button>
  );
}
