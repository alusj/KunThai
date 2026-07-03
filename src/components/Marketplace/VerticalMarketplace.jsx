import { useCallback, useEffect, useMemo, useState } from "react";
import { Bath, BedDouble, Clock3, MapPin } from "lucide-react";

import {
  createVerticalBooking,
  fetchMarketplaceVerticalDiscovery,
  subscribeMarketplaceVerticalDiscovery,
} from "../../Backend/services/marketplace/marketplaceVerticalService";
import { createBuyerProductOrder, sendBuyerMarketplaceMessage } from "../../Backend/services/marketplace/buyerMarketplaceService";
import { showToast } from "../../Backend/services/toastService";
import useBodyScrollLock from "../shared/useBodyScrollLock";
import ProductDetailDrawer from "./Browse/ProductDetailDrawer";
import SellerProfileDrawer from "./Browse/SellerProfileDrawer";
import { MarketplaceVerificationBadge, MarketplaceVerificationModal } from "./shared/MarketplaceVerification";

const EMPTY = { restaurants: [], hotels: [], properties: [] };

function money(value, currency = "") {
  return `${currency ? `${currency} ` : ""}${Number(value || 0).toLocaleString()}`;
}

function mapVerticalProduct({ item, type }) {
  const seller = {
    id: item.businessId || (type === "hotel" ? item.id : item.business_id),
    name: item.businessName || "UrMall business",
    city: item.city || "",
    country: item.country || "",
    countryCode: item.countryIso || "",
    currency: item.currency || "",
    location: item.address || item.city || "",
    address: item.address || "",
    latitude: item.latitude ?? null,
    longitude: item.longitude ?? null,
    phone: item.phone || "",
    bannerUrl: item.bannerUrl || "",
    description: item.description || "",
    businessKind: item.businessKind || (type === "restaurant" ? "restaurant" : type === "hotel" ? "hotel" : "property_agent"),
    category: type === "restaurant" ? "Restaurant" : type === "hotel" ? "Hotel" : "Property",
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
    location: item.address || item.city || "Location available from the business",
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
    category: "Restaurant meal",
    price: Number(item.price || 0),
    description: item.description || `A meal from ${seller.name}. Message the restaurant to confirm ingredients, availability, pickup, or delivery.`,
    imageUrl: item.image_url || item.bannerUrl || "",
    imageUrls: [item.image_url, ...(item.image_urls || [])].filter(Boolean),
    videoUrl: item.video_url || "",
    details: {
      specifications: `${String(item.meal_period || "all day").replaceAll("_", " ")} · ${item.preparation_minutes || 20} minute preparation`,
    },
  };

  if (type === "hotel") return {
    ...shared,
    id: item.id || seller.id,
    name: item.businessName,
    category: "Hotel",
    price: Number(item.fromPrice || 0),
    description: item.description || `Browse ${seller.name}, then message the hotel to confirm room availability, dates, policies, and the final rate.`,
    imageUrl: item.images?.[0] || item.bannerUrl || "",
    imageUrls: item.images || [],
    videoUrl: item.videoUrl || "",
    details: {
      specifications: `${item.rooms?.length || 0} room type${item.rooms?.length === 1 ? "" : "s"} · rates shown per night`,
    },
  };

  return {
    ...shared,
    name: item.title,
    category: `Property for ${item.purpose || "viewing"}`,
    price: Number(item.price || 0),
    description: item.description || `Message ${seller.name} to confirm viewing arrangements, ownership or agency documents, availability, and payment terms.`,
    imageUrl: item.image_urls?.[0] || item.bannerUrl || "",
    imageUrls: item.image_urls || [],
    videoUrl: item.video_url || "",
    allowNegotiation: true,
    details: {
      specifications: [item.property_type, `${item.bedrooms || 0} bedrooms`, `${item.bathrooms || 0} bathrooms`, item.furnished ? "Furnished" : "Not furnished"].filter(Boolean).join(" · "),
    },
  };
}

export default function VerticalMarketplace({ mode = "all", onDetailChange }) {
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
        message: options.message || `Hello, I would like to know more about ${product.name}.`,
        messageType: options.messageType || "question",
      });
      showToast("Message sent to the seller.", "success");
    } catch (error) {
      showToast(error.message || "Unable to send this message.", "danger");
      throw error;
    }
  }

  async function orderRestaurant(product, orderInput) {
    try {
      await createBuyerProductOrder(product, orderInput);
      showToast("Restaurant order sent.", "success");
    } catch (error) {
      showToast(error.message || "Unable to send this order.", "danger");
      throw error;
    }
  }

  async function bookVertical(product, bookingInput) {
    try {
      await createVerticalBooking(product, bookingInput);
      showToast("Booking request sent to the business.", "success");
    } catch (error) {
      showToast(error.message || "Unable to send this booking request.", "danger");
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
      setError(nextError.message || "Unable to load these UrMall businesses.");
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
        <VerticalSection eyebrow="Food" title="Today’s restaurant menus" subtitle="Only meals available for today are shown.">
          <CardLayout compact={mode === "all"} empty="No restaurant has published today’s menu yet.">
            {catalog.restaurants.map((item) => <RestaurantCard key={item.id} item={item} onClick={() => setSelected({ type: "restaurant", item })} onVerification={() => setVerification(item)} />)}
          </CardLayout>
        </VerticalSection>
      ) : null}
      {sections.includes("hotels") ? (
        <VerticalSection eyebrow="Hotels" title="Hotels and available rooms" subtitle="Browse property galleries and available room types.">
          <CardLayout compact={mode === "all"} empty="No hotels have published available rooms yet.">
            {catalog.hotels.map((item) => <HotelCard key={item.id} item={item} onClick={() => setSelected({ type: "hotel", item })} onVerification={() => setVerification(item)} />)}
          </CardLayout>
        </VerticalSection>
      ) : null}
      {sections.includes("properties") ? (
        <VerticalSection eyebrow="Property" title="Property for rent and sale" subtitle="Verified property agents can publish available homes, land, and commercial spaces.">
          <CardLayout compact={mode === "all"} empty="No verified property listings are available yet.">
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
  return <CardShell image={item.image_url || item.bannerUrl} imageAlt={item.name} onClick={onClick}><div className="flex items-center justify-between gap-3"><div className="flex flex-wrap gap-1"><span className="rounded-full bg-orange-600 px-2.5 py-1 text-[11px] font-black text-white">Restaurant</span><span className="rounded-full bg-orange-50 px-2.5 py-1 text-[11px] font-black text-orange-700">{String(item.meal_period || "all day").replace("_", " ")}</span></div><span className="text-xs font-black text-emerald-700">{money(item.price, item.currency)}</span></div><h3 className="mt-3 text-lg font-black text-gray-950">{item.name}</h3><p className="mt-1 truncate text-sm font-bold text-gray-600">{item.businessName}</p><div className="mt-2" onClick={(event) => event.stopPropagation()}><MarketplaceVerificationBadge status={item.verificationStatus} onClick={onVerification} /></div><p className="mt-3 flex items-center gap-2 text-xs font-bold text-gray-500"><Clock3 size={15} /> {item.preparation_minutes || 20} min <MapPin size={15} className="ml-2" /> {item.city || "Location available"}</p></CardShell>;
}

function HotelCard({ item, onClick, onVerification }) {
  return <CardShell image={item.images?.[0] || item.bannerUrl} imageAlt={item.businessName} onClick={onClick}><div className="flex flex-wrap gap-1"><span className="rounded-full bg-blue-600 px-2.5 py-1 text-[11px] font-black text-white">Hotel</span><span className="rounded-full bg-blue-50 px-2.5 py-1 text-[11px] font-black text-blue-700">Available rooms</span></div><h3 className="mt-3 text-lg font-black text-gray-950">{item.businessName}</h3><div className="mt-2" onClick={(event) => event.stopPropagation()}><MarketplaceVerificationBadge status={item.verificationStatus} onClick={onVerification} /></div><p className="mt-2 flex items-center gap-1.5 text-sm font-bold text-gray-500"><MapPin size={15} /> {item.city || item.address}</p><p className="mt-3 text-sm font-black text-gray-950">From {money(item.fromPrice, item.currency)} / night</p></CardShell>;
}

function PropertyCard({ item, onClick, onVerification }) {
  return <CardShell image={item.image_urls?.[0] || item.bannerUrl} imageAlt={item.title} onClick={onClick}><div className="flex items-center justify-between gap-3"><div className="flex flex-wrap gap-1"><span className="rounded-full bg-violet-700 px-2.5 py-1 text-[11px] font-black text-white">Property</span><span className="rounded-full bg-violet-50 px-2.5 py-1 text-[11px] font-black uppercase text-violet-700">For {item.purpose}</span></div><span className="text-xs font-black capitalize text-gray-500">{item.property_type}</span></div><h3 className="mt-3 text-lg font-black text-gray-950">{item.title}</h3><div className="mt-2" onClick={(event) => event.stopPropagation()}><MarketplaceVerificationBadge status={item.verificationStatus} onClick={onVerification} /></div><p className="mt-2 flex items-center gap-1.5 text-sm font-bold text-gray-500"><MapPin size={15} /> {item.city || item.address}</p><div className="mt-3 flex items-center gap-4 text-xs font-bold text-gray-500"><span className="flex items-center gap-1"><BedDouble size={15} /> {item.bedrooms}</span><span className="flex items-center gap-1"><Bath size={15} /> {item.bathrooms}</span><strong className="ml-auto text-sm text-gray-950">{money(item.price, item.currency)}{item.purpose === "rent" ? `/${item.rent_period || "month"}` : ""}</strong></div></CardShell>;
}

function VerticalBuyerDetail({ onClose, onMessage, onOpenSeller, onOrder, product, type }) {
  const isRestaurant = type === "restaurant";
  const serviceValue = isRestaurant
    ? product.deliveryAvailable && product.pickupAvailable ? "Delivery and pickup" : product.deliveryAvailable ? "Delivery available" : "Pickup available"
    : type === "hotel" ? "Request dates directly from the hotel" : "Book a property viewing";
  return (
    <ProductDetailDrawer
      product={product}
      open
      onClose={onClose}
      onMessageSeller={onMessage}
      onOpenSeller={(seller) => onOpenSeller?.({ ...seller, verticalType: type })}
      onOrderProduct={onOrder}
      onNotice={(message, tone = "success") => showToast(message, tone)}
      actionLabel={isRestaurant ? "Order" : "Book"}
      actionMode={isRestaurant ? "order" : "booking"}
      bookingStartLabel={type === "hotel" ? "Check-in" : "Viewing date"}
      bookingEndLabel="Check-out"
      bookingUsesEndDate={type === "hotel"}
      showAddToCart={false}
      showMessage={isRestaurant}
      showOrder
      showInventory={false}
      showSave={false}
      reviewLabel="Review"
      reviewHeading="Reviews"
      reviewType="marketplace"
      detailsHeading={type === "restaurant" ? "Meal Details" : type === "hotel" ? "Hotel Details" : "Property Details"}
      historyKey={`marketplace-${type}-detail`}
      messageContextLabel={type === "restaurant" ? "Meal inquiry" : type === "hotel" ? "Hotel inquiry" : "Property inquiry"}
      messageLabel="Message"
      serviceLabel={type === "restaurant" ? "Fulfilment" : type === "hotel" ? "Stay" : "Viewing"}
      serviceValue={serviceValue}
    />
  );
}

function VerticalSellerProfile({ onClose, seller }) {
  return <SellerProfileDrawer seller={seller} open={Boolean(seller)} onClose={onClose} onNotice={(message, tone = "success") => showToast(message, tone)} showSaveStore={false} />;
}

function VerticalSkeleton({ mode }) {
  return <div className="space-y-4" aria-label={`Loading ${mode} businesses`}><div className="h-8 w-48 animate-pulse rounded-xl bg-gray-200" /><div className="flex gap-3 overflow-hidden">{[1, 2, 3].map((item) => <div key={item} className="h-72 min-w-[78%] animate-pulse rounded-[24px] bg-gray-200 sm:min-w-[340px]" />)}</div></div>;
}
