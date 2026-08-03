import { FiMap, FiMapPin, FiNavigation, FiSearch, FiSend, FiSliders } from "react-icons/fi";

import { getPassengerFleetFilterOptions } from "../../../data/globalTransportCapabilities";
import { useI18n, t } from "../../../i18n";

function getPlaceLabel(place) {
  return place.category === "Other" ? place.customCategory || t("urride.locationSearch.otherCategory") : place.category || t("urride.locationSearch.savedCategory");
}

export default function LocationSearch({
  destination,
  pickup,
  filters,
  savedPlaces = [],
  nearbyStatus = "",
  pickupPanelOpen,
  filterPanelOpen,
  onDestinationChange,
  onPickupChange,
  onUseNearby,
  onTogglePickupPanel,
  onToggleFilterPanel,
  onFilterChange,
  onLocateArea,
  onOpenBooking,
}) {
  useI18n();
  const fleetTypes = getPassengerFleetFilterOptions({}, filters?.mode || "topRated");

  return (
    <section className="mb-5 rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
      <div className="grid gap-3 xl:grid-cols-[1fr_auto] xl:items-center">
        <div className="grid gap-3 lg:grid-cols-2">
          <label className="relative block">
            <span className="sr-only">{t("urride.locationSearch.searchDestination")}</span>
            <FiSearch size={19} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="search"
              value={destination}
              onChange={(event) => onDestinationChange(event.target.value)}
              placeholder={t("urride.locationSearch.whereGoing")}
              className="h-12 w-full rounded-2xl border border-gray-200 bg-gray-50 pl-11 pr-4 text-sm font-medium text-gray-900 outline-none transition placeholder:text-gray-400 focus:border-green-500 focus:bg-white focus:ring-4 focus:ring-green-100"
            />
          </label>

          <label className="relative block">
            <span className="sr-only">{t("urride.locationSearch.pickupPoint")}</span>
            <FiMapPin size={19} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              value={pickup}
              onChange={(event) => onPickupChange(event.target.value)}
              placeholder={t("urride.locationSearch.pickupPoint")}
              className="h-12 w-full rounded-2xl border border-gray-200 bg-gray-50 pl-11 pr-4 text-sm font-medium text-gray-900 outline-none transition placeholder:text-gray-400 focus:border-green-500 focus:bg-white focus:ring-4 focus:ring-green-100"
            />
          </label>
        </div>

        <div className="grid grid-cols-5 gap-2 sm:flex">
          <button
            type="button"
            onClick={onUseNearby}
            className="h-12 rounded-2xl border border-gray-200 px-3 text-sm font-semibold text-gray-700 transition hover:border-green-200 hover:bg-green-50 flex items-center justify-center gap-2"
          >
            <FiNavigation size={17} />
            <span className="hidden sm:inline">{t("urride.locationSearch.nearby")}</span>
          </button>
          <button
            type="button"
            onClick={onTogglePickupPanel}
            className={`h-12 rounded-2xl border px-3 text-sm font-semibold transition flex items-center justify-center gap-2 ${
              pickupPanelOpen ? "border-green-200 bg-green-50 text-green-700" : "border-gray-200 text-gray-700 hover:border-green-200 hover:bg-green-50"
            }`}
          >
            <FiMapPin size={17} />
            <span className="hidden sm:inline">{t("urride.locationSearch.pickups")}</span>
          </button>
          <button
            type="button"
            aria-label={t("urride.locationSearch.filtersAria")}
            onClick={onToggleFilterPanel}
            className={`h-12 rounded-2xl border px-3 text-sm font-semibold transition flex items-center justify-center gap-2 ${
              filterPanelOpen ? "border-green-200 bg-green-50 text-green-700" : "border-gray-200 text-gray-700 hover:border-green-200 hover:bg-green-50"
            }`}
          >
            <FiSliders size={17} />
            <span className="hidden sm:inline">{t("urride.locationSearch.filters")}</span>
          </button>
          <button
            type="button"
            onClick={onLocateArea}
            aria-label={t("urride.locationSearch.locateAria")}
            title={t("urride.locationSearch.locateAria")}
            className="h-12 rounded-2xl border border-emerald-200 bg-slate-950 px-3 text-sm font-black text-white shadow-sm shadow-slate-200/70 transition hover:bg-slate-900 flex items-center justify-center gap-2"
          >
            <FiMap size={17} />
            <span className="hidden sm:inline">{t("urride.locationSearch.locate")}</span>
          </button>
          <button
            type="button"
            onClick={onOpenBooking}
            className="h-12 rounded-2xl bg-green-600 px-3 text-sm font-black text-white transition hover:bg-green-700 flex items-center justify-center gap-2"
          >
            <FiSend size={17} />
            <span className="hidden sm:inline">{t("urride.locationSearch.openBooking")}</span>
          </button>
        </div>
      </div>

      {nearbyStatus ? (
        <p className="mt-3 rounded-xl bg-gray-50 px-3 py-2 text-xs font-bold text-gray-600">
          {nearbyStatus}
        </p>
      ) : null}

      {pickupPanelOpen ? (
        <div className="mt-4 rounded-2xl border border-gray-100 bg-gray-50 p-3">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-black text-gray-950">{t("urride.locationSearch.pickupPointsTitle")}</p>
            <button
              type="button"
              onClick={() => onPickupChange("")}
              className="text-xs font-black text-gray-500 hover:text-gray-900"
            >
              {t("urride.locationSearch.clear")}
            </button>
          </div>
          {savedPlaces.length ? (
            <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
              {savedPlaces.map((place) => (
                <button
                  key={place.id}
                  type="button"
                  onClick={() => onPickupChange(place.street || place.detectedAddress || place.placeName || "")}
                  className="shrink-0 rounded-xl border border-gray-200 bg-white px-3 py-2 text-left text-xs font-bold text-gray-600 hover:border-green-200 hover:bg-green-50"
                >
                  <span className="block text-gray-950">{getPlaceLabel(place)}</span>
                  <span className="mt-0.5 block max-w-[180px] truncate">{place.street || place.detectedAddress || place.placeName}</span>
                </button>
              ))}
            </div>
          ) : (
            <p className="mt-2 rounded-xl bg-white p-3 text-xs font-bold text-gray-500">
              {t("urride.locationSearch.savedPlacesEmpty")}
            </p>
          )}
        </div>
      ) : null}

      {filterPanelOpen ? (
        <div className="mt-4 grid gap-3 rounded-2xl border border-gray-100 bg-gray-50 p-3 sm:grid-cols-2 xl:grid-cols-4">
          <label className="space-y-1">
            <span className="text-xs font-black uppercase text-gray-500">{t("urride.locationSearch.serviceLabel")}</span>
            <select
              value={filters.mode}
              onChange={(event) => onFilterChange({ mode: event.target.value })}
              className="h-11 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm font-black text-gray-900 outline-none focus:border-green-500"
            >
              <option value="topRated">{t("urride.locationSearch.allServices")}</option>
              <option value="ride">{t("urride.locationSearch.ride")}</option>
              <option value="delivery">{t("urride.locationSearch.delivery")}</option>
            </select>
          </label>

          <label className="space-y-1">
            <span className="text-xs font-black uppercase text-gray-500">{t("urride.locationSearch.fleetTypeLabel")}</span>
            <select
              value={filters.fleetType || ""}
              onChange={(event) => onFilterChange({ fleetType: event.target.value || null })}
              className="h-11 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm font-black text-gray-900 outline-none focus:border-green-500"
            >
              {fleetTypes.map((type) => (
                <option key={type.value || "all"} value={type.value}>{type.label}</option>
              ))}
            </select>
          </label>

          <ToggleFilter
            label={t("urride.locationSearch.activeOnly")}
            checked={filters.activeOnly}
            onClick={() => onFilterChange({ activeOnly: !filters.activeOnly })}
          />
          <ToggleFilter
            label={t("urride.locationSearch.verifiedFirst")}
            checked={filters.verifiedOnly}
            onClick={() => onFilterChange({ verifiedOnly: !filters.verifiedOnly })}
          />
        </div>
      ) : null}
    </section>
  );
}

function ToggleFilter({ label, checked, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex h-11 items-center justify-between rounded-xl border px-3 text-sm font-black ${
        checked ? "border-green-200 bg-green-50 text-green-700" : "border-gray-200 bg-white text-gray-600"
      }`}
    >
      {label}
      <span className={`h-5 w-5 rounded-full border ${checked ? "border-green-600 bg-green-600" : "border-gray-300 bg-white"}`} />
    </button>
  );
}
