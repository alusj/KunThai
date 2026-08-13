// =====================================
// MenuButton.jsx
// Hamburger menu button
// =====================================

import { HiOutlineBars3 } from "react-icons/hi2";
import { useI18n } from "../../../../i18n";

export default function MenuButton({ onClick }) {
  const { t } = useI18n();
  return (
    <button
      onClick={onClick}
      className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-slate-50 text-xl text-slate-700 transition hover:bg-slate-100 hover:text-slate-950"
      aria-label={t("explore.openMenuShort")}
    >
      <HiOutlineBars3 />
    </button>
  );
}
