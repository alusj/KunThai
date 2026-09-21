// =====================================
// SearchButton.jsx
// Explore search trigger
// =====================================

import { HiOutlineMagnifyingGlass } from "react-icons/hi2";
import { t } from "../../../../i18n";
import { useI18n as useUiLocale } from "../../../../i18n/index.js";

export default function SearchButton({ onClick }) {
  useUiLocale();
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-slate-50 text-xl text-slate-700 transition hover:bg-slate-100 hover:text-slate-950"
      aria-label={t("explore.searchShort")}
    >
      <HiOutlineMagnifyingGlass />
    </button>
  );
}
