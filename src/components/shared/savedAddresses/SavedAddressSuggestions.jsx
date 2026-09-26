// Saved locations that pop up under an order or booking address field as soon
// as the field is reached. About two show at once and the rest scroll, so the
// popover never pushes the form away. Picking one fills the field with that
// saved address (and its map point) in one tap.

import { createElement } from "react";
import { BookmarkCheck, MapPin } from "lucide-react";

import { t, useI18n } from "../../../i18n";
import { resizedImageUrl } from "../../../Backend/lib/imageProxy";
import { filterSavedAddressSuggestions, getAddressCategoryLabel, getAddressText } from "./savedAddressModel";

export default function SavedAddressSuggestions({ open, addresses = [], query = "", icon = MapPin, onPick, className = "" }) {
  useI18n();
  const visible = open ? filterSavedAddressSuggestions(addresses, query) : [];
  if (!visible.length) return null;

  return (
    <div
      className={`kt-address-suggestions-enter overflow-hidden rounded-2xl border border-emerald-100 bg-white shadow-lg shadow-slate-950/10 ${className}`}
      role="listbox"
      aria-label={t("addressBook.suggestionsTitle")}
    >
      <p className="flex items-center gap-1.5 border-b border-gray-100 px-3 py-2 text-[11px] font-black uppercase tracking-wide text-emerald-700">
        <BookmarkCheck size={14} />
        {t("addressBook.suggestionsTitle")}
        <span className="text-gray-400">({visible.length})</span>
      </p>
      {/* Two rows tall (~3.6rem each); more saved locations scroll. */}
      <div className="max-h-[7.6rem] overflow-y-auto overscroll-contain p-1">
        {visible.map((address) => (
          <button
            key={address.id || `${address.category}-${getAddressText(address)}`}
            type="button"
            role="option"
            aria-selected="false"
            // Keeps the field focused so the tap lands before any blur closes the list.
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => onPick?.(address)}
            className="kt-touchable flex h-[3.6rem] w-full min-w-0 items-center gap-3 rounded-xl px-2 text-left transition hover:bg-emerald-50"
          >
            {address.frontPictureUrl ? (
              <img src={resizedImageUrl(address.frontPictureUrl, { width: 80, quality: 60 })} alt="" className="h-9 w-9 shrink-0 rounded-lg object-cover" />
            ) : (
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-600 text-white">
                {createElement(icon, { size: 16 })}
              </span>
            )}
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-black text-gray-950">{getAddressCategoryLabel(address)}</span>
              <span className="block truncate text-xs font-semibold text-gray-500">{getAddressText(address)}</span>
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
