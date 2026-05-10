import { useMemo, useState } from "react";
import {
  FiAlertTriangle,
  FiBookmark,
  FiCrosshair,
  FiMapPin,
  FiPhone,
  FiPlus,
  FiSearch,
  FiShield,
} from "react-icons/fi";
import AppBackTab from "../shared/AppBackTab";
import {
  emergencyContacts,
  locationCategories,
  locationStatusStyles,
  nearbyLocations,
} from "../services/nearbyAreaService";

const addCategories = [
  "Shop",
  "School",
  "Supermarket",
  "Pharmacy",
  "Hospital / Clinic",
  "Police",
  "Fuel Station",
  "Pickup Point",
  "Transport Park",
  "Market",
  "Other",
];

export default function NearbyAreaScreen({ onBack }) {
  const [activeCategory, setActiveCategory] = useState("All");
  const [activeLocation, setActiveLocation] = useState(nearbyLocations[0]);
  const [adding, setAdding] = useState(false);

  const filteredLocations = useMemo(() => {
    if (activeCategory === "All") return nearbyLocations;
    return nearbyLocations.filter((location) => location.category === activeCategory);
  }, [activeCategory]);

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <section className="relative min-h-screen overflow-hidden">
        <MapBackdrop />

        <header className="absolute left-0 right-0 top-0 z-20 px-3 py-3 sm:px-5">
          <div className="flex items-center gap-3">
            <AppBackTab
              onBack={onBack}
              label="Back to transport"
              historyKey="transport-nearby-area"
              className="h-11 w-11 rounded-full bg-white/95 text-slate-900 shadow-lg hover:bg-white"
              iconSize={21}
            />
            <label className="relative min-w-0 flex-1">
              <FiSearch className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={19} />
              <input
                type="search"
                placeholder="Search street, shop, school, pickup point"
                className="h-12 w-full rounded-2xl border border-white/10 bg-white/95 pl-11 pr-4 text-sm font-semibold text-slate-900 outline-none placeholder:text-slate-400"
              />
            </label>
            <button
              type="button"
              onClick={() => setAdding(true)}
              className="hidden h-12 rounded-2xl bg-green-600 px-4 text-sm font-bold text-white shadow-lg hover:bg-green-700 sm:block"
            >
              Add Location
            </button>
          </div>

          <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
            {locationCategories.map((category) => (
              <button
                key={category}
                type="button"
                onClick={() => setActiveCategory(category)}
                className={`shrink-0 rounded-full px-4 py-2 text-sm font-bold shadow ${
                  activeCategory === category
                    ? "bg-green-600 text-white"
                    : "bg-slate-900/75 text-white backdrop-blur"
                }`}
              >
                {category}
              </button>
            ))}
          </div>
        </header>

        <div className="absolute inset-0 z-10">
          <div className="absolute left-1/2 top-1/2 h-56 w-56 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-sky-200 bg-sky-300/30 shadow-[0_0_45px_rgba(125,211,252,0.6)] sm:h-72 sm:w-72" />
          <div className="absolute left-1/2 top-1/2 h-5 w-5 -translate-x-1/2 -translate-y-1/2 rounded-full border-4 border-white bg-blue-600 shadow-xl" />

          {filteredLocations.map((location) => (
            <MapPinButton
              key={location.id}
              location={location}
              active={activeLocation?.id === location.id}
              onClick={() => setActiveLocation(location)}
            />
          ))}
        </div>

        <div className="absolute bottom-32 right-4 z-20 grid gap-3 sm:bottom-8">
          <button className="h-12 w-12 rounded-full bg-slate-900/85 text-white shadow-lg flex items-center justify-center">
            <FiCrosshair size={21} />
          </button>
          <button className="h-12 w-12 rounded-full bg-white text-slate-900 shadow-lg flex items-center justify-center">
            <FiBookmark size={21} />
          </button>
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="h-12 w-12 rounded-full bg-green-600 text-white shadow-lg flex items-center justify-center sm:hidden"
          >
            <FiPlus size={22} />
          </button>
        </div>

        <LocationPanel
          activeLocation={activeLocation}
          onAddLocation={() => setAdding(true)}
        />

        {adding && <AddLocationPanel onClose={() => setAdding(false)} />}
      </section>
    </div>
  );
}

function MapBackdrop() {
  return (
    <div className="absolute inset-0 bg-slate-900">
      <div className="absolute inset-0 opacity-70">
        <div className="absolute left-[10%] top-0 h-full w-1 rotate-[34deg] bg-slate-600/60" />
        <div className="absolute left-[32%] top-0 h-full w-1 rotate-[18deg] bg-slate-600/60" />
        <div className="absolute left-[57%] top-0 h-full w-1 -rotate-[22deg] bg-slate-600/60" />
        <div className="absolute left-0 top-[24%] h-1 w-full rotate-[7deg] bg-slate-600/60" />
        <div className="absolute left-0 top-[49%] h-1 w-full -rotate-[12deg] bg-slate-600/60" />
        <div className="absolute left-0 top-[72%] h-1 w-full rotate-[3deg] bg-slate-600/60" />
      </div>
      <div className="absolute left-[-10%] top-[18%] h-60 w-64 rounded-full bg-cyan-800/60 blur-sm" />
      <span className="absolute left-[8%] top-[54%] text-2xl font-black tracking-wide text-white/60">LUMLEY</span>
      <span className="absolute left-[47%] top-[42%] rotate-[55deg] text-lg font-bold text-white/40">Regent Rd</span>
      <span className="absolute left-[20%] top-[31%] rotate-[35deg] text-lg font-bold text-white/40">Lumley Beach Rd</span>
    </div>
  );
}

function MapPinButton({ location, active, onClick }) {
  const isEmergency = location.category === "Emergency";

  return (
    <button
      type="button"
      onClick={onClick}
      className={`absolute -translate-x-1/2 -translate-y-1/2 rounded-full border-2 p-2 shadow-lg transition ${
        active ? "scale-110 border-white bg-green-600" : "border-white/80 bg-slate-900"
      } ${isEmergency ? "text-red-300" : "text-white"}`}
      style={{ left: location.position.left, top: location.position.top }}
      aria-label={location.name}
    >
      {isEmergency ? <FiAlertTriangle size={18} /> : <FiMapPin size={18} />}
    </button>
  );
}

function LocationPanel({ activeLocation, onAddLocation }) {
  const status = locationStatusStyles[activeLocation?.status] || locationStatusStyles.community;

  return (
    <aside className="absolute bottom-0 left-0 right-0 z-30 rounded-t-3xl bg-white p-4 text-slate-950 shadow-2xl sm:left-5 sm:right-auto sm:top-36 sm:bottom-5 sm:flex sm:w-[360px] sm:flex-col sm:rounded-3xl">
      <div className="mx-auto mb-3 h-1 w-12 rounded-full bg-slate-300 sm:hidden" />
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-slate-400">Nearby Area</p>
          <h2 className="mt-1 text-xl font-black">{activeLocation?.name}</h2>
          <p className="mt-1 text-sm text-slate-500">{activeLocation?.type} - {activeLocation?.distance}</p>
        </div>
        <span className={`shrink-0 rounded-full border px-2.5 py-1 text-xs font-bold ${status.className}`}>
          {status.label}
        </span>
      </div>

      <p className="mt-3 text-sm leading-6 text-slate-600">{activeLocation?.description}</p>

      <div className="mt-4 grid gap-2">
        <button className="h-11 rounded-2xl bg-green-600 text-sm font-bold text-white">
          Set as Pickup
        </button>
        <button
          type="button"
          onClick={onAddLocation}
          className="h-11 rounded-2xl border border-slate-200 text-sm font-bold text-slate-700"
        >
          Add Missing Location
        </button>
      </div>

      <section className="mt-5">
        <div className="mb-2 flex items-center gap-2 text-sm font-black">
          <FiShield className="text-red-500" />
          Emergency Contacts
        </div>
        <div className="grid gap-2">
          {emergencyContacts.map((contact) => (
            <div key={contact.id} className="flex items-center justify-between rounded-2xl bg-slate-50 px-3 py-2">
              <span className="text-sm font-semibold text-slate-700">{contact.label}</span>
              <span className="flex items-center gap-1 text-xs font-bold text-slate-500">
                <FiPhone size={13} />
                {contact.value}
              </span>
            </div>
          ))}
        </div>
      </section>
    </aside>
  );
}

function AddLocationPanel({ onClose }) {
  return (
    <div className="absolute inset-0 z-40 flex items-end bg-slate-950/45 sm:items-center sm:justify-center">
      <section className="w-full rounded-t-3xl bg-white p-4 text-slate-950 shadow-2xl sm:max-w-xl sm:rounded-3xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-black">Add Location</h2>
            <p className="mt-1 text-sm text-slate-500">
              Add local places that are missing from normal maps.
            </p>
          </div>
          <button type="button" onClick={onClose} className="rounded-full bg-slate-100 px-3 py-1 text-sm font-bold">
            Close
          </button>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <FormInput label="Place name" placeholder="Example: Musa Mini Mart" />
          <label className="block">
            <span className="mb-2 block text-sm font-bold text-slate-700">Category</span>
            <select className="h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 px-3 text-sm font-semibold outline-none">
              {addCategories.map((category) => (
                <option key={category}>{category}</option>
              ))}
            </select>
          </label>
          <FormInput label="Street / address" placeholder="Street, junction, or area" />
          <FormInput label="Landmark" placeholder="Near school, mosque, market..." />
          <FormInput label="Phone optional" placeholder="+232..." />
          <FormInput label="Opening hours optional" placeholder="8 AM - 9 PM" />
        </div>

        <label className="mt-3 block">
          <span className="mb-2 block text-sm font-bold text-slate-700">Why is this place useful?</span>
          <textarea
            rows="3"
            className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm font-semibold outline-none"
            placeholder="Pickup point, safe waiting spot, shop landmark, emergency help..."
          />
        </label>

        <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:justify-end">
          <button type="button" className="h-11 rounded-2xl border border-slate-200 px-4 text-sm font-bold text-slate-700">
            Drop Pin
          </button>
          <button type="button" onClick={onClose} className="h-11 rounded-2xl bg-green-600 px-4 text-sm font-bold text-white">
            Submit for Review
          </button>
        </div>
      </section>
    </div>
  );
}

function FormInput({ label, placeholder }) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-bold text-slate-700">{label}</span>
      <input
        placeholder={placeholder}
        className="h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 px-3 text-sm font-semibold outline-none placeholder:text-slate-400"
      />
    </label>
  );
}
