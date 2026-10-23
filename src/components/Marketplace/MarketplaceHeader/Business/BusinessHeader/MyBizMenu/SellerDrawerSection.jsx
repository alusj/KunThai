import { uiText as translateUi, useI18n as useUiLocale } from "../../../../../../i18n/index.js";

// One group of seller menu rows: a single rounded card with dividers, like
// the phone's own settings, instead of a stack of separate boxes.
export default function SellerDrawerSection({ title, children }) {
  useUiLocale();
  return (
    <section>
      <h3 className="px-1 pb-2 text-[11px] font-black uppercase tracking-[0.16em] text-gray-500">
        {translateUi(title)}
      </h3>
      <div className="divide-y divide-gray-100 overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
        {children}
      </div>
    </section>
  );
}
