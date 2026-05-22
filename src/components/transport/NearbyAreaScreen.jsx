import { useEffect, useMemo, useState } from "react";
import {
  FiAlertTriangle,
  FiBookmark,
  FiCrosshair,
  FiEye,
  FiEyeOff,
  FiLock,
  FiMapPin,
  FiNavigation,
  FiPhone,
  FiPlus,
  FiSearch,
  FiShield,
  FiUnlock,
  FiX,
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

function getShortAddress(result) {
  return result.address || result.fullAddress || result.placeName || "Freetown, Sierra Leone";
}

function getDemoOperatorLocations(mapCenter) {
  const center = mapCenter || { lat: 8.4657, lng: -13.2317 };

  return [
    {
      id: "operator-bike-1",
      name: "Nearby Okada",
      type: "bike",
      available: true,
      lat: center.lat + 0.0045,
      lng: center.lng - 0.0038,
    },
    {
      id: "operator-keke-1",
      name: "Nearby Keke",
      type: "keke",
      available: true,
      lat: center.lat - 0.0035,
      lng: center.lng + 0.0042,
    },
    {
      id: "operator-car-1",
      name: "Nearby Driver",
      type: "car",
      available: false,
      lat: center.lat + 0.0028,
      lng: center.lng + 0.0052,
    },
  ];
}

export default function NearbyAreaScreen({ onBack }) {
  const [activeCategory, setActiveCategory] = useState("All");
  const [activeLocation, setActiveLocation] = useState(nearbyLocations[0]);
  const [locationPanelOpen, setLocationPanelOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const [mapCenter, setMapCenter] = useState(null);
  const [focusMode, setFocusMode] = useState(false);
  const [mapLocked, setMapLocked] = useState(false);
  const [searchOverlayOpen, setSearchOverlayOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [selectionLocked, setSelectionLocked] = useState(false);
  const [mapInstance, setMapInstance] = useState(null);
  const [selectedSearchLocation, setSelectedSearchLocation] = useState(null);
  const [recenterSignal, setRecenterSignal] = useState(0);

  const filteredLocations = useMemo(() => {
    if (activeCategory === "All") return nearbyLocations;
    return nearbyLocations.filter((location) => location.category === activeCategory);
  }, [activeCategory]);

  const operatorLocations = useMemo(() => getDemoOperatorLocations(mapCenter), [mapCenter]);

  useEffect(() => {
    const timeout = window.setTimeout(async () => {
      if (selectionLocked) {
        setSearchResults([]);
        setSearching(false);
        return;
      }

      const text = searchQuery.trim();

      if (text.length < 2) {
        setSearchResults([]);
        setSearching(false);
        return;
      }

      setSearching(true);

      try {
        const results = await searchLocations(text, mapCenter);
        setSearchResults(results || []);
      } catch (error) {
        console.error(error);
        setSearchResults([]);
      } finally {
        setSearching(false);
      }
    }, 350);

    return () => window.clearTimeout(timeout);
  }, [searchQuery, mapCenter, selectionLocked]);

  function openAddLocation() {
    setLocationPanelOpen(false);
    setAdding(true);
  }

  function handleUseCurrentArea() {
    setFocusMode(false);
    setRecenterSignal((value) => value + 1);
  }

  function handleEmergencyOpen() {
    setActiveCategory("Emergency");
    const emergency = nearbyLocations.find((item) => item.category === "Emergency");
    if (emergency) {
      setActiveLocation(emergency);
      setLocationPanelOpen(true);
    }
  }

  function handleSelectSearchResult(result) {
    setSelectionLocked(true);
    setSearchQuery(result.name);
    setSearchResults([]);
    setSearching(false);
    setLocationPanelOpen(false);
    setSearchOverlayOpen(false);
    setSelectedSearchLocation(result);

    if (document.activeElement) document.activeElement.blur();

    mapInstance?.flyTo({
      center: [result.lng, result.lat],
      zoom: 15.5,
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
          focusMode={focusMode}
          operatorLocations={operatorLocations}
          recenterSignal={recenterSignal}
        >
          <div className="pointer-events-none absolute inset-0 z-10">
            {!focusMode &&
              filteredLocations.map((location) => (
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
          <div className="flex items-center gap-2 sm:gap-3">
            <AppBackTab
              onBack={() => {
                if (mapLocked) return;
                onBack?.();
              }}
              label={mapLocked ? "Map locked" : "Back to transport"}
              historyKey="transport-nearby-area"
              className={`h-12 w-12 rounded-2xl shadow-lg ${
                mapLocked ? "bg-slate-900 text-white opacity-70" : "bg-white/95 text-slate-900 hover:bg-white"
              }`}
              iconSize={22}
            />

            <button
              type="button"
              onClick={() => setSearchOverlayOpen(true)}
              className="flex h-12 min-w-0 flex-1 items-center gap-3 rounded-2xl bg-white/95 px-4 text-left text-slate-900 shadow-lg"
            >
              <FiSearch className="shrink-0 text-slate-400" size={20} />
              <span className="truncate text-sm font-black sm:text-base">
                {searchQuery || "Search street, shop, school, pickup point"}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setFocusMode((value) => !value)}
              className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl shadow-lg transition ${
                focusMode ? "bg-slate-950 text-white" : "bg-white/95 text-slate-900 hover:bg-white"
              }`}
              aria-label={focusMode ? "Exit focus mode" : "Enter focus mode"}
            >
              {focusMode ? <FiEyeOff size={21} /> : <FiEye size={21} />}
            </button>

            <button
              type="button"
              onClick={() => setMapLocked((value) => !value)}
              className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl shadow-lg transition ${
                mapLocked ? "bg-green-600 text-white" : "bg-white/95 text-slate-900 hover:bg-white"
              }`}
              aria-label={mapLocked ? "Unlock map screen" : "Lock map screen"}
            >
              {mapLocked ? <FiLock size={21} /> : <FiUnlock size={21} />}
            </button>

            <button
              type="button"
              onClick={openAddLocation}
              className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-green-600 text-white shadow-lg transition hover:bg-green-700"
              aria-label="Add location"
            >
              <FiPlus size={22} />
            </button>
          </div>

          {!focusMode && (
            <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
              {locationCategories.map((category) => (
                <button
                  key={category}
                  type="button"
                  onClick={() => setActiveCategory(category)}
                  className={`shrink-0 rounded-full px-4 py-2 text-sm font-black shadow ${
                    activeCategory === category
                      ? "bg-green-600 text-white"
                      : "bg-slate-900/80 text-white backdrop-blur"
                  }`}
                >
                  {category}
                </button>
              ))}
            </div>
          )}
        </header>

        {!focusMode && (
          <div className="absolute bottom-32 right-4 z-30 grid gap-3 sm:bottom-8">
            <button
              type="button"
              onClick={handleEmergencyOpen}
              className="flex h-12 w-12 items-center justify-center rounded-full bg-red-600 text-white shadow-xl"
              aria-label="Emergency"
            >
              <FiAlertTriangle size={22} />
            </button>

            <button
              type="button"
              onClick={handleUseCurrentArea}
              className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-950/90 text-white shadow-xl"
              aria-label="Return to current location"
            >
              <FiCrosshair size={22} />
            </button>

            <button
              type="button"
              className="flex h-12 w-12 items-center justify-center rounded-full bg-white text-slate-900 shadow-xl"
              aria-label="Save current area"
            >
              <FiBookmark size={22} />
            </button>
          </div>
        )}

        {!focusMode && (
          <LocationPanel
            activeLocation={activeLocation}
            open={locationPanelOpen}
            onClose={() => setLocationPanelOpen(false)}
            onAddLocation={openAddLocation}
          />
        )}

        {searchOverlayOpen && (
          <SearchOverlay
            query={searchQuery}
            setQuery={(value) => {
              setSelectionLocked(false);
              setSearchQuery(value);
            }}
            searching={searching}
            results={searchResults}
            onClose={() => setSearchOverlayOpen(false)}
            onSelect={handleSelectSearchResult}
            onUseCurrentLocation={handleUseCurrentArea}
          />
        )}

        {adding && <AddLocationPanel onClose={() => setAdding(false)} />}
      </section>
    </div>
  );
}

function SearchOverlay({
  query,
  setQuery,
  searching,
  results,
  onClose,
  onSelect,
  onUseCurrentLocation,
}) {
  return (
    <div className="fixed inset-0 z-[1400] bg-slate-950/70 backdrop-blur-sm">
      <section className="mx-auto flex h-full w-full max-w-2xl flex-col bg-white text-slate-950 shadow-2xl sm:mt-4 sm:h-[calc(100vh-2rem)] sm:rounded-3xl">
        <div className="border-b border-slate-100 px-4 pb-3 pt-4">
          <div className="mx-auto mb-3 h-1.5 w-20 rounded-full bg-slate-300 sm:hidden" />

          <div className="flex items-center gap-3">
            <label className="relative min-w-0 flex-1">
              <FiSearch className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={23} />
              <input
                autoFocus
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search KunThai map"
                className="h-14 w-full rounded-2xl border border-slate-200 bg-slate-50 pl-12 pr-12 text-lg font-black text-slate-950 outline-none focus:border-green-500"
              />
              {query ? (
                <button
                  type="button"
                  onClick={() => setQuery("")}
                  className="absolute right-3 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full bg-slate-200 text-slate-700"
                >
                  <FiX size={18} />
                </button>
              ) : null}
            </label>

            <button
              type="button"
              onClick={onClose}
              className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-900"
              aria-label="Close search"
            >
              <FiX size={26} />
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
          <button
            type="button"
            onClick={() => {
              onUseCurrentLocation();
              onClose();
            }}
            className="mb-3 flex w-full items-center gap-3 rounded-2xl border border-green-100 bg-green-50 px-4 py-3 text-left"
          >
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-green-600 text-white">
              <FiNavigation size={20} />
            </span>
            <span>
              <span className="block text-base font-black text-slate-950">Use current location</span>
              <span className="block text-sm font-bold text-slate-500">Return the map to your live position</span>
            </span>
          </button>

          {searching ? (
            <div className="rounded-2xl bg-slate-50 px-4 py-5 text-sm font-black text-slate-500">
              Searching nearby places...
            </div>
          ) : results.length ? (
            <div className="overflow-hidden rounded-3xl bg-white">
              {results.map((result) => (
                <button
                  key={result.id}
                  type="button"
                  onClick={() => onSelect(result)}
                  className="flex w-full gap-4 border-b border-slate-100 px-2 py-4 text-left hover:bg-slate-50"
                >
                  <span className="mt-1 flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-rose-500 text-white">
                    <FiMapPin size={21} />
                  </span>

                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-lg font-black text-slate-950">
                      {result.name}
                    </span>
                    <span className="mt-1 block line-clamp-2 text-base font-bold text-slate-500">
                      {result.distance ? `${result.distance} • ` : ""}
                      {getShortAddress(result)}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          ) : query.trim().length >= 2 ? (
            <div className="rounded-2xl bg-slate-50 px-4 py-5 text-sm font-black text-slate-500">
              No clear result found. Try a street, landmark, business name, or area.
            </div>
          ) : (
            <div className="rounded-2xl bg-slate-50 px-4 py-5 text-sm font-black text-slate-500">
              Start typing to search for roads, shops, schools, pickup points, and landmarks.
            </div>
          )}
        </div>
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
        active ? "scale-110 border-white bg-green-600" : "border-white/80 bg-slate-900"
      } ${isEmergency ? "text-red-300" : "text-white"}`}
      style={{ left: location.position.left, top: location.position.top }}
      aria-label={location.name}
    >
      {isEmergency ? <FiAlertTriangle size={18} /> : <FiMapPin size={18} />}
    </button>
  );
}

function LocationPanel({ activeLocation, open, onClose, onAddLocation }) {
  const status = locationStatusStyles[activeLocation?.status] || locationStatusStyles.community;

  if (!open) return null;

  return (
    <aside className="absolute left-3 right-3 top-36 z-30 max-h-[calc(100vh-10rem)] overflow-y-auto rounded-3xl bg-white/95 p-4 text-slate-950 shadow-2xl backdrop-blur sm:left-auto sm:right-5 sm:w-[390px]">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-slate-400">Nearby Area</p>
          <h2 className="mt-1 text-xl font-black">{activeLocation?.name}</h2>
          <p className="mt-1 text-sm text-slate-500">
            {activeLocation?.type} - {activeLocation?.distance}
          </p>
        </div>

        <button
          type="button"
          onClick={onClose}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-700 hover:bg-slate-200"
          aria-label="Close location card"
        >
          <FiX size={18} />
        </button>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span className={`rounded-full border px-2.5 py-1 text-xs font-bold ${status.className}`}>
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
  const [category, setCategory] = useState(addCategories[0]);

  return (
    <div className="absolute inset-0 z-40 flex items-end bg-slate-950/45 sm:items-center sm:justify-center">
      <section className="w-full rounded-t-3xl bg-white p-4 text-slate-950 shadow-2xl sm:max-w-xl sm:rounded-3xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-black">Add Location</h2>
            <p className="mt-1 text-sm text-slate-500">Add local places that are missing from normal maps.</p>
          </div>

          <button type="button" onClick={onClose} className="rounded-full bg-slate-100 px-3 py-1 text-sm font-bold">
            Close
          </button>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <FormInput label="Place name" placeholder="Example: Musa Mini Mart" />

          <label className="block">
            <span className="mb-2 block text-sm font-bold text-slate-700">Category</span>
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
            <FormInput label="Category name" placeholder="Example: Garage, mosque, office, junction..." />
          ) : null}

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