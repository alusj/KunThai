
import { uiText as translateUi, useI18n as useUiLocale } from "../../../../../../../i18n/index.js";// MenuHeader.jsx
// --------------
// Drawer header (title + close button)

// src/components/.../MyBizMenu/MenuItem.jsx

export default function MenuItem({ label, danger = false, onClick }) {
  useUiLocale();
  return (
    <button
      onClick={onClick}
      className={`w-full text-left px-3 py-2 rounded-md text-sm transition
        ${
          danger
            ? "text-red-600 hover:bg-red-50"
            : "text-gray-700 hover:bg-gray-100"
        }`}
    >
      {translateUi(label)}
    </button>
  );
}
