
import { uiText as translateUi, useI18n as useUiLocale } from "../../../../../i18n/index.js";export default function ProductFormField({ label, error, children }) {
  useUiLocale();
  return (
    <label className="block">
      <span className="text-sm font-black text-gray-800">{translateUi(label)}</span>
      <div className="mt-2">{children}</div>
      {error ? <p className="mt-1 text-xs font-bold text-red-600">{translateUi(error)}</p> : null}
    </label>
  );
}
