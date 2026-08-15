import { createElement, useEffect, useMemo, useRef, useState } from "react";
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
  Siren,
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
import EmergencySheet from "../../emergency/EmergencySheet";
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
import { getActiveCountryProfile, getCountryCurrencyCode } from "../../../data/globalCountryProfiles";
import {
  resolveCurrentCountry,
  applyBorderConfirmation,
} from "../../../Backend/services/countryResolution/countryResolutionService";
import { getRideFleetOptions } from "../../../data/globalTransportCapabilities";
import { getOnboardingProfile } from "../../../Backend/services/onboardingService";
import { submitTransportSupportTicket } from "../../services/bookingService";
import TransportCautionCard from "../shared/TransportCautionCard";
import { useI18n, t } from "../../../i18n";
import { t as i18nText } from "../../../i18n/index";

const TRANSPORT_PAYMENT_NOTE_KEY = "kuntai.transport.paymentNote";

// Stable category values (stored on the place and compared against "Other");
// display labels resolve through this map so translation never changes storage.
const placeTypes = ["Home", "Work", "School", "Market", "Bus stop", "Other"];
const PLACE_TYPE_LABEL_KEYS = {
  Home: "urride.menu.placeHome",
  Work: "urride.menu.placeWork",
  School: "urride.menu.placeSchool",
  Market: "urride.menu.placeMarket",
  "Bus stop": "urride.menu.placeBusStop",
  Other: "urride.menu.placeOther",
};

// `id` is the stable screen identifier used by control flow; title/description
// are translation keys resolved at render so the menu follows the locale.
const menuSections = [
  {
    sectionKey: "urride.menu.sectionTravel",
    items: [
      { id: "caution", icon: BookOpenCheck, titleKey: "urride.menu.cautionTitle", descKey: "urride.menu.cautionDesc" },
      { id: "trips", icon: History, titleKey: "urride.menu.tripsTitle", descKey: "urride.menu.tripsDesc" },
      { id: "places", icon: MapPin, titleKey: "urride.menu.placesTitle", descKey: "urride.menu.placesDesc" },
    ],
  },
  {
    sectionKey: "urride.menu.sectionMoney",
    items: [
      { id: "wallet", icon: CreditCard, titleKey: "urride.menu.walletTitle", descKey: "urride.menu.walletDesc" },
      { id: "paymentSafety", icon: ShieldAlert, titleKey: "urride.menu.paymentSafetyTitle", descKey: "urride.menu.paymentSafetyDesc" },
      { id: "safety", icon: LifeBuoy, titleKey: "urride.menu.safetyTitle", descKey: "urride.menu.safetyDesc" },
    ],
  },
  {
    sectionKey: "urride.menu.sectionHelp",
    items: [
      { id: "support", icon: LifeBuoy, titleKey: "urride.menu.supportTitle", descKey: "urride.menu.supportDesc" },
      { id: "settings", icon: Settings, titleKey: "urride.menu.settingsTitle", descKey: "urride.menu.settingsDesc" },
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
  if (place.category === "Other") return place.customCategory || t("urride.menu.placeOther");
  const key = PLACE_TYPE_LABEL_KEYS[place.category];
  return key ? t(key) : place.category || t("urride.menu.placeHome");
}

function getPlaceShareText(place) {
  const label = getPlaceLabel(place);
  const address = place.street || place.detectedAddress || t("urride.menu.places.addressPending");
  const note = place.note ? `\n${t("urride.menu.places.shareNoteLine", { note: place.note })}` : "";
  return `${t("urride.menu.places.shareText", { label })}\n${address}${note}`;
}

function formatDate(value) {
  if (!value) return t("urride.menu.trips.datePending");
  return new Date(value).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function findMenuItem(screenId) {
  return menuSections.flatMap((section) => section.items).find((item) => item.id === screenId);
}

export default function TransportMenuDrawer({ open, onClose, onViewFleet, onOpenEmergencyArea }) {
  const { locale } = useI18n();
  const [activeScreen, setActiveScreen] = useState(null);
  const [supportSeed, setSupportSeed] = useState(null);
  const { visibleKey: visibleScreen, action: screenAction } = useSlidePanel(activeScreen);
  const activeTitle = useMemo(
    () => {
      const item = findMenuItem(visibleScreen || activeScreen);
      return item ? t(item.titleKey) : t("urride.menu.passengerMenu");
    },
    [activeScreen, visibleScreen, locale],
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
      details: t("urride.menu.trips.seedDetails", {
        title: trip.title || t("urride.menu.trips.seedTitle"),
        pickup: trip.pickup || t("urride.menu.trips.seedPickup"),
        destination: trip.destination || t("urride.menu.trips.seedDestination"),
      }),
    });
    setActiveScreen("support");
  }

  function openSafetyEmergencyArea(searchType = "") {
    closeDrawer();
    onOpenEmergencyArea?.(searchType);
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
      return <PassengerSafetyPage onOpenEmergencyArea={openSafetyEmergencyArea} />;
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
      className={`kt-mobile-screen fixed inset-0 z-[1200] overflow-hidden ${open ? "pointer-events-auto" : "pointer-events-none"}`}
    >
      <button
        type="button"
        aria-label={t("urride.menu.close")}
        onClick={closeDrawer}
        tabIndex={open ? 0 : -1}
        className={`absolute inset-0 border-0 bg-slate-950/45 p-0 backdrop-blur-sm transition-opacity duration-300 ${
          open ? "opacity-100" : "opacity-0"
        }`}
      />

      <aside
        aria-hidden={Boolean(visibleScreen)}
        inert={visibleScreen ? "true" : undefined}
        className={`kt-urmall-screen-panel absolute right-0 top-0 flex w-full max-w-md transform flex-col overflow-hidden bg-gray-50 shadow-2xl transition-transform duration-300 ${
          open ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <PassengerMenuHeader title={t("urride.menu.passengerMenu")} showBack={false} onClose={closeDrawer} />

        <div className="kt-safe-scroll-bottom min-h-0 flex-1 overflow-y-auto">
          <PassengerSummaryCard onOpenWallet={() => setActiveScreen("wallet")} />

          <div className="space-y-5 px-4 pt-5">
            {menuSections.map((section) => (
              <PassengerDrawerSection key={section.sectionKey} title={t(section.sectionKey)}>
                {section.items.map((item) => (
                  <PassengerDrawerNavItem
                    key={item.id}
                    icon={item.icon}
                    title={t(item.titleKey)}
                    description={t(item.descKey)}
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
          className="kt-safe-screen bg-white"
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
          <div className="kt-safe-scroll-bottom min-h-0 flex-1 overflow-y-auto bg-gray-50 px-4 pt-4 sm:px-6 lg:px-8">
            {renderActiveScreen(visibleScreen)}
          </div>
        </SlidePanel>
      ) : null}
    </div>
    </AppPortal>
  );
}

function PassengerMenuHeader({ title, showBack, onBack, onClose }) {
  useI18n();
  const backHandler = showBack ? onBack : onClose;
  const backLabel = showBack ? t("urride.menu.backToMenu") : t("urride.menu.backToTransport");

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
  useI18n();
  return (
    <header className="kt-header-glass sticky top-0 z-30 px-4 py-3 sm:px-6">
      <div className="flex min-w-0 items-start gap-3">
        <AppBackTab
          onBack={onBack}
          label={t("urride.menu.back")}
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
  useI18n();
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
            <p className="truncate text-base font-black">{t("urride.menu.workspace")}</p>
            <CheckCircle2 className="shrink-0 text-emerald-300" size={17} />
          </div>
          <p className="mt-1 truncate text-sm font-semibold text-white/70">
            {t("urride.menu.workspaceSub")}
          </p>
          <p className="mt-1 truncate text-xs font-semibold text-white/55">
            {t("urride.menu.workspacePayment")}
          </p>
        </div>

        <ChevronRight className="shrink-0 text-white/60" size={19} />
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2 text-xs font-bold">
        <span className="rounded-lg bg-white/10 px-3 py-2">{t("urride.menu.walletBalance", { currency: getCountryCurrencyCode() })}</span>
        <span className="rounded-lg bg-white/10 px-3 py-2">{t("urride.menu.safeTripTools")}</span>
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
  useI18n();
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
          setError(err.message || t("urride.menu.trips.loadError"));
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
        title={t("urride.menu.trips.recordTitle")}
        body={t("urride.menu.trips.recordBody")}
      />

      <div className="grid grid-cols-2 gap-2 rounded-2xl border border-gray-200 bg-white p-2 shadow-sm">
        <TripTab
          label={t("urride.menu.trips.tabPending")}
          count={pendingTrips.length}
          active={activeTab === "pending"}
          onClick={() => setActiveTab("pending")}
        />
        <TripTab
          label={t("urride.menu.trips.tabPrevious")}
          count={previousTrips.length}
          active={activeTab === "previous"}
          onClick={() => setActiveTab("previous")}
        />
      </div>

      {error ? (
        <EmptyState title={t("urride.menu.trips.errorTitle")} body={error} />
      ) : loading ? (
        <EmptyState title={t("urride.menu.trips.loadingTitle")} body={t("urride.menu.trips.loadingBody")} />
      ) : visibleTrips.length === 0 ? (
        <EmptyState
          title={activeTab === "pending" ? t("urride.menu.trips.noPendingTitle") : t("urride.menu.trips.noPreviousTitle")}
          body={
            activeTab === "pending"
              ? t("urride.menu.trips.noPendingBody")
              : t("urride.menu.trips.noPreviousBody")
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
  useI18n();
  return (
    <button
      type="button"
      onClick={onClick}
      className={`kt-touchable h-11 rounded-xl text-sm font-black transition ${
        active ? "bg-emerald-600 text-white" : "bg-gray-50 text-gray-600 hover:bg-gray-100"
      }`}
    >
      {t("urride.menu.trips.tabWithCount", { label, count })}
    </button>
  );
}

function TripCard({ trip, onViewFleet, onOpenSupport }) {
  useI18n();
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
          {isPrevious ? t("urride.menu.trips.statusPrevious") : t("urride.menu.trips.statusPending")}
        </span>
      </div>

      <div className="mt-4 grid gap-2 text-sm font-semibold text-gray-600">
        <TripLine label={t("urride.menu.trips.lineStatus")} value={t("urride.menu.trips.statusStage", { status: trip.status, stage: trip.stage })} />
        <TripLine label={t("urride.menu.trips.linePickup")} value={trip.pickup} />
        <TripLine label={t("urride.menu.trips.lineDestination")} value={trip.destination} />
        <TripLine label={t("urride.menu.trips.lineFare")} value={trip.fare} />
        <TripLine label={t("urride.menu.trips.lineFleet")} value={trip.fleet?.fleetName || t("urride.menu.trips.fleetUnavailable")} />
      </div>

      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        <button
          type="button"
          onClick={onViewFleet}
          disabled={!trip.fleetId}
          className="kt-touchable h-11 rounded-xl bg-emerald-600 px-4 text-sm font-black text-white transition hover:bg-emerald-700 disabled:bg-gray-200 disabled:text-gray-500"
        >
          {t("urride.menu.trips.viewFleet")}
        </button>
        <button
          type="button"
          onClick={onOpenSupport}
          className="kt-touchable h-11 rounded-xl border border-gray-200 bg-white px-4 text-sm font-black text-gray-700 transition hover:bg-gray-50"
        >
          {t("urride.menu.trips.getSupport")}
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
  const { locale } = useI18n();
  const [places, setPlaces] = useState(() => getTransportSavedPlaces());
  const [place, setPlace] = useState(createEmptyPlace);
  const [locationCandidate, setLocationCandidate] = useState(null);
  const [locationStatus, setLocationStatus] = useState("");
  const [message, setMessage] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [actionMenuId, setActionMenuId] = useState("");
  const [areaPicker, setAreaPicker] = useState(null);
  const [accountContact, setAccountContact] = useState({});
  const formRef = useRef(null);
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
      backLabel: t("urride.menu.places.pickerBack"),
      eyebrow: t("urride.menu.places.pickerEyebrow"),
      cardEyebrow: t("urride.menu.places.pickerCard"),
      headerCurrentTitle: t("urride.menu.places.pickerHeaderCurrent"),
      headerDropTitle: t("urride.menu.places.pickerHeaderDrop"),
      currentHeading: t("urride.menu.places.pickerCurrentHeading"),
      dropHeading: t("urride.menu.places.pickerDropHeading"),
      dropInstruction: t("urride.menu.places.pickerDropInstruction"),
      currentStatus: t("urride.menu.places.pickerCurrentStatus"),
      dropStatus: t("urride.menu.places.pickerDropStatus"),
      currentName: t("urride.menu.places.pickerCurrentName"),
      droppedName: t("urride.menu.places.pickerDroppedName"),
    }),
    [locale],
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

  useEffect(() => {
    if (!formOpen) return undefined;
    const timer = window.setTimeout(() => {
      formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 80);
    return () => window.clearTimeout(timer);
  }, [formOpen, place.id]);

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
      setMessage(t("urride.menu.places.needAddress"));
      return;
    }

    const savedPlace = saveTransportSavedPlace(place);
    setPlaces(getTransportSavedPlaces());
    setPlace(createEmptyPlace(accountContact));
    setLocationCandidate(null);
    setLocationStatus("");
    setFormOpen(false);
    setMessage(t("urride.menu.places.placeSaved", { label: getPlaceLabel(savedPlace) }));
  }

  function removePlace(placeId) {
    setActionMenuId("");
    setPlaces(removeTransportSavedPlace(placeId));
    if (place.id === placeId) {
      closeForm();
    }
    setMessage(t("urride.menu.places.placeRemoved"));
  }

  function selectPlace(nextPlace, kind) {
    setActionMenuId("");
    selectTransportSavedPlace(nextPlace, kind);
    setMessage(t(kind === "dropoff" ? "urride.menu.places.placeSelectedDropoff" : "urride.menu.places.placeSelectedPickup", { label: getPlaceLabel(nextPlace) }));
  }

  async function sharePlace(nextPlace) {
    setActionMenuId("");
    const text = getPlaceShareText(nextPlace);

    try {
      if (navigator.share) {
        await navigator.share({
          title: t("urride.menu.places.shareText", { label: getPlaceLabel(nextPlace) }),
          text,
        });
        setMessage(t("urride.menu.places.shareReady"));
        return;
      }

      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        setMessage(t("urride.menu.places.shareCopied"));
        return;
      }

      window.prompt(t("urride.menu.places.shareDetails"), text);
      setMessage(t("urride.menu.places.shareReady"));
    } catch {
      setMessage(t("urride.menu.places.shareError"));
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
    setLocationStatus(t("urride.menu.places.locationAdded", { address: nextLocation.address }));
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
    setLocationStatus(t("urride.menu.places.locationAddedEdit"));
    setLocationCandidate(null);
  }

  function rejectDetectedLocation() {
    setLocationCandidate(null);
    setLocationStatus(t("urride.menu.places.enterManually"));
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
          aria-label={t("urride.menu.places.closeActions")}
          className="fixed inset-0 z-10 cursor-default bg-transparent"
          onClick={() => setActionMenuId("")}
        />
      ) : null}

      {places.length ? (
        <div className="space-y-2">
          <p className="text-sm font-black text-gray-950">{t("urride.menu.places.heading")}</p>
          {places.map((item) => {
            const actionKey = item.id || i18nText("ui.literals.kea623b454821", { value0: item.category, value1: item.street || item.detectedAddress || i18nText("ui.literals.k9da8f1fa7d3a") });

            const menuOpen = actionMenuId === actionKey;

            return (
            <article
              key={actionKey}
              className={`kt-touchable relative rounded-xl border border-gray-200 bg-white p-3 text-left shadow-sm ${menuOpen ? "z-30" : ""}`}
            >
              <div className="flex items-start justify-between gap-3">
                <button type="button" onClick={() => editPlace(item)} className="kt-touchable min-w-0 flex-1 text-left">
                  <p className="text-sm font-black text-gray-950">{t("urride.menu.places.placeSuffix", { label: getPlaceLabel(item) })}</p>
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
                  aria-label={t("urride.menu.places.actionsAria", { label: getPlaceLabel(item) })}
                  aria-expanded={actionMenuId === actionKey}
                >
                  <MoreHorizontal size={18} />
                </button>
              </div>
              {actionMenuId === actionKey ? (
                <div className="kt-modal-enter absolute right-3 top-12 z-30 w-56 overflow-hidden rounded-2xl border border-gray-200 bg-white p-1.5 shadow-2xl shadow-slate-950/10">
                  <SavedPlaceMenuAction icon={MapPin} label={t("urride.menu.places.useForPickup")} onClick={() => selectPlace(item, "pickup")} />
                  <SavedPlaceMenuAction icon={Navigation} label={t("urride.menu.places.useForDropoff")} onClick={() => selectPlace(item, "dropoff")} />
                  <SavedPlaceMenuAction icon={Pencil} label={t("urride.menu.places.editPlace")} onClick={() => editPlace(item)} />
                  <SavedPlaceMenuAction icon={Share2} label={t("urride.menu.places.shareDetails")} onClick={() => sharePlace(item)} />
                  <SavedPlaceMenuAction danger icon={Trash2} label={t("urride.menu.places.deletePlace")} onClick={() => removePlace(item.id)} />
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
          {places.length ? t("urride.menu.places.addAnother") : t("urride.menu.places.addLocation")}
        </button>
      ) : null}

      {formOpen ? (
        <div ref={formRef} className="kt-page-fade-slide grid scroll-mt-4 gap-3 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-black text-gray-950">
                {place.id ? t("urride.menu.places.editSavedLocation") : t("urride.menu.places.addLocationTitle")}
              </p>
              <p className="mt-1 text-xs font-semibold leading-5 text-gray-500">
                {t("urride.menu.places.formIntro")}
              </p>
            </div>
            <button
              type="button"
              onClick={closeForm}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-gray-200 text-gray-500 hover:bg-gray-50"
              aria-label={t("urride.menu.places.closeForm")}
            >
              <X size={16} />
            </button>
          </div>

        <label className="space-y-1">
          <span className="text-xs font-black uppercase text-gray-500">{t("urride.menu.places.categoryLabel")}</span>
          <select
            value={place.category}
            onChange={(event) => updatePlace({ category: event.target.value })}
            className="h-12 w-full rounded-xl border border-gray-200 bg-gray-50 px-3 text-sm font-black text-gray-950 outline-none focus:border-emerald-500"
          >
            {placeTypes.map((type) => (
              <option key={type} value={type}>{t(PLACE_TYPE_LABEL_KEYS[type])}</option>
            ))}
          </select>
        </label>

        {place.category === "Other" ? (
          <label className="space-y-1">
            <span className="text-xs font-black uppercase text-gray-500">{t("urride.menu.places.customCategoryLabel")}</span>
            <input
              value={place.customCategory}
              onChange={(event) => updatePlace({ customCategory: event.target.value })}
              placeholder={t("urride.menu.places.customCategoryPlaceholder")}
              className="h-12 w-full rounded-xl border border-gray-200 bg-gray-50 px-3 text-sm font-semibold outline-none focus:border-emerald-500"
            />
          </label>
        ) : null}

        <label className="space-y-1">
          <span className="text-xs font-black uppercase text-gray-500">{t("urride.menu.places.placeNameLabel")}</span>
          <input
            value={place.placeName}
            onChange={(event) => updatePlace({ placeName: event.target.value })}
            placeholder={t("urride.menu.places.placeNamePlaceholder")}
            className="h-12 w-full rounded-xl border border-gray-200 bg-gray-50 px-3 text-sm font-semibold outline-none focus:border-emerald-500"
          />
        </label>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="space-y-1">
            <span className="text-xs font-black uppercase text-gray-500">{t("urride.menu.places.contactNameLabel")}</span>
            <input
              value={place.contactName}
              onChange={(event) => updatePlace({ contactName: event.target.value })}
              placeholder={t("urride.menu.places.contactNamePlaceholder")}
              className="h-12 w-full rounded-xl border border-gray-200 bg-gray-50 px-3 text-sm font-semibold outline-none focus:border-emerald-500"
            />
          </label>
          <label className="space-y-1">
            <span className="text-xs font-black uppercase text-gray-500">{t("urride.menu.places.phoneLabel")}</span>
            <input
              value={place.phone}
              onChange={(event) => updatePlace({ phone: event.target.value })}
              placeholder={t("urride.menu.places.phonePlaceholder")}
              className="h-12 w-full rounded-xl border border-gray-200 bg-gray-50 px-3 text-sm font-semibold outline-none focus:border-emerald-500"
            />
          </label>
        </div>

        <label className="space-y-1">
          <span className="inline-flex items-center gap-2 text-xs font-black uppercase text-gray-500">
            {t("urride.menu.places.streetLabel")}
            <AddressAreaStatusIcon status={placeValidation.status} />
          </span>
          <div className="grid gap-2 sm:grid-cols-[1fr_auto_auto]">
            <input
              value={place.street}
              onChange={(event) => updatePlace({ street: event.target.value })}
              placeholder={t("urride.menu.places.streetPlaceholder")}
              className="h-12 w-full rounded-xl border border-gray-200 bg-gray-50 px-3 text-sm font-semibold outline-none focus:border-emerald-500"
            />
            <button
              type="button"
              onClick={locateMe}
              className="kt-touchable inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-gray-950 px-4 text-sm font-black text-white transition hover:bg-gray-800"
            >
              <LocateFixed size={16} />
              {t("urride.menu.places.locateMe")}
            </button>
            <button
              type="button"
              onClick={dropPlacePin}
              className="kt-touchable inline-flex h-12 items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white px-4 text-sm font-black text-gray-700 transition hover:bg-gray-50"
            >
              <MapPin size={16} />
              {t("urride.menu.places.dropPin")}
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
              {t("urride.menu.places.currentLocationIs", { address: locationCandidate.address })}
            </p>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              <button
                type="button"
                onClick={confirmDetectedLocation}
                className="kt-touchable inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-emerald-600 px-3 text-xs font-black text-white hover:bg-emerald-700"
              >
                <CheckCircle2 size={15} />
                {t("urride.menu.places.correctAdd")}
              </button>
              <button
                type="button"
                onClick={rejectDetectedLocation}
                className="kt-touchable h-10 rounded-lg border border-gray-200 bg-white px-3 text-xs font-black text-gray-700 hover:bg-gray-50"
              >
                {t("urride.menu.places.wrongManual")}
              </button>
            </div>
          </div>
        ) : null}

        <label className="space-y-1">
          <span className="text-xs font-black uppercase text-gray-500">{t("urride.menu.places.noteLabel")}</span>
          <textarea
            value={place.note}
            onChange={(event) => updatePlace({ note: event.target.value })}
            placeholder={t("urride.menu.places.notePlaceholder")}
            rows={3}
            className="w-full resize-none rounded-xl border border-gray-200 bg-gray-50 px-3 py-3 text-sm font-semibold outline-none focus:border-emerald-500"
          />
        </label>

        <label className="space-y-2">
          <span className="text-xs font-black uppercase text-gray-500">{t("urride.menu.places.pictureLabel")}</span>
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
                {t("urride.menu.places.pictureHint")}
              </p>
            </div>
          </div>
        </label>

        {place.detectedAddress ? (
          <p className="rounded-xl bg-gray-50 p-3 text-xs font-bold leading-5 text-gray-600">
            {t("urride.menu.places.detectedLocation", { address: place.detectedAddress })}
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
          {place.id ? t("urride.menu.places.updatePlace") : t("urride.menu.places.savePlace")}
        </button>
      ) : null}

      {areaPicker ? (
        <div className="fixed inset-0 z-[1300] bg-slate-950">
          <NearbyAreaScreen
            mode="businessLocationPicker"
            pickerStart={areaPicker.start}
            pickerLabels={savedPlacePickerLabels}
            backLabel={t("urride.menu.places.pickerBack")}
            onBack={() => setAreaPicker(null)}
            onLocationPicked={acceptAreaLocation}
          />
        </div>
      ) : null}
    </div>
  );
}

function PaymentReadinessPage({ variant }) {
  useI18n();
  const [paymentNote, setPaymentNote] = useState(() => readLocalText(TRANSPORT_PAYMENT_NOTE_KEY));
  const [message, setMessage] = useState("");
  const isWallet = variant === "wallet";

  function savePaymentNote() {
    writeLocalText(TRANSPORT_PAYMENT_NOTE_KEY, paymentNote);
    setMessage(t("urride.menu.payment.noteSaved"));
  }

  return (
    <div className="space-y-4">
      {message ? <p className="rounded-xl bg-emerald-50 p-3 text-sm font-bold text-emerald-700">{message}</p> : null}

      <InfoPanel
        icon={isWallet ? CreditCard : ShieldAlert}
        tone="amber"
        title={isWallet ? t("urride.menu.payment.walletPrepTitle") : t("urride.menu.payment.safetyTitle")}
        body={t("urride.menu.payment.body")}
      />

      <section className="grid gap-3 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
        <PaymentGuideline
          title={t("urride.menu.payment.forNowTitle")}
          body={t("urride.menu.payment.forNowBody")}
        />
        <PaymentGuideline
          title={t("urride.menu.payment.secretsTitle")}
          body={t("urride.menu.payment.secretsBody")}
        />
        <PaymentGuideline
          title={t("urride.menu.payment.proofTitle")}
          body={t("urride.menu.payment.proofBody")}
        />
      </section>

      {isWallet ? (
        <section className="space-y-3 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
          <div>
            <p className="text-sm font-black text-gray-950">{t("urride.menu.payment.tempNoteTitle")}</p>
            <p className="mt-1 text-xs font-semibold leading-5 text-gray-500">
              {t("urride.menu.payment.tempNoteSub")}
            </p>
          </div>
          <textarea
            value={paymentNote}
            onChange={(event) => setPaymentNote(event.target.value)}
            placeholder={t("urride.menu.payment.notePlaceholder")}
            rows={4}
            className="w-full resize-none rounded-xl border border-gray-200 bg-gray-50 px-3 py-3 text-sm font-semibold outline-none focus:border-emerald-500"
          />
          <button
            type="button"
            onClick={savePaymentNote}
            className="kt-touchable h-11 rounded-xl bg-emerald-600 px-4 text-sm font-black text-white hover:bg-emerald-700"
          >
            {t("urride.menu.payment.saveNote")}
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
  { titleKey: "urride.menu.safety.t1Title", bodyKey: "urride.menu.safety.t1Body" },
  { titleKey: "urride.menu.safety.t2Title", bodyKey: "urride.menu.safety.t2Body" },
  { titleKey: "urride.menu.safety.t3Title", bodyKey: "urride.menu.safety.t3Body" },
  { titleKey: "urride.menu.safety.t4Title", bodyKey: "urride.menu.safety.t4Body" },
  { titleKey: "urride.menu.safety.t5Title", bodyKey: "urride.menu.safety.t5Body", action: "sos" },
  { titleKey: "urride.menu.safety.t6Title", bodyKey: "urride.menu.safety.t6Body" },
  { titleKey: "urride.menu.safety.t7Title", bodyKey: "urride.menu.safety.t7Body" },
  { titleKey: "urride.menu.safety.t8Title", bodyKey: "urride.menu.safety.t8Body" },
  { titleKey: "urride.menu.safety.t9Title", bodyKey: "urride.menu.safety.t9Body" },
];

function PassengerSafetyPage({ onOpenEmergencyArea }) {
  useI18n();
  const [sosOpen, setSosOpen] = useState(false);
  // The emergency card is jurisdiction-critical: resolve the country from live
  // GPS (source of truth), not the stored/locale country. The stored profile
  // country is only a fallback when live location is unavailable.
  const [country, setCountry] = useState(null);
  const [detecting, setDetecting] = useState(false);

  async function detectEmergencyCountry() {
    setDetecting(true);
    const resolved = await resolveCurrentCountry({
      profileCountry: getActiveCountryProfile().iso2,
    });
    setCountry(resolved);
    setDetecting(false);
  }

  function openSos() {
    setSosOpen(true);
    detectEmergencyCountry();
  }

  async function handleConfirmCountry(iso) {
    setDetecting(true);
    const resolved = await applyBorderConfirmation(iso, {
      profileCountry: getActiveCountryProfile().iso2,
    });
    setCountry(resolved);
    setDetecting(false);
  }

  function openNearbyEmergencySearch(searchType) {
    setSosOpen(false);
    onOpenEmergencyArea?.(searchType);
  }

  return (
    <div className="space-y-4">
      <InfoPanel
        icon={LifeBuoy}
        tone="red"
        title={t("urride.menu.safety.guidanceTitle")}
        body={t("urride.menu.safety.guidanceBody")}
      />

      <section className="rounded-2xl border border-red-100 bg-red-50 p-4">
        <p className="text-sm font-black text-red-800">{t("urride.menu.safety.immediateTitle")}</p>
        <p className="mt-1 text-xs font-semibold leading-5 text-red-700">
          {t("urride.menu.safety.immediateBody")}
        </p>
      </section>

      <section className="grid gap-3">
        {passengerSafetyTopics.map((topic, index) => (
          <SafetyTopicCard
            key={topic.title}
            number={index + 1}
            topic={topic}
            onOpenSos={openSos}
          />
        ))}
      </section>

      <section className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
        <p className="text-sm font-black text-gray-950">{t("urride.menu.safety.keepReadyTitle")}</p>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {[
            "urride.menu.safety.keep1",
            "urride.menu.safety.keep2",
            "urride.menu.safety.keep3",
            "urride.menu.safety.keep4",
            "urride.menu.safety.keep5",
            "urride.menu.safety.keep6",
          ].map((key) => (
            <span key={key} className="rounded-xl bg-gray-50 px-3 py-2 text-xs font-black text-gray-600">
              {t(key)}
            </span>
          ))}
        </div>
      </section>

      <EmergencySheet
        open={sosOpen}
        onClose={() => setSosOpen(false)}
        countryCode={country?.countryCode || ""}
        detectingCountry={detecting}
        requiresConfirmation={Boolean(country?.requiresConfirmation)}
        alternativeCountryCode={country?.alternativeCountryCode || ""}
        onConfirmCountry={handleConfirmCountry}
        onNavigateNearby={openNearbyEmergencySearch}
      />
    </div>
  );
}

function SafetyTopicCard({ number, topic, onOpenSos }) {
  useI18n();
  const hasSosAction = topic.action === "sos";

  return (
    <article className={`rounded-2xl border bg-white p-4 shadow-sm ${hasSosAction ? "border-red-200" : "border-gray-200"}`}>
      <div className="flex items-start gap-3">
        <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-black ${hasSosAction ? "bg-red-100 text-red-700" : "bg-emerald-50 text-emerald-700"}`}>
          {number}
        </span>
        <div>
          <h3 className="text-sm font-black text-gray-950">{t(topic.titleKey)}</h3>
          <p className="mt-1 text-xs font-semibold leading-5 text-gray-600">{t(topic.bodyKey)}</p>
          {hasSosAction ? (
            <button
              type="button"
              onClick={onOpenSos}
              className="kt-touchable mt-3 flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-red-600 px-4 text-sm font-black text-white shadow-sm shadow-red-950/15 transition hover:bg-red-700 sm:w-auto"
            >
              <Siren size={18} />
              {t("urride.menu.safety.openSos")}
            </button>
          ) : null}
        </div>
      </div>
    </article>
  );
}

// Stable topic/priority values kept in English (submitted to the ticket API and
// used for the active-selection match); only their display labels are localized.
const SUPPORT_TOPICS = [
  { value: "Trip issue", labelKey: "urride.menu.support.topicTripIssue", descKey: "urride.menu.support.topicTripIssueDesc" },
  { value: "Safety report", labelKey: "urride.menu.support.topicSafety", descKey: "urride.menu.support.topicSafetyDesc" },
  { value: "Payment question", labelKey: "urride.menu.support.topicPayment", descKey: "urride.menu.support.topicPaymentDesc" },
  { value: "Saved place", labelKey: "urride.menu.support.topicSavedPlace", descKey: "urride.menu.support.topicSavedPlaceDesc" },
];
const SUPPORT_TOPIC_OPTIONS = [
  { value: "Trip issue", labelKey: "urride.menu.support.topicTripIssue" },
  { value: "Safety report", labelKey: "urride.menu.support.topicSafety" },
  { value: "Payment question", labelKey: "urride.menu.support.topicPayment" },
  { value: "Saved place", labelKey: "urride.menu.support.topicSavedPlace" },
  { value: "Operator feedback", labelKey: "urride.menu.support.topicOperator" },
];
const SUPPORT_PRIORITY_OPTIONS = [
  { value: "Normal", labelKey: "urride.menu.support.priorityNormal" },
  { value: "Urgent", labelKey: "urride.menu.support.priorityUrgent" },
  { value: "Safety critical", labelKey: "urride.menu.support.prioritySafety" },
];

function SupportPage({ seed }) {
  useI18n();
  const [form, setForm] = useState({
    topic: seed?.topic || "Trip issue",
    priority: "Normal",
    tripReference: "",
    contact: "",
    details: seed?.details || "",
  });
  const [message, setMessage] = useState("");
  const [messageIsError, setMessageIsError] = useState(false);
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
      setMessageIsError(true);
      setMessage(t("urride.menu.support.addError"));
      return;
    }

    setSending(true);
    setMessage("");
    setMessageIsError(false);
    try {
      await submitTransportSupportTicket({
        topic: form.topic,
        priority: String(form.priority || "normal").toLowerCase(),
        body: [
          form.tripReference ? t("urride.menu.support.tripRefPrefix", { ref: form.tripReference }) : "",
          form.contact ? t("urride.menu.support.contactPrefix", { contact: form.contact }) : "",
          form.details.trim(),
        ].filter(Boolean).join("\n"),
      });
      setMessage(t("urride.menu.support.sent"));
    } catch (error) {
      setMessageIsError(true);
      setMessage(error.message || t("urride.menu.support.sendError"));
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="space-y-4">
      {message ? (
        <p className={`rounded-xl p-3 text-sm font-bold ${messageIsError ? "bg-amber-50 text-amber-700" : "bg-emerald-50 text-emerald-700"}`}>
          {message}
        </p>
      ) : null}

      <InfoPanel
        icon={LifeBuoy}
        tone="emerald"
        title={t("urride.menu.support.title")}
        body={t("urride.menu.support.body")}
      />

      <section className="grid gap-3 sm:grid-cols-2">
        {SUPPORT_TOPICS.map((topic) => (
          <button
            key={topic.value}
            type="button"
            onClick={() => updateForm({ topic: topic.value })}
            className={`kt-touchable rounded-2xl border p-4 text-left shadow-sm transition ${
              form.topic === topic.value ? "border-emerald-300 bg-emerald-50" : "border-gray-200 bg-white hover:border-gray-300"
            }`}
          >
            <p className="text-sm font-black text-gray-950">{t(topic.labelKey)}</p>
            <p className="mt-1 text-xs font-semibold leading-5 text-gray-500">{t(topic.descKey)}</p>
          </button>
        ))}
      </section>

      <section className="grid gap-3 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="space-y-1">
            <span className="text-xs font-black uppercase text-gray-500">{t("urride.menu.support.topicLabel")}</span>
            <select
              value={form.topic}
              onChange={(event) => updateForm({ topic: event.target.value })}
              className="h-12 w-full rounded-xl border border-gray-200 bg-gray-50 px-3 text-sm font-black text-gray-950 outline-none focus:border-emerald-500"
            >
              {SUPPORT_TOPIC_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{t(option.labelKey)}</option>
              ))}
            </select>
          </label>
          <label className="space-y-1">
            <span className="text-xs font-black uppercase text-gray-500">{t("urride.menu.support.priorityLabel")}</span>
            <select
              value={form.priority}
              onChange={(event) => updateForm({ priority: event.target.value })}
              className="h-12 w-full rounded-xl border border-gray-200 bg-gray-50 px-3 text-sm font-black text-gray-950 outline-none focus:border-emerald-500"
            >
              {SUPPORT_PRIORITY_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{t(option.labelKey)}</option>
              ))}
            </select>
          </label>
        </div>

        <label className="space-y-1">
          <span className="text-xs font-black uppercase text-gray-500">{t("urride.menu.support.tripRefLabel")}</span>
          <input
            value={form.tripReference}
            onChange={(event) => updateForm({ tripReference: event.target.value })}
            placeholder={t("urride.menu.support.tripRefPlaceholder")}
            className="h-12 w-full rounded-xl border border-gray-200 bg-gray-50 px-3 text-sm font-semibold outline-none focus:border-emerald-500"
          />
        </label>

        <label className="space-y-1">
          <span className="text-xs font-black uppercase text-gray-500">{t("urride.menu.support.contactLabel")}</span>
          <input
            value={form.contact}
            onChange={(event) => updateForm({ contact: event.target.value })}
            placeholder={t("urride.menu.support.contactPlaceholder")}
            className="h-12 w-full rounded-xl border border-gray-200 bg-gray-50 px-3 text-sm font-semibold outline-none focus:border-emerald-500"
          />
        </label>

        <label className="space-y-1">
          <span className="text-xs font-black uppercase text-gray-500">{t("urride.menu.support.whatHappenedLabel")}</span>
          <textarea
            value={form.details}
            onChange={(event) => updateForm({ details: event.target.value })}
            placeholder={t("urride.menu.support.whatHappenedPlaceholder")}
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
          {sending ? t("urride.menu.support.sending") : t("urride.menu.support.send")}
        </button>
      </section>

      <section className="rounded-2xl border border-red-100 bg-red-50 p-4">
        <p className="text-sm font-black text-red-800">{t("urride.menu.support.safetyFirstTitle")}</p>
        <p className="mt-1 text-xs font-semibold leading-5 text-red-700">
          {t("urride.menu.support.safetyFirstBody")}
        </p>
      </section>
    </div>
  );
}

function TransportSettingsPage() {
  useI18n();
  const [settings, setSettings] = useState(() => getTransportPassengerSettings());
  const [message, setMessage] = useState("");
  // Values stay stable (stored + compared); only the two non-fleet-type entries
  // get a localized display label below (fleet-type names are brand/data).
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
    setMessage(t("urride.menu.settings.saved"));
  }

  return (
    <div className="space-y-4">
      {message ? <p className="rounded-xl bg-emerald-50 p-3 text-sm font-bold text-emerald-700">{message}</p> : null}

      <InfoPanel
        icon={Settings}
        tone="blue"
        title={t("urride.menu.settings.title")}
        body={t("urride.menu.settings.body")}
      />

      <section className="grid gap-3 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
        <SettingToggle
          label={t("urride.menu.settings.tripAlerts")}
          description={t("urride.menu.settings.tripAlertsDesc")}
          checked={settings.tripAlerts}
          onChange={() => updateSettings({ tripAlerts: !settings.tripAlerts })}
        />
        <SettingToggle
          label={t("urride.menu.settings.nearby")}
          description={t("urride.menu.settings.nearbyDesc")}
          checked={settings.nearbyOperators}
          onChange={() => updateSettings({ nearbyOperators: !settings.nearbyOperators })}
        />
        <SettingToggle
          label={t("urride.menu.settings.safetyReminders")}
          description={t("urride.menu.settings.safetyRemindersDesc")}
          checked={settings.safetyReminders}
          onChange={() => updateSettings({ safetyReminders: !settings.safetyReminders })}
        />
        <SettingToggle
          label={t("urride.menu.settings.savedSuggestions")}
          description={t("urride.menu.settings.savedSuggestionsDesc")}
          checked={settings.savedPlaceSuggestions}
          onChange={() => updateSettings({ savedPlaceSuggestions: !settings.savedPlaceSuggestions })}
        />
      </section>

      <section className="grid gap-3 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
        <label className="space-y-1">
          <span className="text-xs font-black uppercase text-gray-500">{t("urride.menu.settings.languageLabel")}</span>
          <select
            value={settings.language}
            onChange={(event) => updateSettings({ language: event.target.value })}
            className="h-12 w-full rounded-xl border border-gray-200 bg-gray-50 px-3 text-sm font-black text-gray-950 outline-none focus:border-emerald-500"
          >
            <option value="English">{i18nText("ui.literals.k649df08a448e")}</option>
            <option value="Krio">{i18nText("ui.literals.k9d10e253d08d")}</option>
            <option value="French">{i18nText("ui.literals.k2ca514ebd7c3")}</option>
          </select>
        </label>

        <label className="space-y-1">
          <span className="text-xs font-black uppercase text-gray-500">{t("urride.menu.settings.defaultRideTypeLabel")}</span>
          <select
            value={settings.defaultRideType}
            onChange={(event) => updateSettings({ defaultRideType: event.target.value })}
            className="h-12 w-full rounded-xl border border-gray-200 bg-gray-50 px-3 text-sm font-black text-gray-950 outline-none focus:border-emerald-500"
          >
            {defaultRideTypeOptions.map((option) => (
              <option key={option} value={option}>
                {option === "Any available"
                  ? t("urride.menu.settings.anyAvailable")
                  : option === "Delivery"
                    ? t("urride.menu.settings.deliveryOption")
                    : option}
              </option>
            ))}
          </select>
        </label>

        <label className="space-y-1">
          <span className="text-xs font-black uppercase text-gray-500">{t("urride.menu.settings.privacyLabel")}</span>
          <select
            value={settings.privacyMode}
            onChange={(event) => updateSettings({ privacyMode: event.target.value })}
            className="h-12 w-full rounded-xl border border-gray-200 bg-gray-50 px-3 text-sm font-black text-gray-950 outline-none focus:border-emerald-500"
          >
            <option value="Balanced">{t("urride.menu.settings.privacyBalanced")}</option>
            <option value="Precise only during booking">{t("urride.menu.settings.privacyPrecise")}</option>
            <option value="Manual addresses only">{t("urride.menu.settings.privacyManual")}</option>
          </select>
        </label>
      </section>

      <section className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gray-100 text-gray-800">
            <LockKeyhole size={19} />
          </span>
          <div>
            <p className="text-sm font-black text-gray-950">{t("urride.menu.settings.guardTitle")}</p>
            <p className="mt-1 text-xs font-semibold leading-5 text-gray-500">
              {t("urride.menu.settings.guardBody")}
            </p>
          </div>
        </div>
      </section>

      <button
        type="button"
        onClick={saveSettings}
        className="h-12 w-full rounded-xl bg-emerald-600 px-4 text-sm font-black text-white shadow-sm hover:bg-emerald-700"
      >
        {t("urride.menu.settings.save")}
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
