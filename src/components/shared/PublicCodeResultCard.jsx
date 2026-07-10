import { BadgeCheck, Bike, ShoppingBag, UserRound } from "lucide-react";

import { CODE_SURFACE_LABELS } from "../../Backend/services/publicCodeService";

const KIND_ICONS = { kunthai: UserRound, urmall: ShoppingBag, urride: Bike };

// Renders the resolved entity with an action button. When the entity lives on
// the surface the user is currently on, the label is a plain "Open"; when it
// belongs to another surface the button reads "View in Explore/UrMall/UrRide".
export default function PublicCodeResultCard({ lookup, surface, onOpen }) {
  const { pending, result, kind } = lookup;
  if (!kind) return null;

  if (pending) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold text-slate-500">
        Looking up this KunThai ID...
      </div>
    );
  }

  if (!result) {
    return (
      <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-bold text-amber-800">
        No {CODE_SURFACE_LABELS[kind] || "KunThai"} account matches this ID. Check the code and try again.
      </div>
    );
  }

  const Icon = KIND_ICONS[result.kind] || UserRound;
  const sameSurface = result.kind === surface || (result.kind === "kunthai" && surface === "explore");
  const buttonLabel = sameSurface ? "Open" : `View in ${CODE_SURFACE_LABELS[result.kind]}`;

  return (
    <article className="rounded-2xl border border-emerald-200 bg-emerald-50/60 p-3">
      <div className="flex items-center gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-white text-emerald-700 ring-1 ring-emerald-100">
          {result.avatarUrl ? <img src={result.avatarUrl} alt="" className="h-full w-full object-cover" /> : <Icon size={20} />}
        </span>
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1 truncate text-sm font-black text-slate-950">
            {result.title}
            <BadgeCheck size={14} className="shrink-0 text-emerald-600" />
          </p>
          <p className="truncate text-xs font-bold text-slate-500">
            {result.code}
            {result.subtitle ? ` · ${result.subtitle}` : ""}
          </p>
        </div>
        <button
          type="button"
          onClick={() => onOpen?.(result)}
          className="h-10 shrink-0 rounded-xl bg-emerald-600 px-3 text-xs font-black text-white hover:bg-emerald-700"
        >
          {buttonLabel}
        </button>
      </div>
    </article>
  );
}
