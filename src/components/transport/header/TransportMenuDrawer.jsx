import { createElement, useEffect, useMemo, useState } from "react";
import {
  Camera,
  CheckCircle2,
  ChevronRight,
  CreditCard,
  HelpCircle,
  History,
  LifeBuoy,
  LocateFixed,
  LockKeyhole,
  MapPin,
  MoreHorizontal,
  Navigation,
  Pencil,
  Plus,
  ReceiptText,
  Settings,
  Share2,
  ShieldAlert,
  BookOpenCheck,
  Trash2,
  UserRound,
  X,
} from "lucide-react";

import AppBackTab from "../../shared/AppBackTab.jsx";
import AppPortal from "../../shared/AppPortal";
import { SlidePanel, useSlidePanel } from "../../shared/SlideTransition";
import useBodyScrollLock from "../../shared/useBodyScrollLock";
import {
  AddressAreaResolutionCard,
  AddressAreaStatusIcon,
  normalizeAreaLocation,
  useAddressAreaValidation,
} from "../../shared/AddressAreaValidation";
import NearbyAreaScreen from "../NearbyAreaScreen";
import {
  fetchPassengerTrips,
  getPassengerTrips,
  getTransportPassengerSettings,
  getTransportSavedPlaces,
  removeTransportSavedPlace,
  saveTransportPassengerSettings,
  saveTransportSavedPlace,
  selectTransportSavedPlace,
  subscribePassengerTrips,
} from "../../services/passengerTransportService";
import { getCountryCurrencyCode } from "../../../data/globalCountryProfiles";
import { getRideFleetOptions } from "../../../data/globalTransportCapabilities";
import { getOnboardingProfile } from "../../../Backend/services/onboardingService";
import { submitTransportSupportTicket } from "../../services/bookingService";
import TransportCautionCard from "../shared/TransportCautionCard";

const TRANSPORT_PAYMENT_NOTE_KEY = "kuntai.transport.paymentNote";

const placeTypes = ["Home", "Work", "School", "Market", "Bus stop", "Other"];

const menuSections = [
  {
    title: "Travel",
    items: [
      {
        id: "caution",
        icon: BookOpenCheck,
        title: "Caution Card",
        description: "Passenger seats, operator accounts, fleets, and safer booking guidance.",
      },
      {
        id: "trips",
        icon: History,
        title: "My trips",
        description: "Pending rides, delivery requests, and previous trips.",
      },
      {
        id: "places",
        icon: MapPin,
        title: "Saved places",
        description: "Home, work, pickup points, and rider notes.",
      },
    ],
  },
  {
    title: "Money & safety",
    items: [
      {
        id: "wallet",
        icon: CreditCard,
        title: "Wallet & top up",
        description: "Payment readiness, safe top-up notice, and payment note.",
      },
      {
        id: "paymentSafety",
        icon: ShieldAlert,
        title: "Payment safety",
        description: "How to handle fares while transport payments are prepared.",
      },
      {
        id: "safety",
        icon: LifeBuoy,
        title: "Safety & emergency",
        description: "Passenger guidance for safer pickup, trips, delivery, and urgent situations.",
      },
    ],
  },
  {
    title: "Help",
    items: [
      {
        id: "support",
        icon: LifeBuoy,
        title: "Support",
        description: "Trip issues, safety reports, operator feedback, and help.",
      },
      {
        id: "settings",
        icon: Settings,
        title: "UrRide settings",
        description: "Trip alerts, privacy, language, and travel preferences.",
      },
    ],
  },
];

function readLocalText(key) {
  if (typeof window === "undefined") return "";
  try {
    return window.localStorage.getItem(key) || "";
  } catch {
    return "";
  }
}

function writeLocalText(key, value) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(key, value);
}

function createEmptyPlace(profile = {}) {
  return {
    id: "",
    category: "Home",
    customCategory: "",
    placeName: "",
    contactName: String(profile.displayName || profile.fullName || profile.full_name || "").trim(),
    phone: String(profile.phone || profile.phoneNumber || profile.phone_number || "").trim(),
    street: "",
    note: "",
    frontPictureUrl: "",
    detectedAddress: "",
    coordinates: null,
  };
}

function getPlaceLabel(place) {
  return place.category === "Other" ? place.customCategory || "Other" : place.category || "Home";
}

function getPlaceShareText(place) {
  const label = getPlaceLabel(place);
  const address = place.street || place.detectedAddress || "Address pending";
  const note = place.note ? `\nNote: ${place.note}` : "";
  return `${label} saved place\n${address}${note}`;
}

function formatDate(value) {
  if (!value) return "Date pending";
  return new Date(value).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function findMenuItem(screenId) {
  return menuSections.flatMap((section) => section.items).find((item) => item.id === screenId);
}

export default function TransportMenuDrawer({ open, onClose, onViewFleet }) {
  const [activeScreen, setActiveScreen] = useState(null);
  const [supportSeed, setSupportSeed] = useState(null);
  const { visibleKey: visibleScreen, action: screenAction } = useSlidePanel(activeScreen);
  const activeTitle = useMemo(
    () => findMenuItem(visibleScreen || activeScreen)?.title || "Passenger Menu",
    [activeScreen, visibleScreen],
  );

  useEffect(() => {
    if (!open) {
      setActiveScreen(null);
      setSupportSeed(null);
    }
  }, [open]);

  useBodyScrollLock(open);

  useEffect(() => {
    if (!open) return undefined;

    function handleKeyDown(event) {
      if (event.key !== "Escape") return;

      if (activeScreen) {
        setActiveScreen(null);
        return;
      }

      onClose?.();
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [activeScreen, onClose, open]);

  function closeDrawer() {
    onClose?.();
  }

  function openFleet(fleetId) {
    if (!fleetId) return;
    closeDrawer();
    onViewFleet?.(fleetId);
  }

  function openSupportFromTrip(trip) {
    setSupportSeed({
      topic: "Trip issue",
      details: `${trip.title || "UrRide trip"} - ${trip.pickup || "Pickup pending"} to ${trip.destination || "Destination pending"}`,
    });
    setActiveScreen("support");
  }

  function renderActiveScreen(screenId = visibleScreen) {
    if (screenId === "caution") {
      return <TransportCautionCard showMenuNote={false} />;
    }
    if (screenId === "trips") {
      return <MyTripsPage onViewFleet={openFleet} onOpenSupport={openSupportFromTrip} />;
    }

    if (screenId === "places") {
      return <SavedPlacesPage />;
    }

    if (screenId === "wallet") {
      return <PaymentReadinessPage variant="wallet" />;
    }

    if (screenId === "paymentSafety") {
      return <PaymentReadinessPage variant="safety" />;
    }

    if (screenId === "safety") {
      return <PassengerSafetyPage />;
    }

    if (screenId === "support") {
      return <SupportPage seed={supportSeed} />;
    }

    if (screenId === "settings") {
      return <TransportSettingsPage />;
    }

    return null;
  }

  return (
    <AppPortal>
    <div
      aria-hidden={!open}
      inert={open ? undefined : "true"}
      className={`fixed inset-0 z-[1200] overflow-hidden ${open ? "pointer-events-auto" : "pointer-events-none"}`}
    >
      <button
        type="button"
        aria-label="Close transport passenger menu"
        onClick={closeDrawer}
        tabIndex={open ? 0 : -1}
        className={`absolute inset-0 border-0 bg-slate-950/45 p-0 backdrop-blur-sm transition-opacity duration-300 ${
          open ? "opacity-100" : "opacity-0"
        }`}
      />

      <aside
        aria-hidden={Boolean(visibleScreen)}
        inert={visibleScreen ? "true" : undefined}
        className={`absolute right-0 top-0 flex h-full w-full max-w-md transform flex-col bg-gray-50 shadow-2xl transition-transform duration-300 ${
          open ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <PassengerMenuHeader title="Passenger Menu" showBack={false} onClose={closeDrawer} />

        <div className="flex-1 overflow-y-auto pb-6">
          <PassengerSummaryCard onOpenWallet={() => setActiveScreen("wallet")} />

          <div className="space-y-5 px-4 pt-5">
            {menuSections.map((section) => (
              <PassengerDrawerSection key={section.title} title={section.title}>
                {section.items.map((item) => (
                  <PassengerDrawerNavItem
                    key={item.id}
                    icon={item.icon}
                    title={item.title}
                    description={item.description}
                    onClick={() => {
                      setSupportSeed(null);
                      setActiveScreen(item.id);
                    }}
                  />
                ))}
              </PassengerDrawerSection>
            ))}
          </div>
        </div>
      </aside>

      {visibleScreen ? (
        <SlidePanel
          action={screenAction}
          className="bg-white"
          zIndex={10}
        >
          <PassengerMenuPageHeader
            title={activeTitle}
            eyebrow="UrRide"
            onBack={() => {
              setActiveScreen(null);
              setSupportSeed(null);
            }}
          />
          <div className="min-h-0 flex-1 overflow-y-auto bg-gray-50 px-4 py-4 sm:px-6 lg:px-8">
            {renderActiveScreen(visibleScreen)}
          </div>
        </SlidePanel>
      ) : null}
    </div>
    </AppPortal>
  );
}

function PassengerMenuHeader({ title, showBack, onBack, onClose }) {
  const backHandler = showBack ? onBack : onClose;
  const backLabel = showBack ? "Back to passenger menu" : "Back to transport";

  return (
    <div className="kt-header-glass flex h-16 items-center justify-between px-3 py-3 sm:px-4">
      {backHandler ? (
        <AppBackTab
          onBack={backHandler}
          label={backLabel}
          historyKey="transport-passenger-menu"
          className="rounded-full border border-gray-200 bg-white hover:bg-gray-50"
          useHistoryLayer={false}
        />
      ) : (
        <div className="h-10 w-10" />
      )}

      <h2 className="min-w-0 flex-1 truncate px-3 text-center text-base font-bold text-gray-950">
        {title}
      </h2>

      <div className="h-10 w-10" />
    </div>
  );
}

function PassengerMenuPageHeader({ title, eyebrow = "UrRide", onBack }) {
  return (
    <header className="kt-header-glass sticky top-0 z-30 px-4 py-3 sm:px-6">
      <div className="flex min-w-0 items-start gap-3">
        <AppBackTab
          onBack={onBack}
          label="Back"
          historyKey="transport-passenger-menu-screen"
          className="mt-0.5 flex-none"
          useHistoryLayer={false}
        />
        <div className="min-w-0">
          <p className="text-[10px] font-black uppercase tracking-[0.22em] text-emerald-700 sm:text-xs">
            {eyebrow}
          </p>
          <h2 className="mt-1 text-xl font-black text-gray-950 sm:text-2xl">{title}</h2>
        </div>
      </div>
    </header>
  );
}

function PassengerSummaryCard({ onOpenWallet }) {
  return (
    <button
      type="button"
      onClick={onOpenWallet}
      className="kt-touchable mx-4 mt-4 w-[calc(100%-2rem)] rounded-xl border border-gray-200 bg-gray-950 p-4 text-left text-white shadow-sm transition hover:bg-gray-900 hover:shadow-lg hover:shadow-gray-950/15"
    >
      <div className="flex items-center gap-3">
        <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-white/10">
          <UserRound size={23} />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-2">
            <p className="truncate text-base font-black">Passenger workspace</p>
            <CheckCircle2 className="shrink-0 text-emerald-300" size={17} />
          </div>
          <p className="mt-1 truncate text-sm font-semibold text-white/70">
            Trips, saved places, and support
          </p>
          <p className="mt-1 truncate text-xs font-semibold text-white/55">
            Payment service in preparation
          </p>
        </div>

        <ChevronRight className="shrink-0 text-white/60" size={19} />
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2 text-xs font-bold">
        <span className="rounded-lg bg-white/10 px-3 py-2">Wallet {getCountryCurrencyCode()} 0.00</span>
        <span className="rounded-lg bg-white/10 px-3 py-2">Safe trip tools</span>
      </div>
    </button>
  );
}

function PassengerDrawerSection({ title, children }) {
  return (
    <section className="space-y-2">
      <h3 className="px-1 text-xs font-black uppercase tracking-wide text-gray-400">
        {title}
      </h3>
      <div className="space-y-2">{children}</div>
    </section>
  );
}

function PassengerDrawerNavItem({ icon, title, description, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="kt-touchable flex w-full items-center gap-3 rounded-xl border border-gray-200 bg-white p-3 text-left shadow-sm transition hover:border-gray-300 hover:bg-gray-50 hover:shadow-md hover:shadow-slate-950/5"
    >
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gray-100 text-gray-800">
        {createElement(icon, { size: 20, strokeWidth: 2.2 })}
      </span>

      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-black text-gray-950">{title}</span>
        <span className="mt-0.5 block line-clamp-2 text-xs font-semibold leading-5 text-gray-500">
          {description}
        </span>
      </span>

      <ChevronRight className="shrink-0 text-gray-400" size={18} />
    </button>
  );
}

function MyTripsPage({ onViewFleet, onOpenSupport }) {
  const [activeTab, setActiveTab] = useState("pending");
  const [trips, setTrips] = useState(() => getPassengerTrips());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;

    function loadTrips({ quiet = false } = {}) {
      if (!quiet) setLoading(true);
      setError("");

      return fetchPassengerTrips()
      .then((items) => {
        if (alive) setTrips(items);
      })
      .catch((err) => {
        if (alive) {
          setError(err.message || "Unable to load your trips.");
          setTrips([]);
        }
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    }

    function refreshTrips() {
      loadTrips({ quiet: true });
    }

    function refreshPendingTrips() {
      setActiveTab("pending");
      loadTrips({ quiet: true });
    }

    loadTrips();
    const unsubscribe = subscribePassengerTrips(refreshTrips);
    window.addEventListener("transport-booking-created", refreshPendingTrips);
    window.addEventListener("transport-trip-updated", refreshTrips);

    return () => {
      alive = false;
      unsubscribe();
      window.removeEventListener("transport-booking-created", refreshPendingTrips);
      window.removeEventListener("transport-trip-updated", refreshTrips);
    };
  }, []);

  const pendingTrips = trips.filter((trip) => trip.group !== "previous");
  const previousTrips = trips.filter((trip) => trip.group === "previous");
  const visibleTrips = activeTab === "pending" ? pendingTrips : previousTrips;

  return (
    <div className="space-y-4">
      <InfoPanel
        icon={ReceiptText}
        tone="emerald"
        title="Passenger trip record"
        body="My trips now separates current or pending transport activity from previous completed and cancelled trips, so passengers can see what still needs attention and what has already happened."
      />

      <div className="grid grid-cols-2 gap-2 rounded-2xl border border-gray-200 bg-white p-2 shadow-sm">
        <TripTab
          label="Pending"
          count={pendingTrips.length}
          active={activeTab === "pending"}
          onClick={() => setActiveTab("pending")}
        />
        <TripTab
          label="Previous"
          count={previousTrips.length}
          active={activeTab === "previous"}
          onClick={() => setActiveTab("previous")}
        />
      </div>

      {error ? (
        <EmptyState title="Unable to load trips" body={error} />
      ) : loading ? (
        <EmptyState title="Loading trips" body="Checking your pending and previous transport records." />
      ) : visibleTrips.length === 0 ? (
        <EmptyState
          title={activeTab === "pending" ? "No pending trips" : "No previous trips"}
          body={
            activeTab === "pending"
              ? "Pending ride and delivery requests will appear here after booking."
              : "Completed and cancelled rides or deliveries will appear here."
          }
        />
      ) : (
        <div className="grid gap-3 xl:grid-cols-2">
          {visibleTrips.map((trip) => (
            <TripCard
              key={trip.id}
              trip={trip}
              onViewFleet={() => onViewFleet?.(trip.fleetId)}
              onOpenSupport={() => onOpenSupport?.(trip)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function TripTab({ label, count, active, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`kt-touchable h-11 rounded-xl text-sm font-black transition ${
        active ? "bg-emerald-600 text-white" : "bg-gray-50 text-gray-600 hover:bg-gray-100"
      }`}
    >
      {label} ({count})
    </button>
  );
}

function TripCard({ trip, onViewFleet, onOpenSupport }) {
  const isPrevious = trip.group === "previous";

  return (
    <article className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-black uppercase tracking-wide text-emerald-700">{trip.mode}</p>
          <h3 className="mt-1 truncate text-base font-black text-gray-950">{trip.title}</h3>
          <p className="mt-1 text-xs font-bold text-gray-500">{formatDate(trip.createdAt)}</p>
        </div>
        <span
          className={`shrink-0 rounded-full px-3 py-1 text-xs font-black ${
            isPrevious ? "bg-gray-100 text-gray-700" : "bg-amber-50 text-amber-700"
          }`}
        >
          {isPrevious ? "Previous" : "Pending"}
        </span>
      </div>

      <div className="mt-4 grid gap-2 text-sm font-semibold text-gray-600">
        <TripLine label="Status" value={`${trip.status} | ${trip.stage}`} />
        <TripLine label="Pickup" value={trip.pickup} />
        <TripLine label="Destination" value={trip.destination} />
        <TripLine label="Fare" value={trip.fare} />
        <TripLine label="Fleet" value={trip.fleet?.fleetName || "Fleet details unavailable"} />
      </div>

      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        <button
          type="button"
          onClick={onViewFleet}
          disabled={!trip.fleetId}
          className="kt-touchable h-11 rounded-xl bg-emerald-600 px-4 text-sm font-black text-white transition hover:bg-emerald-700 disabled:bg-gray-200 disabled:text-gray-500"
        >
          View fleet
        </button>
        <button
          type="button"
          onClick={onOpenSupport}
          className="kt-touchable h-11 rounded-xl border border-gray-200 bg-white px-4 text-sm font-black text-gray-700 transition hover:bg-gray-50"
        >
          Get support
        </button>
      </div>
    </article>
  );
}

function TripLine({ label, value }) {
  return (
    <div className="grid gap-1 rounded-xl bg-gray-50 px-3 py-2 sm:grid-cols-[92px_1fr] sm:items-center">
      <span className="text-xs font-black uppercase text-gray-400">{label}</span>
      <span className="min-w-0 break-words text-gray-700">{value}</span>
    </div>
  );
}

function SavedPlaceMenuAction({ danger = false, icon, label, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`kt-touchable flex h-11 w-full items-center gap-3 rounded-xl px-3 text-left text-sm font-black ${
        danger ? "text-rose-600 hover:bg-rose-50" : "text-gray-700 hover:bg-gray-50 hover:text-gray-950"
      }`}
    >
      {createElement(icon, { size: 17, strokeWidth: 2.3, absoluteStrokeWidth: true })}
      <span className="min-w-0 flex-1 truncate">{label}</span>
    </button>
  );
}

function SavedPlacesPage() {
  const [places, setPlaces] = useState(() => getTransportSavedPlaces());
  const [place, setPlace] = useState(createEmptyPlace);
  const [locationCandidate, setLocationCandidate] = useState(null);
  const [locationStatus, setLocationStatus] = useState("");
  const [message, setMessage] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [actionMenuId, setActionMenuId] = useState("");
  const [areaPicker, setAreaPicker] = useState(null);
  const [accountContact, setAccountContact] = useState({});
  const placePoint = place.coordinates
    ? {
        lat: place.coordinates.latitude ?? place.coordinates.lat,
        lng: place.coordinates.longitude ?? place.coordinates.lng,
        address: place.detectedAddress || place.street,
      }
    : null;
  const placeValidation = useAddressAreaValidation(place.street, { selectedPoint: placePoint });
  const savedPlacePickerLabels = useMemo(
    () => ({
      historyKey: "transport-saved-place-picker",
      backLabel: "Back to saved place",
      eyebrow: "Transport place",
      cardEyebrow: "Saved place",
      headerCurrentTitle: "Confirm saved location",
      headerDropTitle: "Drop saved-place pin",
      currentHeading: "Your current saved location",
      dropHeading: "Place the pin on the saved place",
      dropInstruction: "Move the map until the pin sits exactly on the gate, pickup side, delivery door, or landmark, then add the location.",
      currentStatus: "Confirming your current saved location...",
      dropStatus: "Move the map until the pin is exactly on the saved place.",
      currentName: "Current saved location",
      droppedName: "Pinned saved location",
    }),
    [],
  );

  useEffect(() => {
    let alive = true;
    getOnboardingProfile()
      .then((profile) => {
        if (!alive || !profile) return;
        setAccountContact(profile);
        setPlace((current) => ({
          ...current,
          contactName: current.contactName || String(profile.displayName || profile.fullName || profile.full_name || "").trim(),
          phone: current.phone || String(profile.phone || profile.phoneNumber || profile.phone_number || "").trim(),
        }));
      })
      .catch(() => null);
    return () => {
      alive = false;
    };
  }, []);

  function updatePlace(patch) {
    setPlace((current) => ({ ...current, ...patch }));
  }

  function editPlace(nextPlace) {
    setActionMenuId("");
    setPlace({ ...createEmptyPlace(), ...nextPlace });
    setLocationCandidate(null);
    setLocationStatus("");
    setMessage("");
    setFormOpen(true);
  }

  function openAddPlace() {
    setActionMenuId("");
    setPlace(createEmptyPlace(accountContact));
    setLocationCandidate(null);
    setLocationStatus("");
    setMessage("");
    setFormOpen(true);
  }

  function closeForm() {
    setActionMenuId("");
    setPlace(createEmptyPlace(accountContact));
    setLocationCandidate(null);
    setLocationStatus("");
    setAreaPicker(null);
    setFormOpen(false);
  }

  function savePlace() {
    if (!place.street.trim() && !place.detectedAddress.trim()) {
      setMessage("Add a street, landmark, or detected location before saving this place.");
      return;
    }

    const savedPlace = saveTransportSavedPlace(place);
    setPlaces(getTransportSavedPlaces());
    setPlace(createEmptyPlace(accountContact));
    setLocationCandidate(null);
    setLocationStatus("");
    setFormOpen(false);
    setMessage(`${getPlaceLabel(savedPlace)} place saved for future passenger trips.`);
  }

  function removePlace(placeId) {
    setActionMenuId("");
    setPlaces(removeTransportSavedPlace(placeId));
    if (place.id === placeId) {
      closeForm();
    }
    setMessage("Saved place removed.");
  }

  function selectPlace(nextPlace) {
    setActionMenuId("");
    selectTransportSavedPlace(nextPlace);
    setMessage(`${getPlaceLabel(nextPlace)} selected for your next transport search.`);
  }

  async function sharePlace(nextPlace) {
    setActionMenuId("");
    const text = getPlaceShareText(nextPlace);

    try {
      if (navigator.share) {
        await navigator.share({
          title: `${getPlaceLabel(nextPlace)} saved place`,
          text,
        });
        setMessage("Saved place ready to share.");
        return;
      }

      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        setMessage("Saved place details copied.");
        return;
      }

      setMessage(text);
    } catch {
      setMessage("Unable to share this place right now.");
    }
  }

  function openPlaceAreaPicker(start = "current") {
    setLocationStatus("");
    setLocationCandidate(null);
    setMessage("");
    setAreaPicker({ start });
  }

  function locateMe() {
    openPlaceAreaPicker("current");
  }

  function dropPlacePin() {
    openPlaceAreaPicker("dropPin");
  }

  function acceptAreaLocation(location) {
    const nextLocation = normalizeAreaLocation(location, place.street);
    if (!nextLocation) return;

    updatePlace({
      detectedAddress: nextLocation.address,
      street: nextLocation.address || place.street,
      coordinates: nextLocation.coordinates,
    });
    setLocationStatus(`Location added: ${nextLocation.address}`);
    setAreaPicker(null);
  }

  function confirmDetectedLocation() {
    if (!locationCandidate) return;

    updatePlace({
      detectedAddress: locationCandidate.address,
      street: place.street || locationCandidate.address,
      coordinates: {
        latitude: locationCandidate.latitude,
        longitude: locationCandidate.longitude,
      },
    });
    setLocationStatus("Location added. You can edit the street before saving.");
    setLocationCandidate(null);
  }

  function rejectDetectedLocation() {
    setLocationCandidate(null);
    setLocationStatus("Enter the address manually.");
  }

  function handleFrontPictureChange(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => updatePlace({ frontPictureUrl: String(reader.result || "") });
    reader.readAsDataURL(file);
  }

  return (
    <div className="space-y-4">
      {message ? <p className="rounded-xl bg-emerald-50 p-3 text-sm font-bold text-emerald-700">{message}</p> : null}
      {actionMenuId ? (
        <button
          type="button"
          aria-label="Close saved place actions"
          className="fixed inset-0 z-10 cursor-default bg-transparent"
          onClick={() => setActionMenuId("")}
        />
      ) : null}

      {places.length ? (
        <div className="space-y-2">
          <p className="text-sm font-black text-gray-950">Saved places</p>
          {places.map((item) => {
            const actionKey = item.id || `${item.category}-${item.street || item.detectedAddress || "place"}`;

            return (
            <article
              key={actionKey}
              className="kt-touchable relative rounded-xl border border-gray-200 bg-white p-3 text-left shadow-sm"
            >
              <div className="flex items-start justify-between gap-3">
                <button type="button" onClick={() => editPlace(item)} className="kt-touchable min-w-0 flex-1 text-left">
                  <p className="text-sm font-black text-gray-950">{getPlaceLabel(item)} place</p>
                  <p className="mt-1 line-clamp-2 text-xs font-semibold leading-5 text-gray-500">
                    {item.street || item.detectedAddress}
                  </p>
                </button>
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    setActionMenuId((current) => (current === actionKey ? "" : actionKey));
                  }}
                  className="kt-touchable flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-gray-200 bg-white text-gray-500 hover:bg-gray-50 hover:text-gray-950"
                  aria-label={`${getPlaceLabel(item)} place actions`}
                  aria-expanded={actionMenuId === actionKey}
                >
                  <MoreHorizontal size={18} />
                </button>
              </div>
              {actionMenuId === actionKey ? (
                <div className="kt-modal-enter absolute right-3 top-12 z-30 w-56 overflow-hidden rounded-2xl border border-gray-200 bg-white p-1.5 shadow-2xl shadow-slate-950/10">
                  <SavedPlaceMenuAction icon={Navigation} label="Use for next trip" onClick={() => selectPlace(item)} />
                  <SavedPlaceMenuAction icon={Pencil} label="Edit place" onClick={() => editPlace(item)} />
                  <SavedPlaceMenuAction icon={Share2} label="Share details" onClick={() => sharePlace(item)} />
                  <SavedPlaceMenuAction danger icon={Trash2} label="Delete place" onClick={() => removePlace(item.id)} />
                </div>
              ) : null}
            </article>
            );
          })}
        </div>
      ) : null}

      {!formOpen ? (
        <button
          type="button"
          onClick={openAddPlace}
          className="kt-touchable inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 text-sm font-black text-white shadow-sm hover:bg-emerald-700"
        >
          <Plus size={17} />
          {places.length ? "Add Another Location" : "Add Location"}
        </button>
      ) : null}

      {formOpen ? (
        <div className="grid gap-3 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-black text-gray-950">
                {place.id ? "Edit saved location" : "Add location"}
              </p>
              <p className="mt-1 text-xs font-semibold leading-5 text-gray-500">
                Save clear pickup, drop-off, or delivery details for future transport bookings.
              </p>
            </div>
            <button
              type="button"
              onClick={closeForm}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-gray-200 text-gray-500 hover:bg-gray-50"
              aria-label="Close location form"
            >
              <X size={16} />
            </button>
          </div>

        <label className="space-y-1">
          <span className="text-xs font-black uppercase text-gray-500">Location category</span>
          <select
            value={place.category}
            onChange={(event) => updatePlace({ category: event.target.value })}
            className="h-12 w-full rounded-xl border border-gray-200 bg-gray-50 px-3 text-sm font-black text-gray-950 outline-none focus:border-emerald-500"
          >
            {placeTypes.map((type) => (
              <option key={type} value={type}>{type}</option>
            ))}
          </select>
        </label>

        {place.category === "Other" ? (
          <label className="space-y-1">
            <span className="text-xs font-black uppercase text-gray-500">Custom category</span>
            <input
              value={place.customCategory}
              onChange={(event) => updatePlace({ customCategory: event.target.value })}
              placeholder="Eg. Clinic, church, garage"
              className="h-12 w-full rounded-xl border border-gray-200 bg-gray-50 px-3 text-sm font-semibold outline-none focus:border-emerald-500"
            />
          </label>
        ) : null}

        <label className="space-y-1">
          <span className="text-xs font-black uppercase text-gray-500">Place name</span>
          <input
            value={place.placeName}
            onChange={(event) => updatePlace({ placeName: event.target.value })}
            placeholder="Eg. Home gate, office entrance, school pickup"
            className="h-12 w-full rounded-xl border border-gray-200 bg-gray-50 px-3 text-sm font-semibold outline-none focus:border-emerald-500"
          />
        </label>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="space-y-1">
            <span className="text-xs font-black uppercase text-gray-500">Contact name</span>
            <input
              value={place.contactName}
              onChange={(event) => updatePlace({ contactName: event.target.value })}
              placeholder="Passenger or receiver"
              className="h-12 w-full rounded-xl border border-gray-200 bg-gray-50 px-3 text-sm font-semibold outline-none focus:border-emerald-500"
            />
          </label>
          <label className="space-y-1">
            <span className="text-xs font-black uppercase text-gray-500">Phone number</span>
            <input
              value={place.phone}
              onChange={(event) => updatePlace({ phone: event.target.value })}
              placeholder="Phone number"
              className="h-12 w-full rounded-xl border border-gray-200 bg-gray-50 px-3 text-sm font-semibold outline-none focus:border-emerald-500"
            />
          </label>
        </div>

        <label className="space-y-1">
          <span className="inline-flex items-center gap-2 text-xs font-black uppercase text-gray-500">
            Street / landmark
            <AddressAreaStatusIcon status={placeValidation.status} />
          </span>
          <div className="grid gap-2 sm:grid-cols-[1fr_auto_auto]">
            <input
              value={place.street}
              onChange={(event) => updatePlace({ street: event.target.value })}
              placeholder="Street, city, junction, or landmark"
              className="h-12 w-full rounded-xl border border-gray-200 bg-gray-50 px-3 text-sm font-semibold outline-none focus:border-emerald-500"
            />
            <button
              type="button"
              onClick={locateMe}
              className="kt-touchable inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-gray-950 px-4 text-sm font-black text-white transition hover:bg-gray-800"
            >
              <LocateFixed size={16} />
              Locate me
            </button>
            <button
              type="button"
              onClick={dropPlacePin}
              className="kt-touchable inline-flex h-12 items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white px-4 text-sm font-black text-gray-700 transition hover:bg-gray-50"
            >
              <MapPin size={16} />
              Drop a pin
            </button>
          </div>
        </label>

        <AddressAreaResolutionCard
          validation={placeValidation}
          onLocateMe={locateMe}
          onDropPin={dropPlacePin}
        />

        {locationCandidate ? (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3">
            <p className="text-sm font-black text-emerald-950">
              Your current location is {locationCandidate.address}
            </p>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              <button
                type="button"
                onClick={confirmDetectedLocation}
                className="kt-touchable inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-emerald-600 px-3 text-xs font-black text-white hover:bg-emerald-700"
              >
                <CheckCircle2 size={15} />
                Correct, add location
              </button>
              <button
                type="button"
                onClick={rejectDetectedLocation}
                className="kt-touchable h-10 rounded-lg border border-gray-200 bg-white px-3 text-xs font-black text-gray-700 hover:bg-gray-50"
              >
                Wrong, enter manually
              </button>
            </div>
          </div>
        ) : null}

        <label className="space-y-1">
          <span className="text-xs font-black uppercase text-gray-500">Pickup / delivery note</span>
          <textarea
            value={place.note}
            onChange={(event) => updatePlace({ note: event.target.value })}
            placeholder="Gate color, nearby shop, safest pickup side, floor, or rider note"
            rows={3}
            className="w-full resize-none rounded-xl border border-gray-200 bg-gray-50 px-3 py-3 text-sm font-semibold outline-none focus:border-emerald-500"
          />
        </label>

        <label className="space-y-2">
          <span className="text-xs font-black uppercase text-gray-500">Place front picture</span>
          <div className="grid gap-3 sm:grid-cols-[120px_1fr]">
            <div className="flex aspect-square items-center justify-center overflow-hidden rounded-xl border border-dashed border-gray-300 bg-gray-50">
              {place.frontPictureUrl ? (
                <img src={place.frontPictureUrl} alt="" className="h-full w-full object-cover" />
              ) : (
                <Camera className="text-gray-400" size={30} />
              )}
            </div>
            <div className="flex flex-col justify-center">
              <input
                type="file"
                accept="image/*"
                onChange={handleFrontPictureChange}
                className="text-sm font-semibold text-gray-600 file:mr-3 file:rounded-lg file:border-0 file:bg-gray-950 file:px-3 file:py-2 file:text-xs file:font-black file:text-white"
              />
              <p className="mt-2 text-xs font-semibold leading-5 text-gray-500">
                Add a clear front-facing picture of the gate, junction, building, or pickup point.
              </p>
            </div>
          </div>
        </label>

        {place.detectedAddress ? (
          <p className="rounded-xl bg-gray-50 p-3 text-xs font-bold leading-5 text-gray-600">
            Detected location: {place.detectedAddress}
          </p>
        ) : null}
        {locationStatus ? <p className="text-sm font-bold text-gray-600">{locationStatus}</p> : null}
        </div>
      ) : null}

      {formOpen ? (
        <button
          type="button"
          onClick={savePlace}
          className="kt-touchable h-12 w-full rounded-xl bg-emerald-600 px-4 text-sm font-black text-white shadow-sm hover:bg-emerald-700"
        >
          {place.id ? "Update Transport Place" : "Save Transport Place"}
        </button>
      ) : null}

      {areaPicker ? (
        <div className="fixed inset-0 z-[1300] bg-slate-950">
          <NearbyAreaScreen
            mode="businessLocationPicker"
            pickerStart={areaPicker.start}
            pickerLabels={savedPlacePickerLabels}
            backLabel="Back to saved place"
            onBack={() => setAreaPicker(null)}
            onLocationPicked={acceptAreaLocation}
          />
        </div>
      ) : null}
    </div>
  );
}

function PaymentReadinessPage({ variant }) {
  const [paymentNote, setPaymentNote] = useState(() => readLocalText(TRANSPORT_PAYMENT_NOTE_KEY));
  const [message, setMessage] = useState("");
  const isWallet = variant === "wallet";

  function savePaymentNote() {
    writeLocalText(TRANSPORT_PAYMENT_NOTE_KEY, paymentNote);
    setMessage("Payment note saved on this device.");
  }

  return (
    <div className="space-y-4">
      {message ? <p className="rounded-xl bg-emerald-50 p-3 text-sm font-bold text-emerald-700">{message}</p> : null}

      <InfoPanel
        icon={isWallet ? CreditCard : ShieldAlert}
        tone="amber"
        title={isWallet ? "Transport wallet is being prepared" : "Payment safety"}
        body="KunThai transport payments and wallet top-up are not active yet. We are holding this field until payments can be connected to a verified trip, a verified operator, a receipt, and a clear support record. That is safer for passengers and more professional for operators than showing a payment form before the service can protect the transaction."
      />

      <section className="grid gap-3 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
        <PaymentGuideline
          title="For now"
          body="Confirm the route, fare, operator identity, fleet plate, pickup point, destination, and expected payment method before you pay."
        />
        <PaymentGuideline
          title="Do not share secrets"
          body="Never enter or send wallet PINs, OTPs, full card details, or account passwords through a trip message or support note."
        />
        <PaymentGuideline
          title="Keep proof"
          body="Keep the trip record, operator name, payment confirmation, and conversation visible until the ride or delivery is completed."
        />
      </section>

      {isWallet ? (
        <section className="space-y-3 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
          <div>
            <p className="text-sm font-black text-gray-950">Temporary passenger payment note</p>
            <p className="mt-1 text-xs font-semibold leading-5 text-gray-500">
              This is a private note for your own reminder. It is not a live payment method.
            </p>
          </div>
          <textarea
            value={paymentNote}
            onChange={(event) => setPaymentNote(event.target.value)}
            placeholder="Cash, mobile money after confirmation, or preferred fare arrangement"
            rows={4}
            className="w-full resize-none rounded-xl border border-gray-200 bg-gray-50 px-3 py-3 text-sm font-semibold outline-none focus:border-emerald-500"
          />
          <button
            type="button"
            onClick={savePaymentNote}
            className="kt-touchable h-11 rounded-xl bg-emerald-600 px-4 text-sm font-black text-white hover:bg-emerald-700"
          >
            Save Payment Note
          </button>
        </section>
      ) : null}
    </div>
  );
}

function PaymentGuideline({ title, body }) {
  return (
    <article className="rounded-xl bg-gray-50 p-3">
      <p className="text-sm font-black text-gray-950">{title}</p>
      <p className="mt-1 text-xs font-semibold leading-5 text-gray-500">{body}</p>
    </article>
  );
}

const passengerSafetyTopics = [
  {
    title: "What KunThai can do",
    body:
      "KunThai can help passengers make safer decisions by showing operator profiles, fleet details, saved places, route context, support records, and safety reminders. The app can also help you keep evidence of what was agreed before and during a trip. KunThai cannot physically rescue a passenger, physically control an operator, or replace police, ambulance, fire service, family, or trusted people nearby.",
  },
  {
    title: "Before pickup",
    body:
      "Confirm the operator name, fleet type, plate number, pickup point, destination, estimated fare, and contact phone before you enter the vehicle. If the person or vehicle does not match the app information, do not enter. Move to a visible public place and contact support or a trusted person.",
  },
  {
    title: "Pickup location safety",
    body:
      "Use saved places, Locate Me, or Drop Pin to make pickup points clear. A clear pickup point helps the right operator find you and reduces confusion. When possible, wait in a place with lighting, people nearby, and a clear route to leave if something feels wrong.",
  },
  {
    title: "During the trip",
    body:
      "Keep your phone available, watch the route, and speak early if the route changes without explanation. Do not share private passwords, PINs, OTPs, full card details, or sensitive personal information. If the operator becomes unsafe, ask to stop at a public place when it is safe to do so.",
  },
  {
    title: "Emergency action",
    body:
      "If there is immediate danger, call local emergency services first. After emergency help is contacted, use KunThai support to record the trip, operator, location, time, route, and what happened. The app record helps follow-up, but emergency responders and trusted people nearby should come first.",
  },
  {
    title: "Share proof and location",
    body:
      "Before or during a trip, share your route, operator name, plate number, and pickup or destination details with someone you trust. If a trip feels unusual, send a short message with your current location and what is happening before your battery or signal becomes a problem.",
  },
  {
    title: "Fare and payment safety",
    body:
      "Agree on the fare method before the trip starts. Keep payment proof when money changes hands. If there is a fare disagreement, avoid arguing in an unsafe place; record the details and report through support after you are safe.",
  },
  {
    title: "Delivery safety",
    body:
      "For delivery, confirm the receiver name, phone number, pickup address, drop-off address, item description, and payment responsibility. Do not send prohibited, dangerous, or unclear items. Use photos or notes when the pickup or delivery point may be confusing.",
  },
  {
    title: "Reporting concerns",
    body:
      "Report unsafe driving, harassment, threats, damaged fleet, wrong operator, suspicious route changes, delivery issues, or payment disputes with as much detail as possible. Good reports include time, route, plate number, operator name, screenshots, photos where safe, and a calm description of what happened.",
  },
];

function PassengerSafetyPage() {
  return (
    <div className="space-y-4">
      <InfoPanel
        icon={LifeBuoy}
        tone="red"
        title="Safety & emergency guidance"
        body="KunThai is designed to guide safer transport decisions, keep useful records, and make reporting clearer. In immediate danger, local emergency help and trusted people nearby should be contacted first."
      />

      <section className="rounded-2xl border border-red-100 bg-red-50 p-4">
        <p className="text-sm font-black text-red-800">Immediate danger comes first</p>
        <p className="mt-1 text-xs font-semibold leading-5 text-red-700">
          If a passenger, operator, child, receiver, or bystander may be harmed, do not wait for an app response. Call local emergency help, move to a safer public place if possible, and contact someone trusted nearby.
        </p>
      </section>

      <section className="grid gap-3">
        {passengerSafetyTopics.map((topic, index) => (
          <SafetyTopicCard key={topic.title} number={index + 1} topic={topic} />
        ))}
      </section>

      <section className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
        <p className="text-sm font-black text-gray-950">What to keep ready</p>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {[
            "Operator name and fleet plate",
            "Pickup and destination",
            "Current location or nearest landmark",
            "Trip time and fare agreement",
            "Photos or screenshots when safe",
            "Trusted contact phone number",
          ].map((item) => (
            <span key={item} className="rounded-xl bg-gray-50 px-3 py-2 text-xs font-black text-gray-600">
              {item}
            </span>
          ))}
        </div>
      </section>
    </div>
  );
}

function SafetyTopicCard({ number, topic }) {
  return (
    <article className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
      <div className="flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-sm font-black text-emerald-700">
          {number}
        </span>
        <div>
          <h3 className="text-sm font-black text-gray-950">{topic.title}</h3>
          <p className="mt-1 text-xs font-semibold leading-5 text-gray-600">{topic.body}</p>
        </div>
      </div>
    </article>
  );
}

function SupportPage({ seed }) {
  const [form, setForm] = useState({
    topic: seed?.topic || "Trip issue",
    priority: "Normal",
    tripReference: "",
    contact: "",
    details: seed?.details || "",
  });
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (!seed) return;
    setForm((current) => ({
      ...current,
      topic: seed.topic || current.topic,
      details: seed.details || current.details,
    }));
  }, [seed]);

  function updateForm(patch) {
    setForm((current) => ({ ...current, ...patch }));
  }

  async function prepareSupportRequest() {
    if (form.details.trim().length < 12) {
      setMessage("Add a clear description so support can understand the transport issue.");
      return;
    }

    setSending(true);
    setMessage("");
    try {
      await submitTransportSupportTicket({
        topic: form.topic,
        priority: String(form.priority || "normal").toLowerCase(),
        body: [
          form.tripReference ? `Trip reference: ${form.tripReference}` : "",
          form.contact ? `Preferred contact: ${form.contact}` : "",
          form.details.trim(),
        ].filter(Boolean).join("\n"),
      });
      setMessage("Support request sent to KunThai UrRide.");
    } catch (error) {
      setMessage(error.message || "Unable to send this support request. Please try again.");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="space-y-4">
      {message ? (
        <p className={`rounded-xl p-3 text-sm font-bold ${message.startsWith("Add") ? "bg-amber-50 text-amber-700" : "bg-emerald-50 text-emerald-700"}`}>
          {message}
        </p>
      ) : null}

      <InfoPanel
        icon={LifeBuoy}
        tone="emerald"
        title="Passenger support"
        body="Transport support should keep the trip, operator, location, fare expectation, and safety context together. Clear reports help the platform resolve issues faster and protect serious passengers and operators."
      />

      <section className="grid gap-3 sm:grid-cols-2">
        {[
          ["Trip issue", "Wrong route, no-show, late pickup, or trip cancellation."],
          ["Safety report", "Unsafe driving, harassment, damaged vehicle, or urgent risk."],
          ["Payment question", "Fare disagreement, duplicate payment, or unclear charge."],
          ["Saved place", "Wrong pickup point, location problem, or address correction."],
        ].map(([title, body]) => (
          <button
            key={title}
            type="button"
            onClick={() => updateForm({ topic: title })}
            className={`kt-touchable rounded-2xl border p-4 text-left shadow-sm transition ${
              form.topic === title ? "border-emerald-300 bg-emerald-50" : "border-gray-200 bg-white hover:border-gray-300"
            }`}
          >
            <p className="text-sm font-black text-gray-950">{title}</p>
            <p className="mt-1 text-xs font-semibold leading-5 text-gray-500">{body}</p>
          </button>
        ))}
      </section>

      <section className="grid gap-3 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="space-y-1">
            <span className="text-xs font-black uppercase text-gray-500">Topic</span>
            <select
              value={form.topic}
              onChange={(event) => updateForm({ topic: event.target.value })}
              className="h-12 w-full rounded-xl border border-gray-200 bg-gray-50 px-3 text-sm font-black text-gray-950 outline-none focus:border-emerald-500"
            >
              <option>Trip issue</option>
              <option>Safety report</option>
              <option>Payment question</option>
              <option>Saved place</option>
              <option>Operator feedback</option>
            </select>
          </label>
          <label className="space-y-1">
            <span className="text-xs font-black uppercase text-gray-500">Priority</span>
            <select
              value={form.priority}
              onChange={(event) => updateForm({ priority: event.target.value })}
              className="h-12 w-full rounded-xl border border-gray-200 bg-gray-50 px-3 text-sm font-black text-gray-950 outline-none focus:border-emerald-500"
            >
              <option>Normal</option>
              <option>Urgent</option>
              <option>Safety critical</option>
            </select>
          </label>
        </div>

        <label className="space-y-1">
          <span className="text-xs font-black uppercase text-gray-500">Trip reference</span>
          <input
            value={form.tripReference}
            onChange={(event) => updateForm({ tripReference: event.target.value })}
            placeholder="Trip title, operator name, plate number, or route"
            className="h-12 w-full rounded-xl border border-gray-200 bg-gray-50 px-3 text-sm font-semibold outline-none focus:border-emerald-500"
          />
        </label>

        <label className="space-y-1">
          <span className="text-xs font-black uppercase text-gray-500">Contact for follow-up</span>
          <input
            value={form.contact}
            onChange={(event) => updateForm({ contact: event.target.value })}
            placeholder="Phone or email"
            className="h-12 w-full rounded-xl border border-gray-200 bg-gray-50 px-3 text-sm font-semibold outline-none focus:border-emerald-500"
          />
        </label>

        <label className="space-y-1">
          <span className="text-xs font-black uppercase text-gray-500">What happened?</span>
          <textarea
            value={form.details}
            onChange={(event) => updateForm({ details: event.target.value })}
            placeholder="Explain the route, operator, fare, pickup point, time, and the exact issue."
            rows={5}
            className="w-full resize-none rounded-xl border border-gray-200 bg-gray-50 px-3 py-3 text-sm font-semibold outline-none focus:border-emerald-500"
          />
        </label>

        <button
          type="button"
          onClick={prepareSupportRequest}
          disabled={sending}
          className="kt-touchable h-12 rounded-xl bg-emerald-600 px-4 text-sm font-black text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {sending ? "Sending…" : "Send Support Request"}
        </button>
      </section>

      <section className="rounded-2xl border border-red-100 bg-red-50 p-4">
        <p className="text-sm font-black text-red-800">Safety first</p>
        <p className="mt-1 text-xs font-semibold leading-5 text-red-700">
          If a passenger is in immediate danger, contact local emergency help first. Transport support should follow after the person is safe.
        </p>
      </section>
    </div>
  );
}

function TransportSettingsPage() {
  const [settings, setSettings] = useState(() => getTransportPassengerSettings());
  const [message, setMessage] = useState("");
  const defaultRideTypeOptions = useMemo(
    () => ["Any available", ...getRideFleetOptions().map((option) => option.label), "Delivery"],
    [],
  );

  useEffect(() => {
    if (defaultRideTypeOptions.includes(settings.defaultRideType)) return;
    updateSettings({ defaultRideType: "Any available" });
  }, [defaultRideTypeOptions, settings.defaultRideType]);

  function updateSettings(patch) {
    setSettings((current) => ({ ...current, ...patch }));
  }

  function saveSettings() {
    setSettings(saveTransportPassengerSettings(settings));
    setMessage("Transport settings saved.");
  }

  return (
    <div className="space-y-4">
      {message ? <p className="rounded-xl bg-emerald-50 p-3 text-sm font-bold text-emerald-700">{message}</p> : null}

      <InfoPanel
        icon={Settings}
        tone="blue"
        title="Passenger transport settings"
        body="Transport settings are useful because passengers need practical control over alerts, privacy, saved place suggestions, and how operators appear during ride or delivery searches."
      />

      <section className="grid gap-3 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
        <SettingToggle
          label="Trip alerts"
          description="Notify me about pending trip updates and operator responses."
          checked={settings.tripAlerts}
          onChange={() => updateSettings({ tripAlerts: !settings.tripAlerts })}
        />
        <SettingToggle
          label="Nearby operator alerts"
          description="Show active operators when I am searching from a saved area."
          checked={settings.nearbyOperators}
          onChange={() => updateSettings({ nearbyOperators: !settings.nearbyOperators })}
        />
        <SettingToggle
          label="Safety reminders"
          description="Show reminders for plate checks, fare confirmation, and trip proof."
          checked={settings.safetyReminders}
          onChange={() => updateSettings({ safetyReminders: !settings.safetyReminders })}
        />
        <SettingToggle
          label="Saved place suggestions"
          description="Use saved places to speed up pickup and delivery forms."
          checked={settings.savedPlaceSuggestions}
          onChange={() => updateSettings({ savedPlaceSuggestions: !settings.savedPlaceSuggestions })}
        />
      </section>

      <section className="grid gap-3 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
        <label className="space-y-1">
          <span className="text-xs font-black uppercase text-gray-500">Language</span>
          <select
            value={settings.language}
            onChange={(event) => updateSettings({ language: event.target.value })}
            className="h-12 w-full rounded-xl border border-gray-200 bg-gray-50 px-3 text-sm font-black text-gray-950 outline-none focus:border-emerald-500"
          >
            <option>English</option>
            <option>Krio</option>
            <option>French</option>
          </select>
        </label>

        <label className="space-y-1">
          <span className="text-xs font-black uppercase text-gray-500">Default ride type</span>
          <select
            value={settings.defaultRideType}
            onChange={(event) => updateSettings({ defaultRideType: event.target.value })}
            className="h-12 w-full rounded-xl border border-gray-200 bg-gray-50 px-3 text-sm font-black text-gray-950 outline-none focus:border-emerald-500"
          >
            {defaultRideTypeOptions.map((option) => (
              <option key={option}>{option}</option>
            ))}
          </select>
        </label>

        <label className="space-y-1">
          <span className="text-xs font-black uppercase text-gray-500">Location privacy</span>
          <select
            value={settings.privacyMode}
            onChange={(event) => updateSettings({ privacyMode: event.target.value })}
            className="h-12 w-full rounded-xl border border-gray-200 bg-gray-50 px-3 text-sm font-black text-gray-950 outline-none focus:border-emerald-500"
          >
            <option>Balanced</option>
            <option>Precise only during booking</option>
            <option>Manual addresses only</option>
          </select>
        </label>
      </section>

      <section className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gray-100 text-gray-800">
            <LockKeyhole size={19} />
          </span>
          <div>
            <p className="text-sm font-black text-gray-950">Privacy guardrail</p>
            <p className="mt-1 text-xs font-semibold leading-5 text-gray-500">
              Saved places and precise coordinates should support trip matching and delivery handling. They should not become public profile information.
            </p>
          </div>
        </div>
      </section>

      <button
        type="button"
        onClick={saveSettings}
        className="h-12 w-full rounded-xl bg-emerald-600 px-4 text-sm font-black text-white shadow-sm hover:bg-emerald-700"
      >
        Save Transport Settings
      </button>
    </div>
  );
}

function SettingToggle({ label, description, checked, onChange }) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-xl bg-gray-50 px-3 py-3">
      <div className="min-w-0">
        <p className="text-sm font-black text-gray-950">{label}</p>
        <p className="mt-0.5 text-xs font-semibold leading-5 text-gray-500">{description}</p>
      </div>
      <button
        type="button"
        aria-pressed={checked}
        onClick={onChange}
        className={`relative h-8 w-14 shrink-0 rounded-full border transition ${
          checked ? "border-emerald-500 bg-emerald-600" : "border-gray-300 bg-gray-200"
        }`}
      >
        <span
          className={`absolute top-1 h-6 w-6 rounded-full bg-white shadow transition ${
            checked ? "left-7" : "left-1"
          }`}
        />
      </button>
    </div>
  );
}

function InfoPanel({ icon, tone = "emerald", title, body }) {
  const toneClass =
    tone === "amber"
      ? "bg-amber-50 text-amber-700"
      : tone === "blue"
        ? "bg-blue-50 text-blue-700"
        : tone === "red"
          ? "bg-red-50 text-red-700"
          : "bg-emerald-50 text-emerald-700";

  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
      <span className={`flex h-12 w-12 items-center justify-center rounded-xl ${toneClass}`}>
        {createElement(icon, { size: 24 })}
      </span>
      <h4 className="mt-4 text-xl font-black text-gray-950">{title}</h4>
      <p className="mt-2 text-sm font-semibold leading-7 text-gray-600">{body}</p>
    </section>
  );
}

function EmptyState({ title, body }) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-6 text-center shadow-sm">
      <HelpCircle className="mx-auto text-gray-400" size={34} />
      <h3 className="mt-3 text-base font-black text-gray-950">{title}</h3>
      <p className="mt-2 text-sm font-semibold leading-6 text-gray-500">{body}</p>
    </div>
  );
}
