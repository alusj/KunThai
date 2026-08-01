import { useState } from "react";
import { createPortal } from "react-dom";
import { LocateFixed, MapPin } from "lucide-react";

import NearbyAreaScreen from "../transport/NearbyAreaScreen";
import {
  AddressAccuracyCaution,
  AddressAreaResolutionCard,
  AddressAreaStatusIcon,
  useAddressAccuracyCaution,
  useAddressAreaValidation,
} from "./AddressAreaValidation";
import { useI18n, t } from "../../i18n";

// Reverse-geocodes a coordinate to a human address (mirrors the seller
// registration flow's helper) so "Locate me" fills the address field.
async function reverseGeocodeAddress(latitude, longitude) {
  const fallback = { address: `${latitude.toFixed(6)}, ${longitude.toFixed(6)}`, city: "" };
  try {
    const response = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${encodeURIComponent(latitude)}&lon=${encodeURIComponent(longitude)}`,
      { headers: { Accept: "application/json" } },
    );
    if (!response.ok) return fallback;
    const data = await response.json();
    const address = data?.address || {};
    return {
      address: data?.display_name || fallback.address,
      city: address.city || address.town || address.village || address.county || "",
    };
  } catch {
    return fallback;
  }
}

function hasCoordinates(value) {
  const lat = value?.latitude;
  const lng = value?.longitude;
  if ([lat, lng].some((coordinate) => coordinate === "" || coordinate === null || coordinate === undefined)) return false;
  return Number.isFinite(Number(lat)) && Number.isFinite(Number(lng));
}

// A self-contained address field with the same "Locate me / Drop a pin" flow and
// manual-entry caution used in business registration, so any form with an
// address (property listings, etc.) resolves to a precise point buyers can reach.
// `value` is { address, city, latitude, longitude }; `onChange` receives a patch.
export default function AddressLocationField({ onChange, value }) {
  useI18n();
  const [picking, setPicking] = useState(null); // null | "dropPin" | "current"
  const [locating, setLocating] = useState(false);

  const point = hasCoordinates(value)
    ? { lat: Number(value.latitude), lng: Number(value.longitude), address: value.address }
    : null;
  const validation = useAddressAreaValidation(value.address, { selectedPoint: point });
  const caution = useAddressAccuracyCaution(validation.status, value.address);

  function locateMe() {
    if (!navigator.geolocation) return;
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const { latitude, longitude } = position.coords;
        const resolved = await reverseGeocodeAddress(latitude, longitude);
        onChange({ address: resolved.address, city: resolved.city || value.city, latitude, longitude });
        setLocating(false);
      },
      () => setLocating(false),
      { enableHighAccuracy: true, timeout: 10000 },
    );
  }

  function handlePicked(location) {
    const lat = Number(location?.lat ?? location?.latitude);
    const lng = Number(location?.lng ?? location?.longitude);
    const address = String(location?.address || location?.fullAddress || location?.label || location?.name || "").trim();
    onChange({
      address: address || value.address,
      city: location?.city || value.city,
      latitude: Number.isFinite(lat) ? lat : value.latitude,
      longitude: Number.isFinite(lng) ? lng : value.longitude,
    });
    setPicking(null);
  }

  return (
    <div className="space-y-3 sm:col-span-2">
      <label className="block">
        <span className="inline-flex items-center gap-2 text-xs font-black text-gray-600">
          {t("urmall.biz.reg.address")}
          <AddressAreaStatusIcon status={validation.status} />
        </span>
        <input
          required
          value={value.address}
          onChange={(event) => onChange({ address: event.target.value })}
          onBlur={caution.handleAddressBlur}
          placeholder={t("urmall.biz.reg.bizAddressPlaceholder")}
          autoComplete="street-address"
          className="mt-1 h-11 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm font-bold outline-none focus:border-emerald-400"
        />
      </label>

      <AddressAreaResolutionCard validation={validation} onLocateMe={locateMe} onDropPin={() => setPicking("dropPin")} />

      <AddressAccuracyCaution
        open={caution.open}
        onLocateMe={() => caution.act(locateMe)}
        onDropPin={() => caution.act(() => setPicking("dropPin"))}
        onCancel={caution.dismiss}
        title={t("urmall.biz.reg.accuracyTitle")}
        message={t("urmall.biz.reg.accuracyMessage")}
        locateLabel={t("urmall.biz.reg.locateMe")}
        dropPinLabel={t("urmall.biz.reg.dropPin")}
        cancelLabel={t("urmall.biz.reg.accuracyDismiss")}
      />

      <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] sm:items-center">
        <button
          type="button"
          onClick={locateMe}
          disabled={locating}
          className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-gray-900 px-4 text-sm font-black text-white transition hover:bg-gray-800 disabled:opacity-60"
        >
          <LocateFixed size={16} />
          {t("urmall.biz.reg.locateMe")}
        </button>
        <span className="justify-self-center rounded-full border border-emerald-100 bg-emerald-50 px-3 py-1 text-[11px] font-black uppercase tracking-wide text-emerald-700">
          {t("urmall.biz.reg.recommended")}
        </span>
        <button
          type="button"
          onClick={() => setPicking("dropPin")}
          className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white px-4 text-sm font-black text-gray-700 transition hover:bg-gray-50"
        >
          <MapPin size={16} />
          {t("urmall.biz.reg.dropPin")}
        </button>
      </div>

      {point ? <p className="text-xs font-bold text-emerald-700">{t("urmall.biz.reg.branchPinned")}</p> : null}

      {picking
        ? createPortal(
            <div className="fixed inset-0 z-[2000] bg-white">
              <NearbyAreaScreen
                mode="businessLocationPicker"
                pickerStart={picking}
                backLabel={t("urmall.biz.reg.backToLocationForm")}
                onBack={() => setPicking(null)}
                onLocationPicked={handlePicked}
              />
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
