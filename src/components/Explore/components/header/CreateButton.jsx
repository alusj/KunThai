// =====================================
// CreateButton.jsx
// Create post / video button
// =====================================

import { HiOutlinePlus } from "react-icons/hi2";
import { t } from "../../../../i18n";
import { useI18n as useUiLocale } from "../../../../i18n/index.js";

export default function CreateButton({ onClick }) {
  useUiLocale();
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-sky-600 text-xl text-white shadow-sm transition hover:bg-sky-700"
      aria-label={t("explore.create")}
    >
      <HiOutlinePlus />
    </button>
  );
}
