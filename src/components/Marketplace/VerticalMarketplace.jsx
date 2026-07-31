import { useCallback, useEffect, useMemo, useState } from "react";
import { Bath, BedDouble, Clock3, MapPin } from "lucide-react";

import {
  createVerticalBooking,
  fetchMarketplaceVerticalDiscovery,
  subscribeMarketplaceVerticalDiscovery,
} from "../../Backend/services/marketplace/marketplaceVerticalService";
import { createBuyerProductOrder, sendBuyerMarketplaceMessage } from "../../Backend/services/marketplace/buyerMarketplaceService";
import { urMallShareToastOptions } from "../../Backend/services/shareCtaService";
import { showToast } from "../../Backend/services/toastService";
import { useI18n, t } from "../../i18n";
import useBodyScrollLock from "../shared/useBodyScrollLock";
import ProductDetailDrawer from "./Browse/ProductDetailDrawer";
import SellerProfileDrawer from "./Browse/SellerProfileDrawer";
import { MarketplaceVerificationBadge, MarketplaceVerificationModal } from "./shared/MarketplaceVerification";

const EMPTY = { restaurants: [], hotels: [], properties: [] };

function money(value, currency = "") {
  return `${currency ? `${currency} ` : ""}${Number(value || 0).toLocaleString()}`;
}

function mealPeriodLabel(period) {
  return period ? String(period).replaceAll("_", " ") : t("urmall.vertical.allDay");
}

function mapVerticalProduct({ item, type }) {
  const seller = {
    id: item.businessId || (type === "hotel" ? item.id : item.business_id),
    name: item.businessName || t("urmall.vertical.businessFallback"),
    city: item.city || "",
    country: item.country || "",
    countryCode: item.countryIso || "",
    currency: item.currency || "",
    location: item.address || item.city || "",
    address: item.address || "",
    latitude: item.latitude ?? null,
    longitude: item.longitude ?? null,
    phone: item.phone || "",
    whatsappEnabled: Boolean(item.whatsappEnabled),
    whatsapp: item.whatsapp || "",
    bannerUrl: item.bannerUrl || "",
    description: item.description || "",
    businessKind: item.businessKind || (type === "restaurant" ? "restaurant" : type === "hotel" ? "hotel" : "property_agent"),
    category: type === "restaurant" ? t("urmall.vertical.catRestaurant") : type === "hotel" ? t("urmall.vertical.catHotel") : t("urmall.vertical.catProperty"),
    deliveryEnabled: Boolean(item.deliveryEnabled),
    pickupEnabled: Boolean(item.pickupEnabled),
    logoUrl: item.logoUrl || "",
    verificationStatus: item.verificationStatus || "pending",
  };
  const shared = {
    id: item.id,
    businessId: seller.id,
    isVertical: true,
    verticalType: type,
    seller,
    currency: item.currency || "",
    country: item.country || "",
    countryCode: item.countryIso || "",
    location: item.address || item.city || t("urmall.vertical.locationFromBusiness"),
    stock: 999,
    sales: 0,
    condition: "active",
    rating: 0,
    reviewCount: 0,
    allowNegotiation: false,
    deliveryAvailable: Boolean(item.deliveryEnabled),
    pickupAvailable: Boolean(item.pickupEnabled),
  };

  if (type === "restaurant") return {
    ...shared,
    name: item.name,
    category: t("urmall.vertical.restaurantMeal"),
    price: Number(item.price || 0),
    description: item.description || t("urmall.vertical.mealDescription", { name: seller.name }),
    imageUrl: item.image_url || item.bannerUrl || "",
    imageUrls: [item.image_url, ...(item.image_urls || [])].filter(Boolean),
    videoUrl: item.video_url || "",
    details: {
      specifications: t("urmall.vertical.mealSpec", { period: mealPeriodLabel(item.meal_period), minutes: item.preparation_minutes || 20 }),
    },
  };

  if (type === "hotel") return {
    ...shared,
    id: item.id || seller.id,
    name: item.businessName,
    category: t("urmall.vertical.catHotel"),
    price: Number(item.fromPrice || 0),
    description: item.description || t("urmall.vertical.hotelDescription", { name: seller.name }),
    imageUrl: item.images?.[0] || item.bannerUrl || "",
    imageUrls: item.images || [],
    videoUrl: item.videoUrl || "",
    details: {
      specifications: t(item.rooms?.length === 1 ? "urmall.vertical.hotelSpecOne" : "urmall.vertical.hotelSpecMany", { count: item.rooms?.length || 0 }),
    },
  };

  return {
    ...shared,
    name: item.title,
    category: t("urmall.vertical.propertyForPurpose", { purpose: item.purpose || "viewing" }),
    price: Number(item.price || 0),
    description: item.description || t("urmall.vertical.propertyDescription", { name: seller.name }),
    imageUrl: item.image_urls?.[0] || item.bannerUrl || "",
    imageUrls: item.image_urls || [],
    videoUrl: item.video_url || "",
    allowNegotiation: true,
    details: {
      specifications: [
        item.property_type,
        t("urmall.vertical.bedroomsN", { count: item.bedrooms || 0 }),
        t("urmall.vertical.bathroomsN", { count: item.bathrooms || 0 }),
        item.furnished ? t("urmall.vertical.furnished") : t("urmall.vertical.notFurnished"),
      ].filter(Boolean).join(" · "),
    },
  };
}

export default function VerticalMarketplace({ mode = "all", onDetailChange }) {
  useI18n();
  const [catalog, setCatalog] = useState(EMPTY);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState(null);
  const [verification, setVerification] = useState(null);
  const [profileSeller, setProfileSeller] = useState(null);
  useBodyScrollLock(Boolean(selected));

  const selectedProduct = selected ? mapVerticalProduct(selected) : null;

  async function messageSeller(product, options = {}) {
    try {
      await sendBuyerMarketplaceMessage({
        seller: product.seller,
        product,
        topic: product.name,
        message: options.message || t("urmall.vertical.messageGreeting", { name: product.name }),
        messageType: options.messageType || "question",
      });
      showToast(t("urmall.vertical.messageSent"), "success");
    } catch (error) {
      showToast(error.message || t("urmall.vertical.messageFailed"), "danger");
      throw error;
    }
  }

  async function orderRestaurant(product, orderInput) {
    try {
      await createBuyerProductOrder(product, orderInput);
      showToast(t("urmall.vertical.orderSent"), "success", urMallShareToastOptions());
    } catch (error) {
      showToast(error.message || t("urmall.vertical.orderFailed"), "danger");
      throw error;
    }
  }

  async function bookVertical(product, bookingInput) {
    try {
      await createVerticalBooking(product, bookingInput);
      showToast(t("urmall.vertical.bookingSent"), "success", urMallShareToastOptions());
    } catch (error) {
      showToast(error.message || t("urmall.vertical.bookingFailed"), "danger");
      throw error;
    }
  }

  const loadCatalog = useCallback(async ({ initial = false } = {}) => {
    if (initial) setLoading(true);
    try {
      const data = await fetchMarketplaceVerticalDiscovery();
      setCatalog(data);
      setError("");
    } catch (nextError) {
      setError(nextError.message || t("urmall.vertical.loadFailed"));
    } finally {
      if (initial) setLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    let refreshTimer;
    const refresh = () => {
      window.clearTimeout(refreshTimer);
      refreshTimer = window.setTimeout(() => { if (active) loadCatalog(); }, 120);
    };
    loadCatalog({ initial: true });
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

  const sections = useMemo(() => {
    if (mode === "food") return ["restaurants"];
    if (mode === "hotels") return ["hotels"];
    if (mode === "property") return ["properties"];
    return ["restaurants", "hotels", "properties"];
  }, [mode]);

  if (loading) return mode === "mixed" ? null : <VerticalSkeleton mode={mode} />;

  if (mode === "mixed") {
    const mixedItems = [
      ...catalog.restaurants.map((item) => ({ type: "restaurant", item })),
      ...catalog.hotels.map((item) => ({ type: "hotel", item })),
      ...catalog.properties.map((item) => ({ type: "property", item })),
    ];
    return (
      <>
        {error ? <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs font-bold text-amber-800">{error}</div> : null}
        {mixedItems.map(({ type, item }) => type === "restaurant"
          ? <RestaurantCard key={`restaurant-${item.id}`} item={item} onClick={() => setSelected({ type, item })} onVerification={() => setVerification(item)} />
          : type === "hotel"
            ? <HotelCard key={`hotel-${item.id}`} item={item} onClick={() => setSelected({ type, item })} onVerification={() => setVerification(item)} />
            : <PropertyCard key={`property-${item.id}`} item={item} onClick={() => setSelected({ type, item })} onVerification={() => setVerification(item)} />)}
        {selectedProduct ? <VerticalBuyerDetail product={selectedProduct} type={selected.type} onClose={() => setSelected(null)} onMessage={messageSeller} onOpenSeller={setProfileSeller} onOrder={selected.type === "restaurant" ? orderRestaurant : bookVertical} /> : null}
        <VerticalSellerProfile seller={profileSeller} onClose={() => setProfileSeller(null)} />
        {verification ? <MarketplaceVerificationModal status={verification.verificationStatus} audience="buyer" onClose={() => setVerification(null)} /> : null}
      </>
    );
  }

  return (
    <div className="space-y-8">
      {error ? <p className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm font-bold text-amber-800">{error}</p> : null}
      {sections.includes("restaurants") ? (
        <VerticalSection eyebrow={t("urmall.vertical.foodEyebrow")} title={t("urmall.vertical.foodTitle")} subtitle={t("urmall.vertical.foodSubtitle")}>
          <CardLayout compact={mode === "all"} empty={t("urmall.vertical.foodEmpty")}>
            {catalog.restaurants.map((item) => <RestaurantCard key={item.id} item={item} onClick={() => setSelected({ type: "restaurant", item })} onVerification={() => setVerification(item)} />)}
          </CardLayout>
        </VerticalSection>
      ) : null}
      {sections.includes("hotels") ? (
        <VerticalSection eyebrow={t("urmall.vertical.hotelsEyebrow")} title={t("urmall.vertical.hotelsTitle")} subtitle={t("urmall.vertical.hotelsSubtitle")}>
          <CardLayout compact={mode === "all"} empty={t("urmall.vertical.hotelsEmpty")}>
            {catalog.hotels.map((item) => <HotelCard key={item.id} item={item} onClick={() => setSelected({ type: "hotel", item })} onVerification={() => setVerification(item)} />)}
          </CardLayout>
        </VerticalSection>
      ) : null}
      {sections.includes("properties") ? (
        <VerticalSection eyebrow={t("urmall.vertical.propertyEyebrow")} title={t("urmall.vertical.propertyTitle")} subtitle={t("urmall.vertical.propertySubtitle")}>
          <CardLayout compact={mode === "all"} empty={t("urmall.vertical.propertyEmpty")}>
            {catalog.properties.map((item) => <PropertyCard key={item.id} item={item} onClick={() => setSelected({ type: "property", item })} onVerification={() => setVerification(item)} />)}
          </CardLayout>
        </VerticalSection>
      ) : null}

      {selectedProduct ? <VerticalBuyerDetail product={selectedProduct} type={selected.type} onClose={() => setSelected(null)} onMessage={messageSeller} onOpenSeller={setProfileSeller} onOrder={selected.type === "restaurant" ? orderRestaurant : bookVertical} /> : null}
      <VerticalSellerProfile seller={profileSeller} onClose={() => setProfileSeller(null)} />
      {verification ? <MarketplaceVerificationModal status={verification.verificationStatus} audience="buyer" onClose={() => setVerification(null)} /> : null}
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

function CardShell({ children, image, imageAlt, onClick }) {
  return <article role="button" tabIndex={0} onClick={onClick} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") onClick?.(); }} className="snap-start overflow-hidden rounded-[24px] border border-gray-200 bg-white text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"><div className="h-44 bg-gradient-to-br from-emerald-100 to-slate-100">{image ? <img src={image} alt={imageAlt} className="h-full w-full object-cover" /> : null}</div><div className="p-4">{children}</div></article>;
}

function RestaurantCard({ item, onClick, onVerification }) {
  return <CardShell image={item.image_url || item.bannerUrl} imageAlt={item.name} onClick={onClick}><div className="flex items-center justify-between gap-3"><div className="flex flex-wrap gap-1"><span className="rounded-full bg-orange-600 px-2.5 py-1 text-[11px] font-black text-white">{t("urmall.vertical.catRestaurant")}</span><span className="rounded-full bg-orange-50 px-2.5 py-1 text-[11px] font-black text-orange-700">{mealPeriodLabel(item.meal_period)}</span></div><span className="text-xs font-black text-emerald-700">{money(item.price, item.currency)}</span></div><h3 className="mt-3 text-lg font-black text-gray-950">{item.name}</h3><p className="mt-1 truncate text-sm font-bold text-gray-600">{item.businessName}</p><div className="mt-2" onClick={(event) => event.stopPropagation()}><MarketplaceVerificationBadge status={item.verificationStatus} onClick={onVerification} /></div><p className="mt-3 flex items-center gap-2 text-xs font-bold text-gray-500"><Clock3 size={15} /> {item.preparation_minutes || 20} {t("urmall.vertical.minutesShort")} <MapPin size={15} className="ml-2" /> {item.city || t("urmall.vertical.locationAvailable")}</p></CardShell>;
}

function HotelCard({ item, onClick, onVerification }) {
  return <CardShell image={item.images?.[0] || item.bannerUrl} imageAlt={item.businessName} onClick={onClick}><div className="flex flex-wrap gap-1"><span className="rounded-full bg-blue-600 px-2.5 py-1 text-[11px] font-black text-white">{t("urmall.vertical.catHotel")}</span><span className="rounded-full bg-blue-50 px-2.5 py-1 text-[11px] font-black text-blue-700">{t("urmall.vertical.availableRooms")}</span></div><h3 className="mt-3 text-lg font-black text-gray-950">{item.businessName}</h3><div className="mt-2" onClick={(event) => event.stopPropagation()}><MarketplaceVerificationBadge status={item.verificationStatus} onClick={onVerification} /></div><p className="mt-2 flex items-center gap-1.5 text-sm font-bold text-gray-500"><MapPin size={15} /> {item.city || item.address}</p><p className="mt-3 text-sm font-black text-gray-950">{t("urmall.vertical.fromPerNight", { value: money(item.fromPrice, item.currency) })}</p></CardShell>;
}

function PropertyCard({ item, onClick, onVerification }) {
  return <CardShell image={item.image_urls?.[0] || item.bannerUrl} imageAlt={item.title} onClick={onClick}><div className="flex items-center justify-between gap-3"><div className="flex flex-wrap gap-1"><span className="rounded-full bg-violet-700 px-2.5 py-1 text-[11px] font-black text-white">{t("urmall.vertical.catProperty")}</span><span className="rounded-full bg-violet-50 px-2.5 py-1 text-[11px] font-black uppercase text-violet-700">{t("urmall.vertical.forPurpose", { purpose: item.purpose })}</span></div><span className="text-xs font-black capitalize text-gray-500">{item.property_type}</span></div><h3 className="mt-3 text-lg font-black text-gray-950">{item.title}</h3><div className="mt-2" onClick={(event) => event.stopPropagation()}><MarketplaceVerificationBadge status={item.verificationStatus} onClick={onVerification} /></div><p className="mt-2 flex items-center gap-1.5 text-sm font-bold text-gray-500"><MapPin size={15} /> {item.city || item.address}</p><div className="mt-3 flex items-center gap-4 text-xs font-bold text-gray-500"><span className="flex items-center gap-1"><BedDouble size={15} /> {item.bedrooms}</span><span className="flex items-center gap-1"><Bath size={15} /> {item.bathrooms}</span><strong className="ml-auto text-sm text-gray-950">{money(item.price, item.currency)}{item.purpose === "rent" ? `/${item.rent_period || "month"}` : ""}</strong></div></CardShell>;
}

function VerticalBuyerDetail({ onClose, onMessage, onOpenSeller, onOrder, product, type }) {
  const isRestaurant = type === "restaurant";
  const serviceValue = isRestaurant
    ? product.deliveryAvailable && product.pickupAvailable ? t("urmall.vertical.serviceDeliveryPickup") : product.deliveryAvailable ? t("urmall.vertical.serviceDelivery") : t("urmall.vertical.servicePickup")
    : type === "hotel" ? t("urmall.vertical.serviceHotelDates") : t("urmall.vertical.servicePropertyViewing");
  return (
    <ProductDetailDrawer
      product={product}
      open
      onClose={onClose}
      onMessageSeller={onMessage}
      onOpenSeller={(seller) => onOpenSeller?.({ ...seller, verticalType: type })}
      onOrderProduct={onOrder}
      onNotice={(message, tone = "success") => showToast(message, tone)}
      actionLabel={isRestaurant ? t("urmall.vertical.actionOrder") : t("urmall.vertical.actionBook")}
      actionMode={isRestaurant ? "order" : "booking"}
      bookingStartLabel={type === "hotel" ? t("urmall.vertical.checkIn") : t("urmall.vertical.viewingDate")}
      bookingEndLabel={t("urmall.vertical.checkOut")}
      bookingUsesEndDate={type === "hotel"}
      showAddToCart={false}
      showMessage={isRestaurant}
      showOrder
      showInventory={false}
      showSave={false}
      reviewLabel={t("urmall.vertical.review")}
      reviewHeading={t("urmall.vertical.reviews")}
      reviewType="marketplace"
      detailsHeading={type === "restaurant" ? t("urmall.vertical.detailsMeal") : type === "hotel" ? t("urmall.vertical.detailsHotel") : t("urmall.vertical.detailsProperty")}
      historyKey={`marketplace-${type}-detail`}
      messageContextLabel={type === "restaurant" ? t("urmall.vertical.inquiryMeal") : type === "hotel" ? t("urmall.vertical.inquiryHotel") : t("urmall.vertical.inquiryProperty")}
      messageLabel={t("urmall.vertical.message")}
      serviceLabel={type === "restaurant" ? t("urmall.vertical.fulfilment") : type === "hotel" ? t("urmall.vertical.stay") : t("urmall.vertical.viewing")}
      serviceValue={serviceValue}
    />
  );
}

function VerticalSellerProfile({ onClose, seller }) {
  return <SellerProfileDrawer seller={seller} open={Boolean(seller)} onClose={onClose} onNotice={(message, tone = "success") => showToast(message, tone)} showSaveStore={false} />;
}

function VerticalSkeleton({ mode }) {
  return <div className="space-y-4" aria-label={t("urmall.vertical.loadingBusinesses", { mode })}><div className="h-8 w-48 animate-pulse rounded-xl bg-gray-200" /><div className="flex gap-3 overflow-hidden">{[1, 2, 3].map((item) => <div key={item} className="h-72 min-w-[78%] animate-pulse rounded-[24px] bg-gray-200 sm:min-w-[340px]" />)}</div></div>;
}
