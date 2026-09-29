import { Check, Clapperboard, Hash, Hotel, Home, MapPin, Navigation, Newspaper, Package, Star, Store, UserRound, UtensilsCrossed } from "lucide-react";

import { useI18n } from "../../../i18n";
import { resizedImageUrl } from "../../../Backend/lib/imageProxy";
import { formatCurrency } from "../../../Backend/utils/formatCurrency";
import { moneyLabel, verticalName, verticalPrice } from "../../../Backend/services/ai/urmallAiModels";
import { areaViewDestinationFromPlace } from "../../../Backend/services/ai/urrideAiModels";
import { startTripBooking } from "../../../Backend/services/ai/tripBookingFlow";
import {
  openExploreResult,
  openMarketplaceProduct,
  openMarketplaceSeller,
  openMarketplaceVertical,
} from "../../../Backend/services/ai/aiEntityNavigation";
import { useI18n as useUiLocale } from "../../../i18n/index.js";

// KAI — result cards.
//
// Every value on these cards (name, price, seller, image) is read from the real
// KunThai record the tool returned, never from the model's wording. Tapping a
// card opens it through KunThai's normal screens.

function Thumb({ src, icon: Icon }) {
  useUiLocale();
  return (
    <span className="grid h-14 w-14 flex-none place-items-center overflow-hidden rounded-xl bg-slate-100 text-slate-400">
      {src ? (
        <img src={resizedImageUrl(src, { width: 112, quality: 70 })} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" />
      ) : (
        <Icon size={18} />
      )}
    </span>
  );
}

function ProductCard({ product, selectable, selected, onToggleSelect, onOpened }) {
  const { t } = useI18n();
  const discount = Number(product.discountPrice);
  const hasDiscount = Number.isFinite(discount) && discount > 0 && discount < Number(product.price || 0);
  const price = hasDiscount ? discount : Number(product.price || 0);
  const money = product.currency || product.seller?.currency || product.countryCode || "";

  return (
    <div className={`flex items-center gap-3 rounded-2xl border bg-white p-2 transition ${selected ? "border-sky-400 ring-2 ring-sky-100" : "border-slate-200"}`}>
      <button
        type="button"
        onClick={() => {
          openMarketplaceProduct(product);
          onOpened?.();
        }}
        className="flex min-w-0 flex-1 items-center gap-3 text-left"
      >
        <Thumb src={product.imageUrl} icon={Package} />
        <span className="min-w-0">
          <span className="block truncate text-sm font-black text-slate-900">{product.name}</span>
          <span className="flex items-baseline gap-1.5">
            <span className="text-sm font-black text-emerald-700">{formatCurrency(price, money)}</span>
            {hasDiscount ? <span className="text-[11px] font-bold text-slate-400 line-through">{formatCurrency(product.price, money)}</span> : null}
          </span>
          <span className="block truncate text-[11px] font-semibold text-slate-500">
            {[product.seller?.name, product.seller?.city || product.location].filter(Boolean).join(" · ")}
          </span>
        </span>
      </button>
      {selectable ? (
        <button
          type="button"
          onClick={() => onToggleSelect?.(product.id)}
          aria-pressed={selected}
          aria-label={t("ai.chat.selectToCompare", { name: product.name })}
          className={`grid h-8 w-8 flex-none place-items-center rounded-lg border text-xs transition ${
            selected ? "border-sky-500 bg-sky-500 text-white" : "border-slate-200 bg-white text-slate-400 hover:border-sky-300"
          }`}
        >
          <Check size={14} />
        </button>
      ) : null}
    </div>
  );
}

const VERTICAL_ICONS = { restaurant: UtensilsCrossed, hotel: Hotel, property: Home };

function VerticalCard({ type, item, onOpened }) {
  const { t } = useI18n();
  const price = verticalPrice(type, item);
  const label = price > 0 ? moneyLabel(price, item.currency) : "";
  const image = type === "restaurant" ? item.image_url || (item.image_urls || [])[0] : type === "hotel" ? (item.images || [])[0] : (item.image_urls || [])[0];

  return (
    <button
      type="button"
      onClick={() => {
        openMarketplaceVertical(type, item);
        onOpened?.();
      }}
      className="flex w-full items-center gap-3 rounded-2xl border border-slate-200 bg-white p-2 text-left"
    >
      <Thumb src={image} icon={VERTICAL_ICONS[type] || Store} />
      <span className="min-w-0">
        <span className="block truncate text-sm font-black text-slate-900">{verticalName(type, item)}</span>
        {label ? (
          <span className="block text-sm font-black text-emerald-700">
            {type === "hotel" ? t("ai.chat.fromPerNight", { price: label }) : label}
          </span>
        ) : null}
        <span className="flex items-center gap-1 truncate text-[11px] font-semibold text-slate-500">
          <MapPin size={10} className="flex-none" />
          {[item.businessName, item.city].filter(Boolean).join(" · ")}
        </span>
      </span>
    </button>
  );
}

function StoreCard({ store, onOpened }) {
  useUiLocale();
  return (
    <button
      type="button"
      onClick={() => {
        openMarketplaceSeller(store);
        onOpened?.();
      }}
      className="flex w-full items-center gap-3 rounded-2xl border border-slate-200 bg-white p-2 text-left"
    >
      <Thumb src={store.logoUrl} icon={Store} />
      <span className="min-w-0">
        <span className="flex items-center gap-1 truncate text-sm font-black text-slate-900">
          {store.name}
          {store.verificationStatus === "verified" ? <Star size={11} className="flex-none fill-amber-400 text-amber-400" /> : null}
        </span>
        <span className="block truncate text-[11px] font-semibold text-slate-500">{[store.city, store.country].filter(Boolean).join(", ")}</span>
      </span>
    </button>
  );
}

// "Plan trip" starts KAI's guided booking in the chat (open booking or a
// chosen operator, then the booking questions) instead of jumping to the map.
function PlaceCard({ place }) {
  const { t } = useI18n();
  const destination = areaViewDestinationFromPlace(place);
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-2.5">
      <span className="grid h-10 w-10 flex-none place-items-center rounded-xl bg-emerald-50 text-emerald-700">
        <MapPin size={17} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-black text-slate-900">{place.name}</span>
        <span className="block truncate text-[11px] font-semibold text-slate-500">
          {[place.distance, place.address].filter(Boolean).join(" · ")}
        </span>
      </span>
      {destination ? (
        <button
          type="button"
          onClick={() => startTripBooking(place)}
          className="inline-flex flex-none items-center gap-1 rounded-xl bg-emerald-600 px-2.5 py-2 text-[11px] font-black text-white"
        >
          <Navigation size={12} />
          {t("ai.chat.planTrip")}
        </button>
      ) : null}
    </div>
  );
}

const EXPLORE_ICONS = { feed: Newspaper, swip: Clapperboard, people: UserRound, hashtag: Hash };

function ExploreResultCard({ item, onOpened }) {
  useUiLocale();
  const Icon = EXPLORE_ICONS[item.type] || Newspaper;
  return (
    <button
      type="button"
      onClick={() => {
        openExploreResult(item);
        onOpened?.();
      }}
      className="flex w-full items-center gap-3 rounded-2xl border border-slate-200 bg-white p-2 text-left"
    >
      {item.avatarUrl ? (
        <Thumb src={item.avatarUrl} icon={Icon} />
      ) : (
        <span className="grid h-14 w-14 flex-none place-items-center rounded-xl bg-sky-50 text-sky-700">
          <Icon size={18} />
        </span>
      )}
      <span className="min-w-0">
        <span className="block truncate text-sm font-black text-slate-900">{item.title}</span>
        <span className="line-clamp-2 text-[11px] font-semibold leading-4 text-slate-500">{item.subtitle}</span>
      </span>
    </button>
  );
}

export default function AiEntityCards({ entities, selection = [], onToggleSelect, onOpened }) {
  useUiLocale();
  if (!entities) return null;
  const products = entities.products || [];
  const verticals = entities.verticals || [];
  const stores = entities.stores || [];
  const places = entities.places || [];
  const exploreResults = entities.exploreResults || [];
  if (!products.length && !verticals.length && !stores.length && !places.length && !exploreResults.length) return null;

  return (
    <div className="mt-2 space-y-1.5">
      {products.map((product) => (
        <ProductCard
          key={`p-${product.id}`}
          product={product}
          selectable={products.length > 1}
          selected={selection.includes(product.id)}
          onToggleSelect={onToggleSelect}
          onOpened={onOpened}
        />
      ))}
      {verticals.map(({ type, item }) => (
        <VerticalCard key={`v-${type}-${item.id}`} type={type} item={item} onOpened={onOpened} />
      ))}
      {stores.map((store) => (
        <StoreCard key={`s-${store.id}`} store={store} onOpened={onOpened} />
      ))}
      {places.map((place) => (
        <PlaceCard key={`pl-${place.id}`} place={place} />
      ))}
      {exploreResults.map((item) => (
        <ExploreResultCard key={`ex-${item.type}-${item.id}`} item={item} onOpened={onOpened} />
      ))}
    </div>
  );
}
