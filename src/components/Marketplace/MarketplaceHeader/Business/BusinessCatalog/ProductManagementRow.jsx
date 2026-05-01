import { formatCurrency } from "../../../../../Backend/utils/formatCurrency";
import ProductInlineActions from "./ProductInlineActions";
import ProductStatusBadge from "./ProductStatusBadge";

export default function ProductManagementRow({ product, onAction }) {
  return (
    <article className="grid gap-4 border-t border-gray-100 px-4 py-4 lg:grid-cols-[minmax(220px,1.4fr)_110px_110px_110px_minmax(260px,1fr)] lg:items-center">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <h4 className="font-black text-gray-950">{product.name}</h4>
          <ProductStatusBadge status={product.status} />
        </div>
        <p className="mt-1 text-sm font-medium text-gray-500">{product.trend}</p>
      </div>

      <Metric label="Price" value={formatCurrency(product.price)} />
      <Metric label="Stock" value={product.stock} />
      <Metric label="Sales" value={product.sales} />

      <ProductInlineActions product={product} onAction={onAction} />
    </article>
  );
}

function Metric({ label, value }) {
  return (
    <div>
      <p className="text-xs font-black uppercase text-gray-400">{label}</p>
      <p className="mt-1 text-sm font-black text-gray-950">{value}</p>
    </div>
  );
}
