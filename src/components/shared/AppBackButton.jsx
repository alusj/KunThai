import { HiOutlineArrowLeft } from "react-icons/hi2";
import { useBrowserBack } from "../../Backend/hooks/useBrowserBack";

export default function AppBackButton({
  onBack,
  label = "Back",
  historyKey = "kuntai-screen",
  className = "",
  iconSize = 20,
}) {
  useBrowserBack(Boolean(onBack), onBack, historyKey);

  if (!onBack) return null;

  return (
    <button
      type="button"
      onClick={onBack}
      aria-label={label}
      className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-700 transition hover:bg-slate-200 ${className}`}
    >
      <HiOutlineArrowLeft size={iconSize} />
    </button>
  );
}
