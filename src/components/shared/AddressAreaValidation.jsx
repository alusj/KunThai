import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, LocateFixed, Loader2, MapPin, XCircle } from "lucide-react";
import { searchLocations } from "../../Backend/services/locationSearchService";

function coordinateValue(point, keys) {
  for (const key of keys) {
    const value = Number(point?.[key]);
    if (Number.isFinite(value)) return value;
  }
  return null;
}

export function normalizeAreaLocation(location, fallbackAddress = "") {
  if (!location) return null;

  const lat = coordinateValue(location, ["lat", "latitude"]);
  const lng = coordinateValue(location, ["lng", "longitude"]);
  const address =
    location.address ||
    location.fullAddress ||
    location.detectedAddress ||
    location.placeName ||
    location.name ||
    fallbackAddress;

  return {
    ...location,
    lat,
    lng,
    address,
    name: location.name || location.label || address || "Selected location",
    label: location.label || address || "Selected location",
    coordinates:
      lat != null && lng != null
        ? { latitude: lat, longitude: lng }
        : location.coordinates || null,
  };
}

function pointKey(point) {
  if (!point) return "";
  return [
    point.id,
    point.lat ?? point.latitude,
    point.lng ?? point.longitude,
    point.address,
    point.fullAddress,
    point.detectedAddress,
  ].join(":");
}

export function useAddressAreaValidation(address, options = {}) {
  const { center = null, enabled = true, selectedPoint = null, minLength = 3 } = options;
  const [state, setState] = useState({ status: "idle", result: null, message: "" });

  const centerKey = useMemo(() => pointKey(center), [center]);
  const selectedPointKey = useMemo(() => pointKey(selectedPoint), [selectedPoint]);

  const selectedLocation = useMemo(
    () => normalizeAreaLocation(selectedPoint, address),
    [selectedPointKey, address],
  );

  useEffect(() => {
    if (selectedLocation?.lat != null && selectedLocation?.lng != null) {
      setState((current) => {
        const nextKey = pointKey(selectedLocation);
        const currentKey = pointKey(current.result);

        if (
          current.status === "found" &&
          currentKey === nextKey &&
          current.message === "Location found in Area View."
        ) {
          return current;
        }

        return {
          status: "found",
          result: selectedLocation,
          message: "Location found in Area View.",
        };
      });

      return undefined;
    }

    const text = String(address || "").trim();

    if (!enabled || text.length < minLength) {
      setState((current) => {
        if (current.status === "idle" && !current.result && !current.message) {
          return current;
        }

        return { status: "idle", result: null, message: "" };
      });

      return undefined;
    }

    let alive = true;

    const timer = window.setTimeout(async () => {
      setState((current) => {
        if (current.status === "searching" && current.message === "Checking Area View...") {
          return current;
        }

        return {
          status: "searching",
          result: null,
          message: "Checking Area View...",
        };
      });

      try {
        const results = await searchLocations(text, center, { limit: 3 });
        if (!alive) return;

        const match = normalizeAreaLocation(results?.[0], text);

        if (match?.lat != null && match?.lng != null) {
          setState((current) => {
            const nextKey = pointKey(match);
            const currentKey = pointKey(current.result);

            if (
              current.status === "found" &&
              currentKey === nextKey &&
              current.message === "Location found in Area View."
            ) {
              return current;
            }

            return {
              status: "found",
              result: match,
              message: "Location found in Area View.",
            };
          });

          return;
        }

        setState((current) => {
          if (
            current.status === "notFound" &&
            !current.result &&
            current.message === "Location unknown or unfindable in Area View."
          ) {
            return current;
          }

          return {
            status: "notFound",
            result: null,
            message: "Location unknown or unfindable in Area View.",
          };
        });
      } catch {
        if (!alive) return;

        setState((current) => {
          if (
            current.status === "notFound" &&
            !current.result &&
            current.message === "Location unknown or unfindable in Area View."
          ) {
            return current;
          }

          return {
            status: "notFound",
            result: null,
            message: "Location unknown or unfindable in Area View.",
          };
        });
      }
    }, 520);

    return () => {
      alive = false;
      window.clearTimeout(timer);
    };
  }, [address, center, centerKey, enabled, minLength, selectedLocation]);

  return state;
}

export function AddressAreaStatusIcon({ status, className = "" }) {
  if (status === "searching") {
    return <Loader2 className={`animate-spin text-slate-400 ${className}`} size={18} aria-label="Checking Area View" />;
  }

  if (status === "found") {
    return <CheckCircle2 className={`text-emerald-600 ${className}`} size={18} aria-label="Location found" />;
  }

  if (status === "notFound") {
    return <XCircle className={`text-rose-600 ${className}`} size={18} aria-label="Location unknown" />;
  }

  return null;
}

export function AddressAreaResolutionCard({
  validation,
  onLocateMe,
  onDropPin,
  tone = "emerald",
  locateLabel = "Locate me",
  dropPinLabel = "Drop a pin",
}) {
  const status = validation?.status || "idle";
  if (status === "idle") return null;

  const isFound = status === "found";
  const isSearching = status === "searching";
  const toneClass = tone === "blue" ? "blue" : "emerald";
  const foundClasses =
    toneClass === "blue"
      ? "border-blue-100 bg-blue-50 text-blue-900"
      : "border-emerald-100 bg-emerald-50 text-emerald-900";

  if (isFound || isSearching) {
    return (
      <div
        className={`flex items-start gap-2 rounded-xl border px-3 py-2 text-xs font-bold leading-5 ${
          isFound ? foundClasses : "border-slate-200 bg-slate-50 text-slate-600"
        }`}
      >
        <AddressAreaStatusIcon status={status} className="mt-0.5 shrink-0" />
        <span>
          {isSearching
            ? "Checking Area View for this address..."
            : "Location found in Area View. You can continue or refine it with a pin if needed."}
        </span>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-rose-100 bg-rose-50 p-3">
      <div className="flex items-start gap-2">
        <XCircle className="mt-0.5 shrink-0 text-rose-600" size={18} />
        <div className="min-w-0">
          <p className="text-sm font-black text-rose-950">Location unknown or unfindable</p>
          <p className="mt-1 text-xs font-semibold leading-5 text-rose-800">
            Area View could not match this address. Please allow us to locate you so we can get your exact location, or drop a pin manually.
          </p>
        </div>
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <button
          type="button"
          onClick={onLocateMe}
          className="kt-touchable inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-slate-950 px-3 text-xs font-black text-white hover:bg-slate-800"
        >
          <LocateFixed size={15} />
          {locateLabel}
        </button>

        <button
          type="button"
          onClick={onDropPin}
          className="kt-touchable inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-rose-200 bg-white px-3 text-xs font-black text-rose-700 hover:bg-rose-100"
        >
          <MapPin size={15} />
          {dropPinLabel}
        </button>
      </div>
    </div>
  );
}