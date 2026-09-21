import { HiOutlineArrowLeft } from "react-icons/hi2";

import { useBrowserBack } from "../../Backend/hooks/useBrowserBack";
import { uiText as translateUi, useI18n as useUiLocale } from "../../i18n/index.js";

export default function AppBackButton({
  onBack,
  label = "Back",
  historyKey = "kuntai-screen",
  className = "",
  iconSize = 20,
  useHistoryLayer = true,
}) {
  useUiLocale();
  const goBack = useBrowserBack(Boolean(onBack && useHistoryLayer), onBack, historyKey);
  const handleBack = useHistoryLayer ? goBack : onBack;

  if (!onBack) return null;

  return (
    <button
      type="button"
      onClick={handleBack}
      aria-label={translateUi(label)}
      className={`kt-icon-button kt-touchable flex h-10 w-10 shrink-0 rounded-xl ${className}`}
    >
      <HiOutlineArrowLeft size={iconSize} />
    </button>
  );
}
