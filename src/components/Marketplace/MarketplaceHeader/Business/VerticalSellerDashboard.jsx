import { useCallback, useEffect, useMemo, useState } from "react";
import { Bath, BedDouble, CalendarDays, Camera, Clock3, Hotel, House, ImagePlus, MapPin, Plus, ToggleLeft, ToggleRight, UtensilsCrossed } from "lucide-react";

import {
  addHotelImage,
  fetchHotelWorkspace,
  fetchPropertyListings,
  fetchRestaurantMenu,
  saveHotelRoom,
  savePropertyListing,
  saveRestaurantMenuItem,
  toggleRestaurantMenuItem,
  getMarketplaceBusinessDay,
} from "../../../../Backend/services/marketplace/marketplaceVerticalService";
import { showToast } from "../../../../Backend/services/toastService";

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export default function VerticalSellerDashboard({ business }) {
  if (!business?.id) return null;
  if (business.kind === "restaurant") return <RestaurantDashboard business={business} />;
  if (business.kind === "hotel") return <HotelDashboard business={business} />;
  if (business.kind === "property_agent") return <PropertyDashboard business={business} />;
  return null;
}

function WorkspaceShell({ children, icon: Icon, eyebrow, title, subtitle, stats = [] }) {
  return <div className="space-y-6"><section className="overflow-hidden rounded-[28px] bg-gradient-to-br from-slate-950 via-slate-900 to-emerald-950 p-5 text-white shadow-xl"><div className="flex items-start gap-4"><span className="grid h-13 w-13 flex-none place-items-center rounded-2xl bg-white/10"><Icon size={24} /></span><div><p className="text-xs font-black uppercase tracking-[0.18em] text-emerald-300">{eyebrow}</p><h1 className="mt-1 text-2xl font-black">{title}</h1><p className="mt-2 text-sm font-semibold leading-6 text-slate-300">{subtitle}</p></div></div><div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-4">{stats.map((stat) => <div key={stat.label} className="rounded-2xl bg-white/8 p-3"><p className="text-xl font-black">{stat.value}</p><p className="mt-1 text-[11px] font-bold uppercase tracking-wide text-slate-300">{stat.label}</p></div>)}</div></section>{children}</div>;
}

function RestaurantDashboard({ business }) {
  const today = getMarketplaceBusinessDay(business.countryIso);
  const [day, setDay] = useState(today);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState({ name: "", description: "", price: "", meal_period: "all_day", preparation_minutes: 20, imageFile: null });

  const load = useCallback(async () => {
    setLoading(true);
    try { setItems(await fetchRestaurantMenu(business.id, day)); }
    catch (error) { showToast(error.message, "danger"); }
    finally { setLoading(false); }
  }, [business.id, day]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const open = () => setFormOpen(true);
    window.addEventListener("marketplace-open-vertical-editor", open);
    return () => window.removeEventListener("marketplace-open-vertical-editor", open);
  }, []);

  async function save(event) {
    event.preventDefault();
    try {
      await saveRestaurantMenuItem(business.id, { ...form, day_of_week: day });
      setForm({ name: "", description: "", price: "", meal_period: "all_day", preparation_minutes: 20, imageFile: null });
      setFormOpen(false);
      await load();
      showToast(`${DAYS[day]} menu updated.`, "success");
    } catch (error) { showToast(error.message, "danger"); }
  }

  return <WorkspaceShell icon={UtensilsCrossed} eyebrow="Restaurant workspace" title={business.name} subtitle="Plan each day once; buyers only see the menu scheduled for their current day." stats={[{ label: "Today", value: DAYS[today].slice(0, 3) }, { label: "Items today", value: day === today ? items.length : "—" }, { label: "Selected day", value: DAYS[day].slice(0, 3) }, { label: "Available", value: items.filter((item) => item.available).length }]}><DaySelector day={day} setDay={setDay} /><section className="rounded-[26px] border border-gray-200 bg-white p-5 shadow-sm"><div className="flex items-center justify-between gap-3"><div><p className="text-xs font-black uppercase tracking-wide text-orange-700">{DAYS[day]} menu</p><h2 className="mt-1 text-xl font-black text-gray-950">Meals buyers will see</h2></div><button type="button" onClick={() => setFormOpen((value) => !value)} className="flex h-11 items-center gap-2 rounded-2xl bg-orange-600 px-4 text-sm font-black text-white"><Plus size={18} /> Add meal</button></div>{formOpen ? <RestaurantForm form={form} setForm={setForm} onSubmit={save} /> : null}<div className="mt-5 grid gap-3 md:grid-cols-2">{loading ? <p className="text-sm font-bold text-gray-500">Loading menu...</p> : items.map((item) => <div key={item.id} className="flex gap-3 rounded-2xl border border-gray-200 p-3">{item.image_url ? <img src={item.image_url} alt="" className="h-20 w-20 rounded-xl object-cover" /> : <span className="grid h-20 w-20 place-items-center rounded-xl bg-orange-50 text-orange-600"><UtensilsCrossed /></span>}<div className="min-w-0 flex-1"><div className="flex items-start justify-between gap-2"><h3 className="truncate font-black text-gray-950">{item.name}</h3><button type="button" onClick={async () => { await toggleRestaurantMenuItem(item, !item.available); await load(); }} className={item.available ? "text-emerald-600" : "text-gray-400"}>{item.available ? <ToggleRight /> : <ToggleLeft />}</button></div><p className="mt-1 text-sm font-black text-gray-800">{business.currency} {Number(item.price).toLocaleString()}</p><p className="mt-2 flex items-center gap-1 text-xs font-bold text-gray-500"><Clock3 size={14} /> {item.preparation_minutes} minutes</p></div></div>)}</div>{!loading && !items.length ? <EmptyState text={`No meals have been added for ${DAYS[day]}.`} /> : null}</section></WorkspaceShell>;
}

function DaySelector({ day, setDay }) {
  return <div className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">{DAYS.map((label, index) => <button key={label} type="button" onClick={() => setDay(index)} className={`min-w-[92px] rounded-2xl border px-3 py-3 text-sm font-black ${day === index ? "border-orange-600 bg-orange-600 text-white" : "border-gray-200 bg-white text-gray-600"}`}>{label.slice(0, 3)}</button>)}</div>;
}

function RestaurantForm({ form, setForm, onSubmit }) {
  return <form onSubmit={onSubmit} className="mt-5 grid gap-3 rounded-2xl bg-orange-50 p-4 sm:grid-cols-2"><Input label="Meal name" value={form.name} onChange={(value) => setForm({ ...form, name: value })} /><Input label="Price" type="number" value={form.price} onChange={(value) => setForm({ ...form, price: value })} /><Select label="Meal period" value={form.meal_period} onChange={(value) => setForm({ ...form, meal_period: value })} options={["all_day", "breakfast", "lunch", "dinner", "drinks"]} /><Input label="Preparation minutes" type="number" value={form.preparation_minutes} onChange={(value) => setForm({ ...form, preparation_minutes: value })} /><label className="sm:col-span-2"><span className="text-xs font-black text-gray-600">Description</span><textarea value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} className="mt-1 w-full rounded-xl border border-orange-100 p-3 text-sm outline-none" /></label><FileField label="Meal image" onChange={(file) => setForm({ ...form, imageFile: file })} /><button className="h-11 self-end rounded-xl bg-orange-600 text-sm font-black text-white">Save menu item</button></form>;
}

function HotelDashboard({ business }) {
  const [workspace, setWorkspace] = useState({ images: [], rooms: [] });
  const [formOpen, setFormOpen] = useState(false);
  const [room, setRoom] = useState({ name: "", description: "", nightly_rate: "", capacity: 1, rooms_available: 1, amenitiesText: "", imageFile: null });
  const load = useCallback(async () => setWorkspace(await fetchHotelWorkspace(business.id)), [business.id]);
  useEffect(() => { load().catch((error) => showToast(error.message, "danger")); }, [load]);
  useEffect(() => { const open = () => setFormOpen(true); window.addEventListener("marketplace-open-vertical-editor", open); return () => window.removeEventListener("marketplace-open-vertical-editor", open); }, []);
  return <WorkspaceShell icon={Hotel} eyebrow="Hotel workspace" title={business.name} subtitle="Manage the hotel gallery, room types, rates, capacity, and live availability." stats={[{ label: "Photos", value: workspace.images.length }, { label: "Room types", value: workspace.rooms.length }, { label: "Available rooms", value: workspace.rooms.reduce((sum, item) => sum + Number(item.rooms_available || 0), 0) }, { label: "Starting rate", value: workspace.rooms.length ? `${business.currency} ${Math.min(...workspace.rooms.map((item) => Number(item.nightly_rate || 0))).toLocaleString()}` : "—" }]}><section className="rounded-[26px] border border-gray-200 bg-white p-5 shadow-sm"><div className="flex items-center justify-between"><div><p className="text-xs font-black uppercase tracking-wide text-blue-700">Property gallery</p><h2 className="mt-1 text-xl font-black">Hotel images</h2></div><label className="flex cursor-pointer items-center gap-2 rounded-2xl bg-blue-600 px-4 py-3 text-sm font-black text-white"><ImagePlus size={18} /> Add image<input type="file" accept="image/*" className="hidden" onChange={async (event) => { const file = event.target.files?.[0]; if (!file) return; try { await addHotelImage(business.id, file); await load(); showToast("Hotel image added.", "success"); } catch (error) { showToast(error.message, "danger"); } }} /></label></div><div className="mt-4 flex gap-3 overflow-x-auto">{workspace.images.map((image) => <img key={image.id} src={image.image_url} alt={image.caption || "Hotel"} className="h-40 min-w-[240px] rounded-2xl object-cover" />)}{!workspace.images.length ? <EmptyState text="Add property and lobby images buyers can browse." /> : null}</div></section><section className="rounded-[26px] border border-gray-200 bg-white p-5 shadow-sm"><div className="flex items-center justify-between"><div><p className="text-xs font-black uppercase tracking-wide text-blue-700">Rooms</p><h2 className="mt-1 text-xl font-black">Room types and availability</h2></div><button type="button" onClick={() => setFormOpen((value) => !value)} className="flex h-11 items-center gap-2 rounded-2xl bg-slate-950 px-4 text-sm font-black text-white"><Plus size={18} /> Add room</button></div>{formOpen ? <HotelRoomForm room={room} setRoom={setRoom} onSubmit={async (event) => { event.preventDefault(); try { await saveHotelRoom(business.id, room); setRoom({ name: "", description: "", nightly_rate: "", capacity: 1, rooms_available: 1, amenitiesText: "", imageFile: null }); setFormOpen(false); await load(); showToast("Hotel room added.", "success"); } catch (error) { showToast(error.message, "danger"); } }} /> : null}<div className="mt-5 grid gap-3 md:grid-cols-2">{workspace.rooms.map((item) => <div key={item.id} className="rounded-2xl border border-gray-200 p-4"><div className="flex gap-3">{item.image_urls?.[0] ? <img src={item.image_urls[0]} alt="" className="h-20 w-24 rounded-xl object-cover" /> : <span className="grid h-20 w-24 place-items-center rounded-xl bg-blue-50 text-blue-600"><Hotel /></span>}<div><h3 className="font-black text-gray-950">{item.name}</h3><p className="mt-1 text-sm font-black">{business.currency} {Number(item.nightly_rate).toLocaleString()} / night</p><p className="mt-2 text-xs font-bold text-gray-500">{item.capacity} guests · {item.rooms_available} rooms available</p></div></div></div>)}</div></section></WorkspaceShell>;
}

function HotelRoomForm({ room, setRoom, onSubmit }) {
  return <form onSubmit={onSubmit} className="mt-5 grid gap-3 rounded-2xl bg-blue-50 p-4 sm:grid-cols-2"><Input label="Room type" value={room.name} onChange={(value) => setRoom({ ...room, name: value })} /><Input label="Nightly rate" type="number" value={room.nightly_rate} onChange={(value) => setRoom({ ...room, nightly_rate: value })} /><Input label="Guest capacity" type="number" value={room.capacity} onChange={(value) => setRoom({ ...room, capacity: value })} /><Input label="Rooms available" type="number" value={room.rooms_available} onChange={(value) => setRoom({ ...room, rooms_available: value })} /><Input label="Amenities, comma separated" value={room.amenitiesText} onChange={(value) => setRoom({ ...room, amenitiesText: value })} /><FileField label="Room image" onChange={(file) => setRoom({ ...room, imageFile: file })} /><button className="h-11 rounded-xl bg-blue-600 text-sm font-black text-white sm:col-span-2">Save room</button></form>;
}

function PropertyDashboard({ business }) {
  const [listings, setListings] = useState([]);
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState({ title: "", description: "", purpose: "rent", property_type: "house", price: "", rent_period: "month", bedrooms: 0, bathrooms: 0, furnished: false, address: "", city: business.location || "", amenitiesText: "", imageFile: null, published: false });
  const load = useCallback(async () => setListings(await fetchPropertyListings(business.id)), [business.id]);
  useEffect(() => { load().catch((error) => showToast(error.message, "danger")); }, [load]);
  useEffect(() => { const open = () => setFormOpen(true); window.addEventListener("marketplace-open-vertical-editor", open); return () => window.removeEventListener("marketplace-open-vertical-editor", open); }, []);
  const counts = useMemo(() => ({ available: listings.filter((item) => item.availability_status === "available").length, published: listings.filter((item) => item.published).length }), [listings]);
  return <WorkspaceShell icon={House} eyebrow="Property Agent workspace" title={business.name} subtitle="Publish authorised houses, apartments, land, and commercial property for rent or sale." stats={[{ label: "Listings", value: listings.length }, { label: "Available", value: counts.available }, { label: "Published", value: counts.published }, { label: "Awaiting proof", value: listings.filter((item) => item.authorization_status === "pending").length }]}><section className="rounded-[26px] border border-gray-200 bg-white p-5 shadow-sm"><div className="flex items-center justify-between"><div><p className="text-xs font-black uppercase tracking-wide text-violet-700">Property desk</p><h2 className="mt-1 text-xl font-black">Properties and enquiries</h2></div><button type="button" onClick={() => setFormOpen((value) => !value)} className="flex h-11 items-center gap-2 rounded-2xl bg-violet-700 px-4 text-sm font-black text-white"><Plus size={18} /> Add property</button></div>{formOpen ? <PropertyForm form={form} setForm={setForm} onSubmit={async (event) => { event.preventDefault(); try { await savePropertyListing(business.id, form); setForm((current) => ({ ...current, title: "", description: "", price: "", address: "", imageFile: null, published: false })); setFormOpen(false); await load(); showToast("Property saved for verification.", "success"); } catch (error) { showToast(error.message, "danger"); } }} /> : null}<div className="mt-5 grid gap-4 md:grid-cols-2">{listings.map((item) => <div key={item.id} className="overflow-hidden rounded-2xl border border-gray-200">{item.image_urls?.[0] ? <img src={item.image_urls[0]} alt="" className="h-44 w-full object-cover" /> : <div className="grid h-44 place-items-center bg-violet-50 text-violet-600"><House size={36} /></div>}<div className="p-4"><div className="flex items-center justify-between"><span className="rounded-full bg-violet-50 px-2 py-1 text-[11px] font-black uppercase text-violet-700">For {item.purpose}</span><span className="text-xs font-black capitalize text-gray-500">{item.authorization_status}</span></div><h3 className="mt-3 text-lg font-black">{item.title}</h3><p className="mt-1 flex items-center gap-1 text-sm font-bold text-gray-500"><MapPin size={15} /> {item.address}</p><div className="mt-3 flex gap-3 text-xs font-bold text-gray-500"><span className="flex gap-1"><BedDouble size={15} /> {item.bedrooms}</span><span className="flex gap-1"><Bath size={15} /> {item.bathrooms}</span><strong className="ml-auto text-gray-950">{business.currency} {Number(item.price).toLocaleString()}</strong></div></div></div>)}</div>{!listings.length ? <EmptyState text="Add the first authorised property listing." /> : null}</section></WorkspaceShell>;
}

function PropertyForm({ form, setForm, onSubmit }) {
  return <form onSubmit={onSubmit} className="mt-5 grid gap-3 rounded-2xl bg-violet-50 p-4 sm:grid-cols-2"><Input label="Property title" value={form.title} onChange={(value) => setForm({ ...form, title: value })} /><Input label="Price" type="number" value={form.price} onChange={(value) => setForm({ ...form, price: value })} /><Select label="Purpose" value={form.purpose} onChange={(value) => setForm({ ...form, purpose: value })} options={["rent", "sale"]} /><Select label="Property type" value={form.property_type} onChange={(value) => setForm({ ...form, property_type: value })} options={["house", "apartment", "land", "commercial"]} /><Input label="Bedrooms" type="number" value={form.bedrooms} onChange={(value) => setForm({ ...form, bedrooms: value })} /><Input label="Bathrooms" type="number" value={form.bathrooms} onChange={(value) => setForm({ ...form, bathrooms: value })} /><Input label="Address" value={form.address} onChange={(value) => setForm({ ...form, address: value })} /><Input label="City/area" value={form.city} onChange={(value) => setForm({ ...form, city: value })} /><FileField label="Property image" onChange={(file) => setForm({ ...form, imageFile: file })} /><label className="flex items-center gap-2 self-end rounded-xl border border-violet-100 bg-white p-3 text-sm font-black"><input type="checkbox" checked={form.published} onChange={(event) => setForm({ ...form, published: event.target.checked })} /> Submit for publication</label><button className="h-11 rounded-xl bg-violet-700 text-sm font-black text-white sm:col-span-2">Save property</button></form>;
}

function Input({ label, onChange, type = "text", value }) { return <label><span className="text-xs font-black text-gray-600">{label}</span><input type={type} value={value} onChange={(event) => onChange(event.target.value)} className="mt-1 h-11 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm font-bold outline-none focus:border-emerald-400" /></label>; }
function Select({ label, onChange, options, value }) { return <label><span className="text-xs font-black text-gray-600">{label}</span><select value={value} onChange={(event) => onChange(event.target.value)} className="mt-1 h-11 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm font-bold outline-none">{options.map((option) => <option key={option} value={option}>{option.replaceAll("_", " ")}</option>)}</select></label>; }
function FileField({ label, onChange }) { return <label><span className="text-xs font-black text-gray-600">{label}</span><span className="mt-1 flex h-11 cursor-pointer items-center gap-2 rounded-xl border border-gray-200 bg-white px-3 text-sm font-bold text-gray-600"><Camera size={17} /> Choose image<input type="file" accept="image/*" className="hidden" onChange={(event) => onChange(event.target.files?.[0] || null)} /></span></label>; }
function EmptyState({ text }) { return <div className="mt-5 rounded-2xl border border-dashed border-gray-300 bg-gray-50 p-6 text-center"><CalendarDays className="mx-auto text-gray-400" /><p className="mt-2 text-sm font-bold text-gray-500">{text}</p></div>; }
