import { Building2, Check, ChevronDown, Hotel, House, Plus, ShieldCheck, Store, UtensilsCrossed, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { fetchBusinessAttentionCounts } from "../../../../../Backend/services/marketplace/sellerHeaderService";
import AppPortal from "../../../../shared/AppPortal";
import useBodyScrollLock from "../../../../shared/useBodyScrollLock";

const ICONS = { retail: Store, restaurant: UtensilsCrossed, hotel: Hotel, property_agent: House };
const labelBusinessKind = (kind = "retail") => kind === "property_agent" ? "Real Estate Agent" : kind.replaceAll("_", " ");

// Pending orders / unread messages in the workspaces the seller is NOT
// currently viewing. Once the seller switches to that business ("views" it),
// its counts leave this badge and show on the orders/messages icons instead.
function useOtherBusinessAttention(businesses, activeBusinessId) {
  const [counts, setCounts] = useState({ total: 0, byBusiness: {} });
  const otherIds = useMemo(
    () => businesses.filter((business) => business.id !== activeBusinessId).map((business) => business.id),
    [businesses, activeBusinessId],
  );
  const otherIdsKey = otherIds.join(",");

  useEffect(() => {
    let alive = true;

    async function load() {
      if (!otherIds.length) {
        if (alive) setCounts({ total: 0, byBusiness: {} });
        return;
      }
      try {
        const next = await fetchBusinessAttentionCounts(otherIds);
        if (alive) setCounts(next);
      } catch {
        if (alive) setCounts({ total: 0, byBusiness: {} });
      }
    }

    load();
    const interval = window.setInterval(load, 30000);
    window.addEventListener("marketplace-orders-updated", load);
    window.addEventListener("marketplace-seller-messages-updated", load);
    window.addEventListener("marketplace-message-sent", load);
    return () => {
      alive = false;
      window.clearInterval(interval);
      window.removeEventListener("marketplace-orders-updated", load);
      window.removeEventListener("marketplace-seller-messages-updated", load);
      window.removeEventListener("marketplace-message-sent", load);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- otherIdsKey captures the id list.
  }, [otherIdsKey]);

  return counts;
}

export default function BusinessSwitcher({ activeBusinessId, businesses = [], onAddBusiness, onSwitch }) {
  const [open, setOpen] = useState(false);
  const attention = useOtherBusinessAttention(businesses, activeBusinessId);
  useBodyScrollLock(open);
  if (businesses.length < 2) return null;

  const attentionTotal = attention.total;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="relative flex h-10 items-center gap-1 rounded-xl border border-emerald-200 bg-emerald-50 px-2.5 text-emerald-700"
        aria-label={attentionTotal ? `Switch business — ${attentionTotal} update${attentionTotal === 1 ? "" : "s"} in other workspaces` : "Switch business"}
      >
        <Building2 size={19} />
        <ChevronDown size={14} />
        {attentionTotal ? (
          <span className="absolute -right-1.5 -top-1.5 grid h-5 min-w-5 place-items-center rounded-full bg-red-600 px-1 text-[10px] font-black text-white">
            {attentionTotal > 9 ? "9+" : attentionTotal}
          </span>
        ) : (
          <span className="absolute -right-1.5 -top-1.5 grid h-5 min-w-5 place-items-center rounded-full bg-emerald-700 px-1 text-[10px] font-black text-white">
            {businesses.length}
          </span>
        )}
      </button>
      {open ? (
        <AppPortal>
          <div
            className="fixed inset-0 z-[1400] flex items-end bg-slate-950/30 p-3 backdrop-blur-sm sm:items-center sm:justify-center"
            onClick={() => setOpen(false)}
          >
            <section className="w-full max-w-lg rounded-[28px] bg-white p-5 shadow-2xl" onClick={(event) => event.stopPropagation()}>
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs font-black uppercase tracking-wide text-emerald-700">Business workspaces</p>
                  <h2 className="mt-1 text-2xl font-black text-gray-950">Choose a business</h2>
                </div>
                <button type="button" onClick={() => setOpen(false)} className="grid h-10 w-10 place-items-center rounded-full bg-gray-100" aria-label="Close business switcher">
                  <X size={18} />
                </button>
              </div>
              <div className="mt-5 max-h-[55dvh] space-y-2 overflow-y-auto">
                {businesses.map((business) => {
                  const Icon = ICONS[business.businessKind] || Store;
                  const active = business.id === activeBusinessId;
                  const isAdminRole = business.role === "admin";
                  const businessAttention = attention.byBusiness[business.id];
                  const attentionCount = businessAttention ? businessAttention.orders + businessAttention.messages : 0;

                  return (
                    <button
                      key={business.id}
                      type="button"
                      onClick={() => {
                        onSwitch(business.id);
                        setOpen(false);
                      }}
                      className={`flex w-full items-center gap-3 rounded-2xl border p-3 text-left ${active ? "border-emerald-500 bg-emerald-50" : "border-gray-200"}`}
                    >
                      <span className="relative grid h-11 w-11 place-items-center overflow-hidden rounded-xl bg-gray-100 text-gray-600">
                        {business.identity.logoUrl ? (
                          <img src={business.identity.logoUrl} alt="" className="h-full w-full object-cover" />
                        ) : (
                          <Icon size={20} />
                        )}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-2">
                          <span className="min-w-0 truncate text-sm font-black text-gray-950">{business.identity.businessName}</span>
                          {isAdminRole ? (
                            <span className="inline-flex flex-none items-center gap-1 rounded-full bg-violet-50 px-2 py-0.5 text-[10px] font-black uppercase tracking-wide text-violet-700">
                              <ShieldCheck size={11} /> Admin
                            </span>
                          ) : null}
                        </span>
                        <span className="mt-0.5 block text-xs font-bold capitalize text-gray-500">
                          {labelBusinessKind(business.businessKind)} · {business.verificationStatus || "pending"}
                        </span>
                        {!active && attentionCount ? (
                          <span className="mt-1 block text-xs font-black text-red-600">
                            {businessAttention.orders ? `${businessAttention.orders} pending order${businessAttention.orders === 1 ? "" : "s"}` : ""}
                            {businessAttention.orders && businessAttention.messages ? " · " : ""}
                            {businessAttention.messages ? `${businessAttention.messages} unread message${businessAttention.messages === 1 ? "" : "s"}` : ""}
                          </span>
                        ) : null}
                      </span>
                      {!active && attentionCount ? (
                        <span className="grid h-6 min-w-6 flex-none place-items-center rounded-full bg-red-600 px-1.5 text-[11px] font-black text-white">
                          {attentionCount > 9 ? "9+" : attentionCount}
                        </span>
                      ) : null}
                      {active ? <Check className="flex-none text-emerald-700" size={20} /> : null}
                    </button>
                  );
                })}
              </div>
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  onAddBusiness();
                }}
                className="mt-4 flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-gray-950 text-sm font-black text-white"
              >
                <Plus size={18} /> Add another business
              </button>
            </section>
          </div>
        </AppPortal>
      ) : null}
    </>
  );
}
