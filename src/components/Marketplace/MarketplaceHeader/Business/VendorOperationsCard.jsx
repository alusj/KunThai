import { Boxes, Clock3, FileQuestion, MapPinned, PackageCheck, Warehouse } from "lucide-react";

function formatValue(value, fallback) {
  return String(value || fallback).replaceAll("_", " ");
}

function VendorMetric({ icon: Icon, label, value }) {
  return (
    <div className="rounded-2xl border border-emerald-100 bg-white p-3">
      <span className="grid h-9 w-9 place-items-center rounded-xl bg-emerald-50 text-emerald-700"><Icon size={17} /></span>
      <p className="mt-3 text-[10px] font-black uppercase tracking-[0.14em] text-gray-400">{label}</p>
      <p className="mt-1 text-sm font-black capitalize text-gray-950">{value}</p>
    </div>
  );
}

export default function VendorOperationsCard({ business }) {
  const operations = business?.operations || {};
  const minimumOrder = Math.max(1, Number(operations.defaultMinOrderQuantity || 1));
  const sellingUnit = operations.defaultSellingUnit || "item";
  const leadTime = Math.max(0, Number(operations.leadTimeDays || 0));

  return (
    <section className="overflow-hidden rounded-[24px] border border-emerald-100 bg-gradient-to-br from-emerald-950 via-emerald-900 to-slate-950 p-5 text-white shadow-sm">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3">
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-white/10 text-emerald-200"><Warehouse size={23} /></span>
          <div>
            <p className="text-[11px] font-black uppercase tracking-[0.18em] text-emerald-300">Professional vendor workspace</p>
            <h2 className="mt-1 text-xl font-black">Supply operations</h2>
            <p className="mt-1 max-w-2xl text-sm font-semibold leading-6 text-emerald-100/75">
              Manage wholesale listings, quantity price tiers, stock, orders, buyer messages, and delivery from the shared UrMall catalog.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <span className="rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-xs font-black capitalize">{formatValue(operations.vendorType, "vendor")}</span>
          <span className="rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-xs font-black capitalize">{formatValue(operations.salesModel, "wholesale")}</span>
        </div>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <VendorMetric icon={PackageCheck} label="Default minimum" value={`${minimumOrder} ${sellingUnit}${minimumOrder === 1 ? "" : "s"}`} />
        <VendorMetric icon={Clock3} label="Typical lead time" value={`${leadTime} day${leadTime === 1 ? "" : "s"}`} />
        <VendorMetric icon={MapPinned} label="Supply area" value={operations.serviceAreas || business?.location?.country || "Add service area"} />
        <VendorMetric icon={FileQuestion} label="Bulk enquiries" value={operations.quotationEnabled === false ? "Not accepted" : "Accepted"} />
      </div>

      <div className="mt-4 flex items-start gap-2 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-xs font-bold leading-5 text-emerald-100/80">
        <Boxes size={16} className="mt-0.5 shrink-0 text-emerald-300" />
        Add a minimum quantity, pack size, lead time, and quantity prices to each listing so buyers can compare your supply terms before ordering.
      </div>
    </section>
  );
}
