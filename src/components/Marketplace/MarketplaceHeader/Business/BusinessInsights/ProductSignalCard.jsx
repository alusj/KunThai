import { useI18n, t } from "../../../../../i18n";

export default function ProductSignalCard({ title, product, tone = "gray" }) {
  useI18n();
  const tones = {
    gray: "border-gray-200 bg-white",
    amber: "border-amber-200 bg-amber-50",
    green: "border-emerald-200 bg-emerald-50",
  };

  return (
    <article className={`rounded-lg border p-4 ${tones[tone]}`}>
      <p className="text-sm font-black text-gray-500">{title}</p>
      <p className="mt-1 font-black text-gray-950">{product.name}</p>
      <div className="mt-2 space-y-1 text-sm font-medium text-gray-600">
        {typeof product.views === "number" ? <p>{t("urmall.biz.ins.viewsN", { count: product.views })}</p> : null}
        {typeof product.clicks === "number" ? <p>{t("urmall.biz.ins.clicksN", { count: product.clicks })}</p> : null}
        {typeof product.orders === "number" ? <p>{t("urmall.biz.ins.ordersN", { count: product.orders })}</p> : null}
        {product.reason ? <p>{product.reason}</p> : null}
      </div>
    </article>
  );
}
