import { formatCurrency } from "../../../../../Backend/utils/formatCurrency";

export default function ProductPreview({ preview }) {
  return (
    <aside className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <p className="text-sm font-black uppercase text-blue-700">Live Product Preview</p>
      <div className="mt-4 overflow-hidden rounded-xl border border-gray-200 bg-gray-50">
        <div className="flex aspect-video items-center justify-center bg-gray-200 text-sm font-black text-gray-500">
          {preview.coverName || "Cover image"}
        </div>
        <div className="p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="font-black text-gray-950">{preview.name}</h3>
              <p className="mt-1 text-sm font-bold text-gray-500">{preview.category}</p>
            </div>
            <span className="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-black capitalize text-gray-700">
              {preview.status}
            </span>
          </div>
          <p className="mt-3 text-sm font-medium leading-5 text-gray-600">{preview.description}</p>
          <p className="mt-4 text-xl font-black text-gray-950">{formatCurrency(Number(preview.price || 0))}</p>
        </div>
      </div>
    </aside>
  );
}
