import { useCallback, useEffect, useMemo, useState } from "react";
import { Bath, BedDouble, Clock3, MapPin, PackageSearch } from "lucide-react";

import {
  fetchMarketplaceVerticalDiscovery,
  subscribeMarketplaceVerticalDiscovery,
} from "../../Backend/services/marketplace/marketplaceVerticalService";
import { resizedImageUrl } from "../../Backend/lib/imageProxy";
import { showToast } from "../../Backend/services/toastService";
import { useI18n, t } from "../../i18n";
import { getProductCardLocation, buildCardSellerLocation } from "../../Backend/utils/productCardLocation";
import { ensureBuyerLocation, useBuyerLocation } from "../../Backend/utils/buyerLocationContext";
import { rankSimilarVerticalListings } from "../../Backend/services/marketplace/marketplaceDiscovery";
import useBodyScrollLock from "../shared/useBodyScrollLock";
import SellerProfileDrawer from "./Browse/SellerProfileDrawer";
import VerticalBuyerDetail from "./VerticalBuyerDetail";
import {
  bookVerticalListing,
  mapVerticalProduct,
  mealPeriodLabel,
  messageVerticalSeller,
  orderVerticalMeal,
} from "./verticalListingModel";
import { t as i18nText } from "../../i18n/index";

const EMPTY = { restaurants: [], hotels: [], properties: [] };
const VERTICAL_CATALOG_STORAGE_KEY = "kunthai.marketplace.verticalCatalog.v1";
const VERTICAL_CATALOG_MEMORY = {
  catalog: EMPTY,
  loaded: false,
  savedAt: 0,
  inFlight: null,
};

function normalizeVerticalCatalog(catalog) {
  return {
    restaurants: Array.isArray(catalog?.restaurants) ? catalog.restaurants : [],
    hotels: Array.isArray(catalog?.hotels) ? catalog.hotels : [],
    properties: Array.isArray(catalog?.properties) ? catalog.properties : [],
  };
}

// Keep the last complete vertical catalog available just like the retail
// catalog. A fresh request always follows, but restaurant/hotel/property cards
// no longer disappear while a category mounts or the shopper returns to UrMall.
if (typeof localStorage !== "undefined") {
  try {
    const stored = JSON.parse(localStorage.getItem(VERTICAL_CATALOG_STORAGE_KEY) || "null");
    if (stored?.loaded) {
      VERTICAL_CATALOG_MEMORY.catalog = normalizeVerticalCatalog(stored.catalog);
      VERTICAL_CATALOG_MEMORY.loaded = true;
      VERTICAL_CATALOG_MEMORY.savedAt = Number(stored.savedAt || 0);
    }
  } catch {
    // Persistent caching is an enhancement; in-memory caching still applies.
  }
}

function rememberVerticalCatalog(catalog) {
  const normalized = normalizeVerticalCatalog(catalog);
  VERTICAL_CATALOG_MEMORY.catalog = normalized;
  VERTICAL_CATALOG_MEMORY.loaded = true;
  VERTICAL_CATALOG_MEMORY.savedAt = Date.now();
  try {
    localStorage.setItem(
      VERTICAL_CATALOG_STORAGE_KEY,
      JSON.stringify({ catalog: normalized, loaded: true, savedAt: VERTICAL_CATALOG_MEMORY.savedAt }),
    );
  } catch {
    // Storage can be unavailable; the module cache still makes tab changes instant.
  }
  return normalized;
}

function requestVerticalCatalog() {
  if (!VERTICAL_CATALOG_MEMORY.inFlight) {
    VERTICAL_CATALOG_MEMORY.inFlight = fetchMarketplaceVerticalDiscovery()
      .then(rememberVerticalCatalog)
      .finally(() => {
        VERTICAL_CATALOG_MEMORY.inFlight = null;
      });
  }
  return VERTICAL_CATALOG_MEMORY.inFlight;
}

function money(value, currency = "") {
  return `${currency ? `${currency} ` : ""}${Number(value || 0).toLocaleString()}`;
}


export default function VerticalMarketplace({ mode = "all", onDetailChange, priorityType = null }) {
  useI18n();
  const buyerLocation = useBuyerLocation();
  const [catalog, setCatalog] = useState(() => VERTICAL_CATALOG_MEMORY.catalog);
  const [loading, setLoading] = useState(() => !VERTICAL_CATALOG_MEMORY.loaded);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState(null);
  const [profileSeller, setProfileSeller] = useState(null);
  useBodyScrollLock(Boolean(selected));
  useEffect(() => {
    ensureBuyerLocation();
  }, []);

  const selectedProduct = selected ? mapVerticalProduct(selected) : null;
  const relatedSource = selected?.type === "restaurant"
    ? catalog.restaurants
    : selected?.type === "hotel"
      ? catalog.hotels
      : catalog.properties;
  const relatedProducts = selectedProduct
    ? rankSimilarVerticalListings(
        selectedProduct,
        relatedSource.map((item) => mapVerticalProduct({ type: selected.type, item })),
        buyerLocation,
        8,
      )
    : [];

  function openRelatedProduct(product) {
    const type = product?.verticalType;
    const source = type === "restaurant"
      ? catalog.restaurants
      : type === "hotel"
        ? catalog.hotels
        : catalog.properties;
    const item = source.find((entry) => entry.id === product?.id);
    if (item) setSelected({ type, item });
  }


  const loadCatalog = useCallback(async () => {
    const hasCachedCatalog = VERTICAL_CATALOG_MEMORY.loaded;
    if (hasCachedCatalog) {
      setCatalog(VERTICAL_CATALOG_MEMORY.catalog);
      setLoading(false);
    } else {
      setLoading(true);
    }
    try {
      const data = await requestVerticalCatalog();
      setCatalog(data);
      setError("");
    } catch (nextError) {
      setError(hasCachedCatalog ? "" : nextError.message || t("urmall.vertical.loadFailed"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    let refreshTimer;
    const refresh = () => {
      window.clearTimeout(refreshTimer);
      refreshTimer = window.setTimeout(() => { if (active) loadCatalog(); }, 120);
    };
    loadCatalog();
    const unsubscribe = subscribeMarketplaceVerticalDiscovery(refresh);
    window.addEventListener("marketplace-vertical-listing-updated", refresh);
    window.addEventListener("focus", refresh);
    return () => {
      active = false;
      window.clearTimeout(refreshTimer);
      unsubscribe?.();
      window.removeEventListener("marketplace-vertical-listing-updated", refresh);
      window.removeEventListener("focus", refresh);
    };
  }, [loadCatalog]);

  useEffect(() => {
    if (loading || typeof window === "undefined") return;
    const match = String(window.location.hash || "").match(/^#urmall-(meal|property)-([0-9a-f-]+)$/i);
    if (!match) return;
    const type = match[1].toLowerCase() === "meal" ? "restaurant" : "property";
    const source = type === "restaurant" ? catalog.restaurants : catalog.properties;
    const item = source.find((entry) => entry.id === match[2]);
    if (item) setSelected({ type, item });
  }, [catalog.properties, catalog.restaurants, loading]);

  useEffect(() => {
    onDetailChange?.(Boolean(selected));
    return () => onDetailChange?.(false);
  }, [onDetailChange, selected]);

  // The header search overlay opens a chosen restaurant/hotel/property listing
  // here (the item shape matches this catalog's rows).
  useEffect(() => {
    function handleOpenVertical(event) {
      const { type, item } = event.detail || {};
      if (!type || !item) return;
      setSelected({ type, item });
    }

    window.addEventListener("marketplace-open-vertical", handleOpenVertical);
    return () => window.removeEventListener("marketplace-open-vertical", handleOpenVertical);
  }, []);

  const sections = useMemo(() => {
    if (mode === "food") return ["restaurants"];
    if (mode === "hotels") return ["hotels"];
    if (mode === "property") return ["properties"];
    return ["restaurants", "hotels", "properties"];
  }, [mode]);

  if (loading) return mode === "mixed" ? null : <VerticalSkeleton mode={mode} />;

  if (mode === "mixed") {
    const baseItems = [
      ...catalog.restaurants.map((item) => ({ type: "restaurant", item })),
      ...catalog.hotels.map((item) => ({ type: "hotel", item })),
      ...catalog.properties.map((item) => ({ type: "property", item })),
    ];
    // When a category leads the dashboard, float that vertical to the front so
    // its listings show first; the others still follow.
    const mixedItems = priorityType && ["restaurant", "hotel", "property"].includes(priorityType)
      ? [...baseItems.filter((entry) => entry.type === priorityType), ...baseItems.filter((entry) => entry.type !== priorityType)]
      : baseItems;
    return (
      <>
        {error ? <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs font-bold text-amber-800">{error}</div> : null}
        {mixedItems.map(({ type, item }) => type === "restaurant"
          ? <RestaurantCard key={`restaurant-${item.id}`} item={item} onClick={() => setSelected({ type, item })} />
          : type === "hotel"
            ? <HotelCard key={`hotel-${item.id}`} item={item} onClick={() => setSelected({ type, item })} />
            : <PropertyCard key={`property-${item.id}`} item={item} onClick={() => setSelected({ type, item })} />)}
        {selectedProduct ? <VerticalBuyerDetail product={selectedProduct} relatedProducts={relatedProducts} onRelatedProductSelect={openRelatedProduct} type={selected.type} onClose={() => setSelected(null)} onMessage={messageVerticalSeller} onOpenSeller={setProfileSeller} onOrder={selected.type === "restaurant" ? orderVerticalMeal : bookVerticalListing} /> : null}
        <VerticalSellerProfile seller={profileSeller} onClose={() => setProfileSeller(null)} />
      </>
    );
  }

  return (
    <div className="space-y-8">
      {error ? <p className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm font-bold text-amber-800">{error}</p> : null}
      {sections.includes("restaurants") ? (
        <VerticalSection eyebrow={t("urmall.vertical.foodEyebrow")} title={t("urmall.vertical.foodTitle")} subtitle={t("urmall.vertical.foodSubtitle")}>
          <CardLayout compact={mode === "all"} empty={t("urmall.vertical.foodEmpty")}>
            {catalog.restaurants.map((item) => <RestaurantCard key={item.id} item={item} onClick={() => setSelected({ type: "restaurant", item })} />)}
          </CardLayout>
        </VerticalSection>
      ) : null}
      {sections.includes("hotels") ? (
        <VerticalSection eyebrow={t("urmall.vertical.hotelsEyebrow")} title={t("urmall.vertical.hotelsTitle")} subtitle={t("urmall.vertical.hotelsSubtitle")}>
          <CardLayout compact={mode === "all"} empty={t("urmall.vertical.hotelsEmpty")}>
            {catalog.hotels.map((item) => <HotelCard key={item.id} item={item} onClick={() => setSelected({ type: "hotel", item })} />)}
          </CardLayout>
        </VerticalSection>
      ) : null}
      {sections.includes("properties") ? (
        <VerticalSection eyebrow={t("urmall.vertical.propertyEyebrow")} title={t("urmall.vertical.propertyTitle")} subtitle={t("urmall.vertical.propertySubtitle")}>
          <CardLayout compact={mode === "all"} empty={t("urmall.vertical.propertyEmpty")}>
            {catalog.properties.map((item) => <PropertyCard key={item.id} item={item} onClick={() => setSelected({ type: "property", item })} />)}
          </CardLayout>
        </VerticalSection>
      ) : null}

      {selectedProduct ? <VerticalBuyerDetail product={selectedProduct} relatedProducts={relatedProducts} onRelatedProductSelect={openRelatedProduct} type={selected.type} onClose={() => setSelected(null)} onMessage={messageVerticalSeller} onOpenSeller={setProfileSeller} onOrder={selected.type === "restaurant" ? orderVerticalMeal : bookVerticalListing} /> : null}
      <VerticalSellerProfile seller={profileSeller} onClose={() => setProfileSeller(null)} />
    </div>
  );
}

function VerticalSection({ children, eyebrow, subtitle, title }) {
  return <section><p className="text-xs font-black uppercase tracking-[0.18em] text-emerald-700">{eyebrow}</p><h2 className="mt-1 text-2xl font-black text-gray-950">{title}</h2><p className="mt-1 text-sm font-semibold text-gray-500">{subtitle}</p><div className="mt-4">{children}</div></section>;
}

function CardLayout({ children, compact, empty }) {
  const items = Array.isArray(children) ? children : [children].filter(Boolean);
  if (!items.length) return <div className="rounded-2xl border border-dashed border-gray-300 bg-white p-6 text-sm font-bold text-gray-500">{empty}</div>;
  return compact
    ? <div className="flex snap-x gap-3 overflow-x-auto pb-2 [scrollbar-width:none] [&>*]:min-w-[78%] sm:[&>*]:min-w-[340px] [&::-webkit-scrollbar]:hidden">{children}</div>
    : <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{children}</div>;
}

// Shared vertical-listing card. Mirrors the retail BuyerProductCard shell exactly
// — square image, overlaid category pills, and the same body type scale/padding —
// so restaurant, hotel, and property cards line up as the same size beside retail
// cards in the mixed UrMall grid. Content differs per vertical; the shell does not.
function VerticalCardShell({ badges, children, image, imageAlt, onClick }) {
  return (
    <article
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onClick?.();
        }
      }}
      className="group overflow-hidden rounded-lg border border-gray-200 bg-white text-left shadow-sm transition hover:-translate-y-0.5 hover:border-emerald-200 hover:shadow-md"
    >
      <div className="relative aspect-[4/3] overflow-hidden bg-gray-100">
        {image ? (
          <img src={resizedImageUrl(image, { width: 720, quality: 72 })} alt={imageAlt} className="h-full w-full object-cover transition duration-300 group-hover:scale-105" />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-gray-100 via-white to-emerald-50 text-gray-400">
            <PackageSearch size={34} strokeWidth={1.8} />
          </div>
        )}
      </div>
      <div className="space-y-1 p-2">
        {badges ? <div className="flex flex-wrap items-center gap-1">{badges}</div> : null}
        {children}
      </div>
    </article>
  );
}

// Context-aware short area for a vertical card, using the buyer's city vs the
// item's saved city/country/coords and derived local area (privacy-safe).
function verticalCardLocation(item, buyerLocation) {
  return (
    getProductCardLocation({
      buyerLocation,
      sellerLocation: buildCardSellerLocation({
        address: item.address,
        city: item.city,
        country: item.country,
        latitude: item.latitude,
        longitude: item.longitude,
      }),
    }) ||
    item.city ||
    item.address ||
    ""
  );
}

function CardInfoRow({ children, icon: Icon }) {
  return (
    <span className="flex min-w-0 items-center gap-1.5 leading-5">
      <Icon size={13} className="shrink-0 text-emerald-600" />
      <span className="truncate">{children}</span>
    </span>
  );
}

function RestaurantCard({ item, onClick }) {
  const buyerLocation = useBuyerLocation();
  return (
    <VerticalCardShell
      onClick={onClick}
      image={item.image_url || item.bannerUrl}
      imageAlt={item.name}
      badges={
        <>
          <span className="rounded-md bg-orange-600 whitespace-nowrap px-1.5 py-0.5 text-[9px] font-black uppercase text-white">{t("urmall.vertical.catRestaurant")}</span>
          <span className="rounded-md bg-orange-500/95 whitespace-nowrap px-1.5 py-0.5 text-[9px] font-black uppercase text-white">{mealPeriodLabel(item.meal_period)}</span>
        </>
      }
    >
      <h3 className="line-clamp-2 text-[13px] font-black leading-[1.05rem] text-gray-950">{item.name}</h3>
      <p className="text-base font-black text-gray-950">{money(item.price, item.currency)}</p>
      <div className="grid gap-0.5 text-[11px] font-bold text-gray-500">
        <CardInfoRow icon={MapPin}>{verticalCardLocation(item, buyerLocation) || t("urmall.vertical.locationAvailable")}</CardInfoRow>
        <CardInfoRow icon={Clock3}>{item.preparation_minutes || 20} {t("urmall.vertical.minutesShort")}</CardInfoRow>
      </div>
    </VerticalCardShell>
  );
}

function HotelCard({ item, onClick }) {
  const buyerLocation = useBuyerLocation();
  return (
    <VerticalCardShell
      onClick={onClick}
      image={item.images?.[0] || item.bannerUrl}
      imageAlt={item.businessName}
      badges={
        <>
          <span className="rounded-md bg-blue-600 whitespace-nowrap px-1.5 py-0.5 text-[9px] font-black uppercase text-white">{t("urmall.vertical.catHotel")}</span>
          <span className="rounded-md bg-blue-500/95 whitespace-nowrap px-1.5 py-0.5 text-[9px] font-black uppercase text-white">{t("urmall.vertical.availableRooms")}</span>
        </>
      }
    >
      <h3 className="line-clamp-2 text-[13px] font-black leading-[1.05rem] text-gray-950">{item.businessName}</h3>
      <p className="text-base font-black text-gray-950">
        {money(item.fromPrice, item.currency)}
        <span className="text-[11px] font-bold text-gray-400"> {t("urmall.vertical.perNightSuffix")}</span>
      </p>
      <div className="grid gap-0.5 text-[11px] font-bold text-gray-500">
        <CardInfoRow icon={MapPin}>{verticalCardLocation(item, buyerLocation) || item.address}</CardInfoRow>
        <CardInfoRow icon={BedDouble}>{t("urmall.vertical.availableRooms")}</CardInfoRow>
      </div>
    </VerticalCardShell>
  );
}

function PropertyCard({ item, onClick }) {
  const buyerLocation = useBuyerLocation();
  return (
    <VerticalCardShell
      onClick={onClick}
      image={item.image_urls?.[0] || item.bannerUrl}
      imageAlt={item.title}
      badges={
        <>
          <span className="rounded-md bg-violet-700 whitespace-nowrap px-1.5 py-0.5 text-[9px] font-black uppercase text-white">{t("urmall.vertical.catProperty")}</span>
          <span className="rounded-md bg-violet-500/95 whitespace-nowrap px-1.5 py-0.5 text-[9px] font-black uppercase text-white">{t("urmall.vertical.forPurpose", { purpose: item.purpose })}</span>
        </>
      }
    >
      <h3 className="line-clamp-2 text-[13px] font-black leading-[1.05rem] text-gray-950">{item.title}</h3>
      <p className="text-base font-black text-gray-950">
        {money(item.price, item.currency)}
        {item.purpose === "rent" ? <span className="text-[11px] font-bold text-gray-400">/{item.rent_period || i18nText("ui.literals.k021710fa7866")}</span> : null}
      </p>
      <div className="grid gap-0.5 text-[11px] font-bold text-gray-500">
        <CardInfoRow icon={MapPin}>{verticalCardLocation(item, buyerLocation) || item.address}</CardInfoRow>
        <span className="flex min-w-0 items-center gap-2 leading-5">
          <span className="flex shrink-0 items-center gap-1"><BedDouble size={13} className="text-emerald-600" /> {item.bedrooms || 0}</span>
          <span className="flex shrink-0 items-center gap-1"><Bath size={13} className="text-emerald-600" /> {item.bathrooms || 0}</span>
          {item.property_type ? <span className="truncate capitalize">{item.property_type}</span> : null}
        </span>
      </div>
    </VerticalCardShell>
  );
}


function VerticalSellerProfile({ onClose, seller }) {
  return <SellerProfileDrawer seller={seller} open={Boolean(seller)} onClose={onClose} onNotice={(message, tone = "success") => showToast(message, tone)} showSaveStore={false} />;
}

function VerticalSkeleton({ mode }) {
  return <div className="space-y-4" aria-label={t("urmall.vertical.loadingBusinesses", { mode })}><div className="h-8 w-48 animate-pulse rounded-xl bg-gray-200" /><div className="flex gap-3 overflow-hidden">{[1, 2, 3].map((item) => <div key={item} className="h-72 min-w-[78%] animate-pulse rounded-[24px] bg-gray-200 sm:min-w-[340px]" />)}</div></div>;
}
