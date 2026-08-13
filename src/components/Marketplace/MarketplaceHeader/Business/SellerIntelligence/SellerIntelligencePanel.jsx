import { useI18n, t } from "../../../../../i18n";

export default function SellerIntelligencePanel({ item }) {
  useI18n();
  const rows = item.rows || [];

  return (
    <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h4 className="text-sm font-black text-gray-950">{item.title}</h4>
          <p className="text-sm font-semibold text-gray-500">{item.description}</p>
        </div>
        <p className="text-2xl font-black text-gray-950">{item.value}</p>
      </div>

      {rows.length ? (
        <div className="mt-4 grid gap-2 md:grid-cols-2">
          {rows.map((row, index) => (
            <div
              key={row.id}
              className="kt-intelligence-row rounded-xl border border-gray-200 bg-white p-3"
              style={{ animationDelay: `${80 + index * 45}ms` }}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-black text-gray-950">
                    {row.label}
                  </p>
                  <p className="mt-1 text-xs font-semibold leading-5 text-gray-500">
                    {row.detail}
                  </p>
                </div>
                <p className="shrink-0 text-sm font-black text-gray-900">
                  {row.value}
                </p>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="mt-4 rounded-lg border border-dashed border-gray-300 bg-white p-4 text-sm font-semibold text-gray-500">
          {t("urmall.biz.intel.emptyPanel")}
        </div>
      )}
    </div>
  );
}
