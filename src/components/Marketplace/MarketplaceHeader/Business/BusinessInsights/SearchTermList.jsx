import { useI18n, t } from "../../../../../i18n";

export default function SearchTermList({ terms }) {
  useI18n();
  return (
    <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <h3 className="text-base font-black text-gray-950">{t("urmall.biz.ins.searchTitle")}</h3>
      <p className="mt-1 text-sm font-medium text-gray-500">
        {t("urmall.biz.ins.searchSubtitle")}
      </p>

      <div className="mt-4 flex flex-wrap gap-2">
        {terms.map((item) => (
          <span
            key={item.term}
            className="rounded-full bg-gray-100 px-3 py-2 text-xs font-black text-gray-700"
          >
            {item.term} · {item.count}
          </span>
        ))}
      </div>
    </section>
  );
}
