import { useEffect, useMemo, useState } from "react";
import { Bath, BedDouble, Clock3, Hotel, House, MapPin, Phone, Users, UtensilsCrossed, X } from "lucide-react";

import { fetchMarketplaceVerticalDiscovery } from "../../Backend/services/marketplace/marketplaceVerticalService";
import AppPortal from "../shared/AppPortal";
import useBodyScrollLock from "../shared/useBodyScrollLock";

const EMPTY = { restaurants: [], hotels: [], properties: [] };

function money(value, currency = "") {
  return `${currency ? `${currency} ` : ""}${Number(value || 0).toLocaleString()}`;
}

export default function VerticalMarketplace({ mode = "all", onDetailChange }) {
  const [catalog, setCatalog] = useState(EMPTY);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState(null);
  useBodyScrollLock(Boolean(selected));

  useEffect(() => {
    let active = true;
    fetchMarketplaceVerticalDiscovery()
      .then((data) => {
        if (active) setCatalog(data);
      })
      .catch((nextError) => {
        if (active) setError(nextError.message || "Unable to load these UrMall businesses.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, []);

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

  if (loading) return <VerticalSkeleton mode={mode} />;

  return (
    <div className="space-y-8">
      {error ? <p className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm font-bold text-amber-800">{error}</p> : null}
      {sections.includes("restaurants") ? (
        <VerticalSection eyebrow="Food" title={mode === "all" ? "Eat today" : "Today’s restaurant menus"} subtitle="Only meals available for today are shown.">
          <CardLayout compact={mode === "all"} empty="No restaurant has published today’s menu yet.">
            {catalog.restaurants.map((item) => <RestaurantCard key={item.id} item={item} onClick={() => setSelected({ type: "restaurant", item })} />)}
          </CardLayout>
        </VerticalSection>
      ) : null}
      {sections.includes("hotels") ? (
        <VerticalSection eyebrow="Hotels" title={mode === "all" ? "Places to stay" : "Hotels and available rooms"} subtitle="Browse property galleries and available room types.">
          <CardLayout compact={mode === "all"} empty="No hotels have published available rooms yet.">
            {catalog.hotels.map((item) => <HotelCard key={item.id} item={item} onClick={() => setSelected({ type: "hotel", item })} />)}
          </CardLayout>
        </VerticalSection>
      ) : null}
      {sections.includes("properties") ? (
        <VerticalSection eyebrow="Property" title={mode === "all" ? "Properties near you" : "Property for rent and sale"} subtitle="Verified property agents can publish available homes, land, and commercial spaces.">
          <CardLayout compact={mode === "all"} empty="No verified property listings are available yet.">
            {catalog.properties.map((item) => <PropertyCard key={item.id} item={item} onClick={() => setSelected({ type: "property", item })} />)}
          </CardLayout>
        </VerticalSection>
      ) : null}

      {selected ? <VerticalDetail selection={selected} onClose={() => setSelected(null)} /> : null}
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
  return <button type="button" onClick={onClick} className="snap-start overflow-hidden rounded-[24px] border border-gray-200 bg-white text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"><div className="h-44 bg-gradient-to-br from-emerald-100 to-slate-100">{image ? <img src={image} alt={imageAlt} className="h-full w-full object-cover" /> : null}</div><div className="p-4">{children}</div></button>;
}

function RestaurantCard({ item, onClick }) {
  return <CardShell image={item.image_url || item.bannerUrl} imageAlt={item.name} onClick={onClick}><div className="flex items-center justify-between gap-3"><span className="rounded-full bg-orange-50 px-2.5 py-1 text-[11px] font-black text-orange-700">{String(item.meal_period || "all day").replace("_", " ")}</span><span className="text-xs font-black text-emerald-700">{money(item.price, item.currency)}</span></div><h3 className="mt-3 text-lg font-black text-gray-950">{item.name}</h3><p className="mt-1 truncate text-sm font-bold text-gray-600">{item.businessName}</p><p className="mt-3 flex items-center gap-2 text-xs font-bold text-gray-500"><Clock3 size={15} /> {item.preparation_minutes || 20} min <MapPin size={15} className="ml-2" /> {item.city || "Location available"}</p></CardShell>;
}

function HotelCard({ item, onClick }) {
  return <CardShell image={item.images?.[0] || item.bannerUrl} imageAlt={item.businessName} onClick={onClick}><span className="rounded-full bg-blue-50 px-2.5 py-1 text-[11px] font-black text-blue-700">Available rooms</span><h3 className="mt-3 text-lg font-black text-gray-950">{item.businessName}</h3><p className="mt-1 flex items-center gap-1.5 text-sm font-bold text-gray-500"><MapPin size={15} /> {item.city || item.address}</p><p className="mt-3 text-sm font-black text-gray-950">From {money(item.fromPrice, item.currency)} / night</p></CardShell>;
}

function PropertyCard({ item, onClick }) {
  return <CardShell image={item.image_urls?.[0] || item.bannerUrl} imageAlt={item.title} onClick={onClick}><div className="flex items-center justify-between gap-3"><span className="rounded-full bg-violet-50 px-2.5 py-1 text-[11px] font-black uppercase text-violet-700">For {item.purpose}</span><span className="text-xs font-black capitalize text-gray-500">{item.property_type}</span></div><h3 className="mt-3 text-lg font-black text-gray-950">{item.title}</h3><p className="mt-1 flex items-center gap-1.5 text-sm font-bold text-gray-500"><MapPin size={15} /> {item.city || item.address}</p><div className="mt-3 flex items-center gap-4 text-xs font-bold text-gray-500"><span className="flex items-center gap-1"><BedDouble size={15} /> {item.bedrooms}</span><span className="flex items-center gap-1"><Bath size={15} /> {item.bathrooms}</span><strong className="ml-auto text-sm text-gray-950">{money(item.price, item.currency)}{item.purpose === "rent" ? `/${item.rent_period || "month"}` : ""}</strong></div></CardShell>;
}

function VerticalDetail({ selection, onClose }) {
  const { item, type } = selection;
  const images = type === "hotel" ? item.images : type === "property" ? item.image_urls : [item.image_url || item.bannerUrl].filter(Boolean);
  return <AppPortal><section className="fixed inset-0 z-[1300] flex h-dvh flex-col bg-gray-50"><header className="kt-header-glass flex h-16 shrink-0 items-center justify-between px-4"><div><p className="text-xs font-black uppercase tracking-[0.16em] text-emerald-700">UrMall {type}</p><h2 className="text-lg font-black text-gray-950">{item.businessName || item.title || item.name}</h2></div><button type="button" onClick={onClose} className="grid h-11 w-11 place-items-center rounded-full bg-gray-100 text-gray-700" aria-label="Close"><X size={20} /></button></header><div className="min-h-0 flex-1 overflow-y-auto pb-28"><div className="flex snap-x overflow-x-auto bg-slate-200">{images?.length ? images.map((image) => <img key={image} src={image} alt="" className="h-72 w-full flex-none snap-center object-cover" />) : <div className="grid h-72 w-full place-items-center text-gray-500">{type === "hotel" ? <Hotel size={48} /> : type === "property" ? <House size={48} /> : <UtensilsCrossed size={48} />}</div>}</div><div className="space-y-5 p-5"><div><h1 className="text-3xl font-black text-gray-950">{item.title || item.name || item.businessName}</h1><p className="mt-2 text-base font-semibold leading-7 text-gray-600">{item.description || "Contact this verified UrMall business for more information."}</p></div>{type === "hotel" ? <div className="grid gap-3">{item.rooms.map((room) => <div key={room.id} className="rounded-2xl border border-gray-200 bg-white p-4"><h3 className="font-black text-gray-950">{room.name}</h3><p className="mt-1 text-sm font-semibold text-gray-500">{room.description}</p><p className="mt-3 flex items-center justify-between text-sm font-black"><span className="flex items-center gap-1"><Users size={16} /> {room.capacity} guests</span><span>{money(room.nightly_rate, item.currency)} / night</span></p></div>)}</div> : null}<div className="rounded-2xl border border-gray-200 bg-white p-4"><p className="flex items-center gap-2 text-sm font-bold text-gray-600"><MapPin size={17} /> {item.address || item.city || "Location available from the business"}</p><p className="mt-3 text-sm font-bold text-gray-600">Managed by {item.businessName}</p></div></div></div><div className="fixed inset-x-0 bottom-0 z-10 border-t border-gray-200 bg-white/95 p-4 backdrop-blur"><a href={item.phone ? `tel:${item.phone}` : undefined} aria-disabled={!item.phone} className={`flex h-13 items-center justify-center gap-2 rounded-2xl py-4 text-sm font-black ${item.phone ? "bg-emerald-700 text-white" : "bg-gray-200 text-gray-500"}`}><Phone size={18} /> Contact business</a></div></section></AppPortal>;
}

function VerticalSkeleton({ mode }) {
  return <div className="space-y-4" aria-label={`Loading ${mode} businesses`}><div className="h-8 w-48 animate-pulse rounded-xl bg-gray-200" /><div className="flex gap-3 overflow-hidden">{[1, 2, 3].map((item) => <div key={item} className="h-72 min-w-[78%] animate-pulse rounded-[24px] bg-gray-200 sm:min-w-[340px]" />)}</div></div>;
}
