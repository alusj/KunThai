import { BadgeCheck, ChevronRight, Store } from "lucide-react";

import { useSellerOverview } from "../../../../../../Backend/hooks/useSellerOverview";

export default function SellerDrawerProfile({ onOpenProfile }) {
  const { business, health, storeStatus, loading } = useSellerOverview();

  if (loading) return null;

  if (!business) {
    return null;
  }

  const statusLabel = storeStatus?.open ? "Store open" : "Store closed";

  return (
    <button
      type="button"
      onClick={onOpenProfile}
      className="mx-4 mt-4 w-[calc(100%-2rem)] rounded-xl border border-gray-200 bg-gray-950 p-4 text-left text-white shadow-sm transition hover:bg-gray-900"
    >
      <div className="flex items-center gap-3">
        <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-white/10 text-sm font-black">
          {business.logoUrl ? (
            <img
              src={business.logoUrl}
              alt=""
              className="h-full w-full object-cover"
            />
          ) : (
            business.logoInitials || <Store size={22} />
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-2">
            <p className="truncate text-base font-black">{business.name}</p>
            {business.verified ? (
              <BadgeCheck className="shrink-0 text-emerald-300" size={17} />
            ) : null}
          </div>
          <p className="mt-1 truncate text-sm font-semibold text-white/70">
            {business.category || "Business profile"}
          </p>
          <p className="mt-1 truncate text-xs font-semibold text-white/55">
            {business.location || statusLabel}
          </p>
        </div>

        <ChevronRight className="shrink-0 text-white/60" size={19} />
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2 text-xs font-bold">
        <span className="rounded-lg bg-white/10 px-3 py-2">
          {statusLabel}
        </span>
        <span className="rounded-lg bg-white/10 px-3 py-2">
          {health?.score ?? 0}% ready
        </span>
      </div>
    </button>
  );
}
