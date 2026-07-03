import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Bath, BedDouble, CalendarDays, Clock3, Copy, Film, Hotel, House, LoaderCircle, MapPin, MessageCircle, MoreVertical, PackageCheck, Plus, Share2, Star, ToggleLeft, ToggleRight, Trash2, UtensilsCrossed, X } from "lucide-react";

import {
  fetchHotelWorkspace,
  fetchPropertyListings,
  fetchRestaurantMenu,
  fetchVerticalBusinessActivity,
  deleteHotelImage,
  deleteHotelVideo,
  deletePropertyListing,
  deleteRestaurantMenuItem,
  getMarketplaceBusinessDay,
  saveHotelMediaPackage,
  savePropertyListing,
  saveRestaurantMenuItem,
  subscribeVerticalBusinessActivity,
  toggleRestaurantMenuItem,
} from "../../../../Backend/services/marketplace/marketplaceVerticalService";
import { showToast } from "../../../../Backend/services/toastService";
import { createEmptyVerticalMedia } from "../../../../Backend/services/marketplace/verticalMediaValidation";
import VerticalMediaFields from "./VerticalMediaFields";
import useBodyScrollLock from "../../../shared/useBodyScrollLock";

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function notifyVerticalListingUpdated(businessId) {
  window.dispatchEvent(new CustomEvent("marketplace-vertical-listing-updated", { detail: { businessId } }));
}

function useVerticalActivity(businessId) {
  const [activity, setActivity] = useState({ reviews: 0, messages: 0, orders: 0, bookings: 0, recentBookings: [] });
  const load = useCallback(() => fetchVerticalBusinessActivity(businessId).then(setActivity).catch(() => null), [businessId]);
  useEffect(() => {
    let timer;
    const refresh = (event) => {
      if (event?.detail?.businessId && event.detail.businessId !== businessId) return;
      window.clearTimeout(timer);
      timer = window.setTimeout(load, 100);
    };
    load();
    const unsubscribe = subscribeVerticalBusinessActivity(businessId, refresh);
    window.addEventListener("marketplace-vertical-activity-updated", refresh);
    return () => {
      window.clearTimeout(timer);
      unsubscribe?.();
      window.removeEventListener("marketplace-vertical-activity-updated", refresh);
    };
  }, [businessId, load]);
  return activity;
}

export default function VerticalSellerDashboard({ business }) {
  if (!business?.id) return null;
  if (business.kind === "restaurant") return <RestaurantDashboard business={business} />;
  if (business.kind === "hotel") return <HotelDashboard business={business} />;
  if (business.kind === "property_agent") return <PropertyDashboard business={business} />;
  return null;
}

function WorkspaceShell({ children, icon: Icon, eyebrow, title, subtitle, stats = [] }) {
  return (
    <div className="space-y-6">
      <section className="overflow-hidden rounded-[28px] bg-gradient-to-br from-slate-950 via-slate-900 to-emerald-950 p-5 text-white shadow-xl">
        <div className="flex items-start gap-4"><span className="grid h-13 w-13 flex-none place-items-center rounded-2xl bg-white/10"><Icon size={24} /></span><div><p className="text-xs font-black uppercase tracking-[0.18em] text-emerald-300">{eyebrow}</p><h1 className="mt-1 text-2xl font-black">{title}</h1><p className="mt-2 text-sm font-semibold leading-6 text-slate-300">{subtitle}</p></div></div>
        <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-4">{stats.map((stat) => <div key={stat.label} className="rounded-2xl bg-white/8 p-3"><p className="text-xl font-black">{stat.value}</p><p className="mt-1 text-[11px] font-bold uppercase tracking-wide text-slate-300">{stat.label}</p></div>)}</div>
      </section>
      {children}
    </div>
  );
}

function RestaurantDashboard({ business }) {
  const today = getMarketplaceBusinessDay(business.countryIso);
  const [day, setDay] = useState(today);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const submissionLock = useRef(false);
  const [form, setForm] = useState({ name: "", description: "", price: "", meal_period: "all_day", preparation_minutes: 20, ...createEmptyVerticalMedia() });
  const activity = useVerticalActivity(business.id);
  const load = useCallback(async () => {
    setLoading(true);
    try { setItems(await fetchRestaurantMenu(business.id, day)); } catch (error) { showToast(error.message, "danger"); } finally { setLoading(false); }
  }, [business.id, day]);
  useEffect(() => { load(); }, [load]);
  useOpenVerticalEditor(() => setFormOpen(true));

  async function save(event) {
    event.preventDefault();
    if (submissionLock.current) return;
    submissionLock.current = true;
    setSubmitting(true);
    try {
      await saveRestaurantMenuItem(business.id, { ...form, day_of_week: day });
      setForm({ name: "", description: "", price: "", meal_period: "all_day", preparation_minutes: 20, ...createEmptyVerticalMedia() });
      setFormOpen(false);
      await load();
      notifyVerticalListingUpdated(business.id);
      showToast(`${DAYS[day]} menu updated.`, "success");
    } catch (error) { showToast(error.message, "danger"); } finally { submissionLock.current = false; setSubmitting(false); }
  }

  return (
    <WorkspaceShell icon={UtensilsCrossed} eyebrow="Restaurant workspace" title={business.name} subtitle="Plan each day once; buyers only see the menu scheduled for their current day." stats={[{ label: "Today", value: DAYS[today].slice(0, 3) }, { label: "Items today", value: day === today ? items.length : "—" }, { label: "Selected day", value: DAYS[day].slice(0, 3) }, { label: "Available", value: items.filter((item) => item.available).length }]}>
      <DaySelector day={day} setDay={setDay} />
      <VerticalActivityStrip activity={activity} commerceLabel="Orders" commerceValue={activity.orders} />
      <section className="rounded-[26px] border border-gray-200 bg-white p-5 shadow-sm">
        <SectionHeading eyebrow={`${DAYS[day]} menu`} title="Meals buyers will see"><PrimaryButton onClick={() => setFormOpen(true)} label="Add meal" className="bg-orange-600" /></SectionHeading>
        <div className="mt-5 grid gap-3 md:grid-cols-2">{loading ? <p className="text-sm font-bold text-gray-500">Loading menu...</p> : items.map((item) => <MealCard key={item.id} item={item} business={business} onDelete={async () => { await deleteRestaurantMenuItem(item); await load(); notifyVerticalListingUpdated(business.id); showToast("Meal deleted.", "success"); }} onToggle={async () => { await toggleRestaurantMenuItem(item, !item.available); await load(); notifyVerticalListingUpdated(business.id); }} />)}</div>
        {!loading && !items.length ? <EmptyState text={`No meals have been added for ${DAYS[day]}.`} /> : null}
      </section>
      <VerticalEditorSheet open={formOpen} onClose={() => setFormOpen(false)} title="Add meal" subtitle={`${DAYS[day]} menu`} formId="restaurant-meal-form" actionLabel="Add meal" processingLabel="Adding..." processing={submitting} accentClass="bg-orange-600">
        <RestaurantForm formId="restaurant-meal-form" form={form} setForm={setForm} onSubmit={save} />
      </VerticalEditorSheet>
    </WorkspaceShell>
  );
}

function RestaurantForm({ formId, form, setForm, onSubmit }) {
  return (
    <form id={formId} onSubmit={onSubmit} className="grid gap-3 rounded-2xl bg-orange-50 p-4 sm:grid-cols-2">
      <Input label="Meal name" value={form.name} onChange={(value) => setForm({ ...form, name: value })} /><Input label="Price" type="number" value={form.price} onChange={(value) => setForm({ ...form, price: value })} />
      <Select label="Meal period" value={form.meal_period} onChange={(value) => setForm({ ...form, meal_period: value })} options={["all_day", "breakfast", "lunch", "dinner", "drinks"]} /><Input label="Preparation minutes" type="number" value={form.preparation_minutes} onChange={(value) => setForm({ ...form, preparation_minutes: value })} />
      <TextArea label="Description" value={form.description} onChange={(value) => setForm({ ...form, description: value })} />
      <VerticalMediaFields media={form} setMedia={setForm} accent="orange" noun="meal" />
    </form>
  );
}

function HotelDashboard({ business }) {
  const [workspace, setWorkspace] = useState({ images: [], rooms: [], videoUrl: "" });
  const [formOpen, setFormOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const submissionLock = useRef(false);
  const [media, setMedia] = useState(createEmptyVerticalMedia);
  const activity = useVerticalActivity(business.id);
  const load = useCallback(async () => setWorkspace(await fetchHotelWorkspace(business.id)), [business.id]);
  useEffect(() => { load().catch((error) => showToast(error.message, "danger")); }, [load]);
  useOpenVerticalEditor(() => setFormOpen(true));

  async function save(event) {
    event.preventDefault();
    if (submissionLock.current) return;
    submissionLock.current = true;
    setSubmitting(true);
    try {
      await saveHotelMediaPackage(business.id, media);
      setMedia(createEmptyVerticalMedia());
      setFormOpen(false);
      await load();
      notifyVerticalListingUpdated(business.id);
      showToast("Hotel media published.", "success");
    } catch (error) { showToast(error.message, "danger"); } finally { submissionLock.current = false; setSubmitting(false); }
  }

  return (
    <WorkspaceShell icon={Hotel} eyebrow="Hotel workspace" title={business.name} subtitle="Publish a complete hotel gallery and short video for guests." stats={[{ label: "Photos", value: workspace.images.length }, { label: "Video", value: workspace.videoUrl ? "Ready" : "Missing" }, { label: "Room types", value: workspace.rooms.length }, { label: "Available rooms", value: workspace.rooms.reduce((sum, item) => sum + Number(item.rooms_available || 0), 0) }]}>
      <VerticalActivityStrip activity={activity} commerceLabel="Bookings" commerceValue={activity.bookings} />
      <section className="rounded-[26px] border border-gray-200 bg-white p-5 shadow-sm">
        <SectionHeading eyebrow="Hotel profile" title="Hotel images and video"><PrimaryButton onClick={() => setFormOpen(true)} label="Add hotel" className="bg-blue-600" /></SectionHeading>
        <div className="mt-4 flex gap-3 overflow-x-auto pb-24">{workspace.images.map((image) => <div key={image.id} className="relative min-w-[240px]"><img src={image.image_url} alt={image.caption || "Hotel"} className="h-40 w-full rounded-2xl object-cover" /><div className="absolute right-2 top-2"><SellerItemActions label={image.caption || "Hotel image"} shareUrl={image.image_url} onDelete={async () => { await deleteHotelImage(image); await load(); notifyVerticalListingUpdated(business.id); showToast("Hotel image deleted.", "success"); }} /></div></div>)}{!workspace.images.length ? <EmptyState text="Add the hotel cover and five gallery images." /> : null}</div>
        {workspace.videoUrl ? <div className="relative mt-4"><video src={workspace.videoUrl} controls preload="metadata" className="max-h-72 w-full rounded-2xl bg-black" /><div className="absolute right-3 top-3"><SellerItemActions label={`${business.name} hotel video`} shareUrl={workspace.videoUrl} onDelete={async () => { await deleteHotelVideo(business.id, workspace.videoUrl); await load(); notifyVerticalListingUpdated(business.id); showToast("Hotel video deleted.", "success"); }} /></div></div> : null}
      </section>
      <BookingRequests bookings={activity.recentBookings} />
      <VerticalEditorSheet open={formOpen} onClose={() => setFormOpen(false)} title="Add hotel" subtitle="Hotel gallery and video" formId="hotel-media-form" actionLabel="Add hotel" processingLabel="Adding..." processing={submitting} accentClass="bg-blue-600">
        <form id="hotel-media-form" onSubmit={save} className="grid gap-3 rounded-2xl bg-blue-50 p-4"><p className="text-sm font-semibold leading-6 text-blue-950">Add one cover image, at least five extra images, and one video up to 30 seconds and less than 50 MB.</p><VerticalMediaFields media={media} setMedia={setMedia} accent="blue" noun="hotel" /></form>
      </VerticalEditorSheet>
    </WorkspaceShell>
  );
}

function PropertyDashboard({ business }) {
  const [listings, setListings] = useState([]);
  const [formOpen, setFormOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const submissionLock = useRef(false);
  const [form, setForm] = useState({ title: "", description: "", purpose: "rent", property_type: "house", price: "", rent_period: "month", bedrooms: 0, bathrooms: 0, furnished: false, address: "", city: business.location || "", amenitiesText: "", published: true, ...createEmptyVerticalMedia() });
  const activity = useVerticalActivity(business.id);
  const load = useCallback(async () => setListings(await fetchPropertyListings(business.id)), [business.id]);
  useEffect(() => { load().catch((error) => showToast(error.message, "danger")); }, [load]);
  useOpenVerticalEditor(() => setFormOpen(true));
  const counts = useMemo(() => ({ available: listings.filter((item) => item.availability_status === "available").length, published: listings.filter((item) => item.published).length }), [listings]);

  async function save(event) {
    event.preventDefault();
    if (submissionLock.current) return;
    submissionLock.current = true;
    setSubmitting(true);
    try {
      await savePropertyListing(business.id, form);
      setForm((current) => ({ ...current, title: "", description: "", price: "", address: "", published: true, ...createEmptyVerticalMedia() }));
      setFormOpen(false);
      await load();
      notifyVerticalListingUpdated(business.id);
      showToast("Property published for buyers.", "success");
    } catch (error) { showToast(error.message, "danger"); } finally { submissionLock.current = false; setSubmitting(false); }
  }

  return (
    <WorkspaceShell icon={House} eyebrow="Property Agent workspace" title={business.name} subtitle="Publish authorised property for rent or sale." stats={[{ label: "Listings", value: listings.length }, { label: "Available", value: counts.available }, { label: "Published", value: counts.published }, { label: "Awaiting proof", value: listings.filter((item) => item.authorization_status === "pending").length }]}>
      <VerticalActivityStrip activity={activity} commerceLabel="Bookings" commerceValue={activity.bookings} />
      <section className="rounded-[26px] border border-gray-200 bg-white p-5 shadow-sm">
        <SectionHeading eyebrow="Property desk" title="Properties and enquiries"><PrimaryButton onClick={() => setFormOpen(true)} label="Add property" className="bg-violet-700" /></SectionHeading>
        <div className="mt-5 grid gap-4 md:grid-cols-2">{listings.map((item) => <PropertyListingCard key={item.id} item={item} business={business} onDelete={async () => { await deletePropertyListing(item); await load(); notifyVerticalListingUpdated(business.id); showToast("Property deleted.", "success"); }} />)}</div>
        {!listings.length ? <EmptyState text="Add the first authorised property listing." /> : null}
      </section>
      <BookingRequests bookings={activity.recentBookings} />
      <VerticalEditorSheet open={formOpen} onClose={() => setFormOpen(false)} title="Add property" subtitle="Property listing" formId="property-listing-form" actionLabel="Add property" processingLabel="Adding..." processing={submitting} accentClass="bg-violet-700">
        <PropertyForm formId="property-listing-form" form={form} setForm={setForm} onSubmit={save} />
      </VerticalEditorSheet>
    </WorkspaceShell>
  );
}

function PropertyForm({ formId, form, setForm, onSubmit }) {
  return (
    <form id={formId} onSubmit={onSubmit} className="grid gap-3 rounded-2xl bg-violet-50 p-4 sm:grid-cols-2">
      <Input label="Property title" value={form.title} onChange={(value) => setForm({ ...form, title: value })} /><Input label="Price" type="number" value={form.price} onChange={(value) => setForm({ ...form, price: value })} />
      <Select label="Purpose" value={form.purpose} onChange={(value) => setForm({ ...form, purpose: value })} options={["rent", "sale"]} /><Select label="Property type" value={form.property_type} onChange={(value) => setForm({ ...form, property_type: value })} options={["house", "apartment", "land", "commercial"]} />
      <Input label="Bedrooms" type="number" value={form.bedrooms} onChange={(value) => setForm({ ...form, bedrooms: value })} /><Input label="Bathrooms" type="number" value={form.bathrooms} onChange={(value) => setForm({ ...form, bathrooms: value })} />
      <Input label="Address" value={form.address} onChange={(value) => setForm({ ...form, address: value })} /><Input label="City/area" value={form.city} onChange={(value) => setForm({ ...form, city: value })} />
      <TextArea label="Description" value={form.description} onChange={(value) => setForm({ ...form, description: value })} />
      <VerticalMediaFields media={form} setMedia={setForm} accent="violet" noun="property" />
      <label className="flex items-center gap-2 rounded-xl border border-violet-100 bg-white p-3 text-sm font-black sm:col-span-2"><input type="checkbox" checked={form.published} onChange={(event) => setForm({ ...form, published: event.target.checked })} /> Publish to the buyer marketplace</label>
    </form>
  );
}

function VerticalEditorSheet({ accentClass, actionLabel, children, formId, onClose, open, processing, processingLabel, subtitle, title }) {
  useBodyScrollLock(open);
  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 z-[1200] flex items-end" role="presentation">
      <button type="button" aria-label={`Close ${title}`} disabled={processing} onClick={onClose} className="absolute inset-0 bg-slate-950/55 backdrop-blur-[2px] disabled:cursor-wait" />
      <section role="dialog" aria-modal="true" aria-labelledby={`${formId}-title`} className="relative z-10 flex h-[68dvh] min-h-[420px] w-full flex-col overflow-hidden rounded-t-[30px] bg-white shadow-2xl">
        <header className="flex shrink-0 items-center gap-3 border-b border-gray-200 bg-white px-4 py-3 sm:px-6">
          <button type="button" onClick={onClose} disabled={processing} className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-gray-100 text-gray-700 disabled:opacity-40" aria-label={`Close ${title}`}><X size={19} /></button>
          <div className="min-w-0 flex-1"><p className="truncate text-xs font-black uppercase tracking-wide text-emerald-700">{subtitle}</p><h2 id={`${formId}-title`} className="truncate text-lg font-black text-gray-950">{title}</h2></div>
          <button type="submit" form={formId} disabled={processing} className={`inline-flex h-10 shrink-0 items-center gap-2 rounded-xl px-4 text-sm font-black text-white shadow-sm disabled:cursor-wait disabled:opacity-70 ${accentClass}`}>
            {processing ? <LoaderCircle size={16} className="animate-spin" /> : <Plus size={16} />}
            {processing ? processingLabel : actionLabel}
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4 pb-[calc(env(safe-area-inset-bottom)+1.5rem)] sm:p-6">{children}</div>
      </section>
    </div>,
    document.body,
  );
}

function VerticalActivityStrip({ activity, commerceLabel, commerceValue }) {
  const items = [
    { label: "Reviews", value: activity.reviews, icon: Star, tone: "bg-amber-50 text-amber-700" },
    { label: "Messages", value: activity.messages, icon: MessageCircle, tone: "bg-sky-50 text-sky-700" },
    { label: commerceLabel, value: commerceValue, icon: PackageCheck, tone: "bg-emerald-50 text-emerald-700" },
  ];
  return <section className="grid grid-cols-3 gap-2 rounded-[24px] border border-gray-200 bg-white p-3 shadow-sm">{items.map(({ icon: Icon, label, tone, value }) => <div key={label} className="flex min-w-0 items-center gap-2 rounded-2xl bg-gray-50 p-3"><span className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl ${tone}`}><Icon size={17} /></span><div className="min-w-0"><p className="text-lg font-black text-gray-950">{value}</p><p className="truncate text-[10px] font-black uppercase tracking-wide text-gray-500">{label}</p></div></div>)}</section>;
}

function BookingRequests({ bookings = [] }) {
  if (!bookings.length) return null;
  return <section className="rounded-[26px] border border-gray-200 bg-white p-5 shadow-sm"><SectionHeading eyebrow="Buyer activity" title="Recent booking requests" /><div className="mt-4 grid gap-3 md:grid-cols-2">{bookings.map((booking) => <article key={booking.id} className="rounded-2xl border border-gray-200 bg-gray-50 p-4"><div className="flex items-start justify-between gap-3"><div><h3 className="font-black text-gray-950">{booking.listing_name || "Booking request"}</h3><p className="mt-1 text-sm font-bold text-gray-600">{booking.buyer_name} · {booking.phone}</p></div><span className="rounded-full bg-amber-100 px-2.5 py-1 text-[10px] font-black uppercase text-amber-800">{booking.status}</span></div><p className="mt-3 flex items-center gap-2 text-xs font-black text-gray-600"><CalendarDays size={15} /> {booking.start_date}{booking.end_date ? ` to ${booking.end_date}` : ""}</p>{booking.note ? <p className="mt-2 text-sm font-semibold leading-5 text-gray-500">{booking.note}</p> : null}</article>)}</div></section>;
}

function useOpenVerticalEditor(open) {
  useEffect(() => { window.addEventListener("marketplace-open-vertical-editor", open); return () => window.removeEventListener("marketplace-open-vertical-editor", open); }, [open]);
}
function DaySelector({ day, setDay }) { return <div className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">{DAYS.map((label, index) => <button key={label} type="button" onClick={() => setDay(index)} className={`min-w-[92px] rounded-2xl border px-3 py-3 text-sm font-black ${day === index ? "border-orange-600 bg-orange-600 text-white" : "border-gray-200 bg-white text-gray-600"}`}>{label.slice(0, 3)}</button>)}</div>; }
function SectionHeading({ children, eyebrow, title }) { return <div className="flex items-center justify-between gap-3"><div><p className="text-xs font-black uppercase tracking-wide text-emerald-700">{eyebrow}</p><h2 className="mt-1 text-xl font-black text-gray-950">{title}</h2></div>{children}</div>; }
function PrimaryButton({ className, label, onClick }) { return <button type="button" onClick={onClick} className={`flex h-11 shrink-0 items-center gap-2 rounded-2xl px-4 text-sm font-black text-white ${className}`}><Plus size={18} /> {label}</button>; }
function MealCard({ business, item, onDelete, onToggle }) {
  const gallery = item.image_urls || [];
  return <article className="rounded-2xl border border-gray-200 p-3"><div className="flex gap-3">{item.image_url ? <img src={item.image_url} alt="" className="h-20 w-20 rounded-xl object-cover" /> : <span className="grid h-20 w-20 place-items-center rounded-xl bg-orange-50 text-orange-600"><UtensilsCrossed /></span>}<div className="min-w-0 flex-1"><div className="flex items-start justify-between gap-2"><div className="min-w-0"><h3 className="truncate font-black text-gray-950">{item.name}</h3><p className="mt-1 text-sm font-black text-gray-800">{business.currency} {Number(item.price).toLocaleString()}</p><p className="mt-2 flex items-center gap-1 text-xs font-bold text-gray-500"><Clock3 size={14} /> {item.preparation_minutes} minutes</p></div><div className="flex shrink-0 flex-col items-center gap-2"><SellerItemActions label={item.name} shareUrl={buildShareUrl("meal", item.id)} onDelete={onDelete} /><button type="button" onClick={onToggle} className={item.available ? "text-emerald-600" : "text-gray-400"} aria-label={item.available ? `Hide ${item.name}` : `Show ${item.name}`}>{item.available ? <ToggleRight /> : <ToggleLeft />}</button></div></div></div></div>{gallery.length || item.video_url ? <div className="mt-3 flex gap-2 overflow-x-auto border-t border-gray-100 pt-3">{gallery.slice(0, 5).map((image, index) => <img key={`${image}-${index}`} src={image} alt="" className="h-12 w-12 shrink-0 rounded-lg object-cover" />)}{item.video_url ? <div className="flex h-12 min-w-24 shrink-0 items-center justify-center gap-1 rounded-lg bg-slate-950 px-2 text-xs font-black text-white"><Film size={15} /> Video</div> : null}</div> : null}</article>;
}

function PropertyListingCard({ business, item, onDelete }) {
  return <article className="rounded-2xl border border-gray-200 bg-white">{item.image_urls?.[0] ? <img src={item.image_urls[0]} alt="" className="h-44 w-full rounded-t-2xl object-cover" /> : <div className="grid h-44 place-items-center rounded-t-2xl bg-violet-50 text-violet-600"><House size={36} /></div>}<div className="p-4"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><span className="rounded-full bg-violet-50 px-2 py-1 text-[11px] font-black uppercase text-violet-700">For {item.purpose}</span><h3 className="mt-3 truncate text-lg font-black">{item.title}</h3></div><SellerItemActions label={item.title} shareUrl={buildShareUrl("property", item.id)} onDelete={onDelete} /></div><p className="mt-1 flex items-center gap-1 text-sm font-bold text-gray-500"><MapPin size={15} /> {item.address}</p><div className="mt-3 flex gap-3 text-xs font-bold text-gray-500"><span className="flex gap-1"><BedDouble size={15} /> {item.bedrooms}</span><span className="flex gap-1"><Bath size={15} /> {item.bathrooms}</span><strong className="ml-auto text-gray-950">{business.currency} {Number(item.price).toLocaleString()}</strong></div><div className="mt-3 flex flex-wrap items-center gap-2 text-xs font-black text-gray-500"><span className="capitalize">{item.authorization_status}</span><span>·</span><span>{item.image_urls?.length || 0} images</span>{item.video_url ? <><span>·</span><span className="flex items-center gap-1"><Film size={13} /> Video</span></> : null}</div></div></article>;
}

function buildShareUrl(type, id) { if (typeof window === "undefined") return ""; return `${window.location.origin}${window.location.pathname}#urmall-${type}-${id}`; }

function SellerItemActions({ label, onDelete, shareUrl }) {
  const [open, setOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function copyLink() {
    try { await navigator.clipboard.writeText(shareUrl); showToast("Link copied.", "success"); } catch { showToast("Unable to copy this link.", "danger"); }
    setOpen(false);
  }

  async function share() {
    try {
      if (navigator.share) await navigator.share({ title: label, text: `View ${label} on UrMall`, url: shareUrl });
      else await navigator.clipboard.writeText(shareUrl);
      showToast(navigator.share ? "Shared successfully." : "Link copied for sharing.", "success");
    } catch (error) { if (error?.name !== "AbortError") showToast("Unable to share this item.", "danger"); }
    setOpen(false);
  }

  async function remove() {
    setDeleting(true);
    try { await onDelete?.(); setOpen(false); setConfirmDelete(false); } catch (error) { showToast(error.message || "Unable to delete this item.", "danger"); } finally { setDeleting(false); }
  }

  return <div className="relative z-20">{open ? <button type="button" aria-label="Close item actions" onClick={() => { setOpen(false); setConfirmDelete(false); }} className="fixed inset-0 z-30 cursor-default bg-transparent" /> : null}<button type="button" onClick={() => setOpen((value) => !value)} className="relative z-40 grid h-9 w-9 place-items-center rounded-xl border border-gray-200 bg-white/95 text-gray-700 shadow-sm hover:bg-gray-50" aria-label={`Actions for ${label}`}><MoreVertical size={18} /></button>{open ? <div className="absolute right-0 top-11 z-50 w-52 rounded-2xl border border-gray-200 bg-white p-2 shadow-2xl"><button type="button" onClick={copyLink} className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-black text-gray-700 hover:bg-gray-50"><Copy size={17} /> Copy link</button><button type="button" onClick={share} className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-black text-gray-700 hover:bg-gray-50"><Share2 size={17} /> Share</button>{confirmDelete ? <div className="mt-1 rounded-xl bg-red-50 p-2"><p className="text-xs font-bold text-red-700">Delete permanently?</p><div className="mt-2 grid grid-cols-2 gap-2"><button type="button" onClick={() => setConfirmDelete(false)} className="rounded-lg bg-white px-2 py-2 text-xs font-black text-gray-700">Cancel</button><button type="button" disabled={deleting} onClick={remove} className="rounded-lg bg-red-600 px-2 py-2 text-xs font-black text-white disabled:opacity-60">{deleting ? "Deleting..." : "Delete"}</button></div></div> : <button type="button" onClick={() => setConfirmDelete(true)} className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-black text-red-600 hover:bg-red-50"><Trash2 size={17} /> Delete</button>}</div> : null}</div>;
}
function Input({ label, onChange, type = "text", value }) { return <label><span className="text-xs font-black text-gray-600">{label}</span><input required type={type} value={value} onChange={(event) => onChange(event.target.value)} className="mt-1 h-11 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm font-bold outline-none focus:border-emerald-400" /></label>; }
function Select({ label, onChange, options, value }) { return <label><span className="text-xs font-black text-gray-600">{label}</span><select value={value} onChange={(event) => onChange(event.target.value)} className="mt-1 h-11 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm font-bold outline-none">{options.map((option) => <option key={option} value={option}>{option.replaceAll("_", " ")}</option>)}</select></label>; }
function TextArea({ label, onChange, value }) { return <label className="sm:col-span-2"><span className="text-xs font-black text-gray-600">{label}</span><textarea required value={value} onChange={(event) => onChange(event.target.value)} className="mt-1 min-h-24 w-full rounded-xl border border-gray-200 bg-white p-3 text-sm outline-none" /></label>; }
function EmptyState({ text }) { return <div className="mt-5 rounded-2xl border border-dashed border-gray-300 bg-gray-50 p-6 text-center"><CalendarDays className="mx-auto text-gray-400" /><p className="mt-2 text-sm font-bold text-gray-500">{text}</p></div>; }
