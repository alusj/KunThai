import { useEffect, useMemo, useState } from "react";
import {
  FiAlertTriangle,
  FiBookmark,
  FiChevronDown,
  FiCrosshair,
  FiMapPin,
  FiPhone,
  FiPlus,
  FiSearch,
  FiShield,
} from "react-icons/fi";
import AppBackTab from "../shared/AppBackTab";
import NearbyAreaMap from "./area/NearbyAreaMap";
import { searchLocations } from "../../Backend/services/locationSearchService";
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
  const [locationPanelOpen, setLocationPanelOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const [mapCenter, setMapCenter] = useState(null);

  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [mapInstance, setMapInstance] = useState(null);
  const [selectedSearchLocation, setSelectedSearchLocation] = useState(null);

  const filteredLocations = useMemo(() => {
    if (activeCategory === "All") return nearbyLocations;
    return nearbyLocations.filter((location) => location.category === activeCategory);
  }, [activeCategory]);

  useEffect(() => {
    const timeout = window.setTimeout(async () => {
      const text = searchQuery.trim();

      if (text.length < 2) {
        setSearchResults([]);
        setSearching(false);
        return;
      }

      setSearching(true);
      const results = await searchLocations(text, mapCenter);
      setSearchResults(results);
      setSearching(false);
    }, 450);

    return () => window.clearTimeout(timeout);
  }, [searchQuery]);

  function openAddLocation() {
    setLocationPanelOpen(false);
    setAdding(true);
  }

  function handleSelectSearchResult(result) {
  setSearchQuery(result.name);
  setSearchResults([]);
  setSearching(false);
  setLocationPanelOpen(false);
  setSelectedSearchLocation(result);

  if (document.activeElement) {
    document.activeElement.blur();
  }

  mapInstance?.flyTo({
    center: [result.lng, result.lat],
    zoom: 15,
    essential: true,
  });
}

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <section className="relative min-h-screen overflow-hidden">
        <NearbyAreaMap
  onLocationResolved={setMapCenter}
  onMapReady={setMapInstance}
  selectedLocation={selectedSearchLocation}
>
          <div className="pointer-events-none absolute inset-0 z-10">
            <div className="absolute left-1/2 top-1/2 h-56 w-56 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-sky-200 bg-sky-300/30 shadow-[0_0_45px_rgba(125,211,252,0.6)] sm:h-72 sm:w-72" />
            <div className="absolute left-1/2 top-1/2 h-5 w-5 -translate-x-1/2 -translate-y-1/2 rounded-full border-4 border-white bg-blue-600 shadow-xl" />

            {filteredLocations.map((location) => (
              <MapPinButton
                key={location.id}
                location={location}
                active={activeLocation?.id === location.id}
                onClick={() => {
                  setActiveLocation(location);
                  setLocationPanelOpen(true);
                }}
              />
            ))}
          </div>
        </NearbyAreaMap>

        <header className="absolute left-0 right-0 top-0 z-20 px-3 py-3 sm:px-5">
          <div className="flex items-center gap-3">
            <AppBackTab
              onBack={onBack}
              label="Back to transport"
              historyKey="transport-nearby-area"
              className="h-11 w-11 rounded-full bg-white/95 text-slate-900 shadow-lg hover:bg-white"
              iconSize={21}
            />

            <div className="relative min-w-0 flex-1">
              <label className="relative block">
                <FiSearch
                  className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"
                  size={19}
                />
                <input
                  type="search"
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  placeholder="Search street, shop, school, pickup point"
                  className="h-12 w-full rounded-2xl border border-white/10 bg-white/95 pl-11 pr-4 text-sm font-semibold text-slate-900 outline-none placeholder:text-slate-400"
                />
              </label>

              {(searching || searchResults.length > 0) && (
                <div className="absolute left-0 right-0 top-14 z-50 overflow-hidden rounded-2xl bg-white text-slate-900 shadow-2xl">
                  {searching ? (
                    <div className="px-4 py-3 text-sm font-bold text-slate-500">
                      Searching locations...
                    </div>
                  ) : (
                    searchResults.map((result) => (
                      <button
                        key={result.id}
                        type="button"
                        onClick={() => handleSelectSearchResult(result)}
                        className="block w-full border-b border-slate-100 px-4 py-3 text-left text-sm font-semibold text-slate-700 hover:bg-slate-50"
                      >
                        {result.name}
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>

            <div className="flex shrink-0 items-center gap-2">
              <button
                type="button"
                onClick={() => setLocationPanelOpen((open) => !open)}
                className={`flex h-12 w-12 items-center justify-center rounded-2xl text-sm font-bold shadow-lg transition sm:w-auto sm:px-4 ${
                  locationPanelOpen
                    ? "bg-slate-950 text-white"
                    : "bg-white/90 text-slate-900 hover:bg-white"
                }`}
                aria-label={locationPanelOpen ? "Hide nearby area card" : "Show nearby area card"}
              >
                <FiMapPin size={20} />
                <span className="ml-2 hidden lg:inline">Area Card</span>
              </button>

              <button
                type="button"
                onClick={openAddLocation}
                className="flex h-12 w-12 items-center justify-center rounded-2xl bg-green-600 text-sm font-bold text-white shadow-lg transition hover:bg-green-700 sm:w-auto sm:px-4"
                aria-label="Add location"
              >
                <FiPlus size={20} />
                <span className="ml-2 hidden sm:inline">Add Location</span>
              </button>
            </div>
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

        <div className="absolute bottom-32 right-4 z-20 grid gap-3 sm:bottom-8">
          <button
            type="button"
            className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-900/85 text-white shadow-lg"
            aria-label="Use current area"
          >
            <FiCrosshair size={21} />
          </button>

          <button
            type="button"
            className="flex h-12 w-12 items-center justify-center rounded-full bg-white text-slate-900 shadow-lg"
            aria-label="Save current area"
          >
            <FiBookmark size={21} />
          </button>
        </div>

        <LocationPanel
          activeLocation={activeLocation}
          open={locationPanelOpen}
          onToggle={() => setLocationPanelOpen((open) => !open)}
          onAddLocation={openAddLocation}
        />

        {adding && <AddLocationPanel onClose={() => setAdding(false)} />}
      </section>
    </div>
  );
}

function MapPinButton({ location, active, onClick }) {
  const isEmergency = location.category === "Emergency";

  return (
    <button
      type="button"
      onClick={onClick}
      className={`pointer-events-auto absolute -translate-x-1/2 -translate-y-1/2 rounded-full border-2 p-2 shadow-lg transition duration-200 hover:scale-105 ${
        active
          ? "scale-110 border-white bg-green-600"
          : "border-white/80 bg-slate-900"
      } ${isEmergency ? "text-red-300" : "text-white"}`}
      style={{
        left: location.position.left,
        top: location.position.top,
      }}
      aria-label={location.name}
    >
      {isEmergency ? <FiAlertTriangle size={18} /> : <FiMapPin size={18} />}
    </button>
  );
}

function LocationPanel({ activeLocation, open, onToggle, onAddLocation }) {
  const status = locationStatusStyles[activeLocation?.status] || locationStatusStyles.community;

  if (!open) return null;

  return (
    <aside className="absolute left-3 right-3 top-40 z-30 max-h-[calc(100vh-11rem)] overflow-y-auto rounded-3xl bg-white/95 p-4 text-slate-950 shadow-2xl backdrop-blur transition-opacity sm:left-auto sm:right-5 sm:w-[390px]">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-slate-400">Nearby Area</p>
          <h2 className="mt-1 text-xl font-black">{activeLocation?.name}</h2>
          <p className="mt-1 text-sm text-slate-500">
            {activeLocation?.type} - {activeLocation?.distance}
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <span className={`hidden rounded-full border px-2.5 py-1 text-xs font-bold sm:inline-flex ${status.className}`}>
            {status.label}
          </span>

          <button
            type="button"
            onClick={onToggle}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-700 hover:bg-slate-200"
            aria-label="Collapse nearby area card"
          >
            <FiChevronDown size={18} />
          </button>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span className={`rounded-full border px-2.5 py-1 text-xs font-bold sm:hidden ${status.className}`}>
          {status.label}
        </span>

        <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-600">
          Opened from Area Card
        </span>
      </div>

      <p className="mt-3 text-sm leading-6 text-slate-600">
        {activeLocation?.description}
      </p>

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
            <div
              key={contact.id}
              className="flex items-center justify-between rounded-2xl bg-slate-50 px-3 py-2"
            >
              <span className="text-sm font-semibold text-slate-700">
                {contact.label}
              </span>
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
  const [category, setCategory] = useState(addCategories[0]);

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

          <button
            type="button"
            onClick={onClose}
            className="rounded-full bg-slate-100 px-3 py-1 text-sm font-bold"
          >
            Close
          </button>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <FormInput label="Place name" placeholder="Example: Musa Mini Mart" />

          <label className="block">
            <span className="mb-2 block text-sm font-bold text-slate-700">
              Category
            </span>
            <select
              value={category}
              onChange={(event) => setCategory(event.target.value)}
              className="h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 px-3 text-sm font-semibold outline-none"
            >
              {addCategories.map((item) => (
                <option key={item}>{item}</option>
              ))}
            </select>
          </label>

          {category === "Other" ? (
            <FormInput
              label="Category name"
              placeholder="Example: Garage, mosque, office, junction..."
            />
          ) : null}

          <FormInput label="Street / address" placeholder="Street, junction, or area" />
          <FormInput label="Landmark" placeholder="Near school, mosque, market..." />
          <FormInput label="Phone optional" placeholder="+232..." />
          <FormInput label="Opening hours optional" placeholder="8 AM - 9 PM" />
        </div>

        <label className="mt-3 block">
          <span className="mb-2 block text-sm font-bold text-slate-700">
            Why is this place useful?
          </span>
          <textarea
            rows="3"
            className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm font-semibold outline-none"
            placeholder="Pickup point, safe waiting spot, shop landmark, emergency help..."
          />
        </label>

        <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            className="h-11 rounded-2xl border border-slate-200 px-4 text-sm font-bold text-slate-700"
          >
            Drop Pin
          </button>

          <button
            type="button"
            onClick={onClose}
            className="h-11 rounded-2xl bg-green-600 px-4 text-sm font-bold text-white"
          >
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