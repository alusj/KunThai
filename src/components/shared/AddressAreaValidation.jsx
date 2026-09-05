import { useEffect, useMemo, useRef, useState } from "react";
import { CheckCircle2, ChevronDown, ChevronUp, LocateFixed, Loader2, MapPin, ShieldCheck, XCircle } from "lucide-react";
import { searchLocations } from "../../Backend/services/locationSearchService";
import { t as i18nText } from "../../i18n/index";
import { shouldOpenAddressAccuracyCaution } from "./addressAccuracyCautionState";

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
  const [state, setState] = useState({ status: i18nText("ui.literals.k1adbcc344b31"), result: null, message: "" });

  const centerKey = useMemo(() => pointKey(center), [center]);
  const selectedLocation = useMemo(
    () => normalizeAreaLocation(selectedPoint, address),
    [selectedPoint, address],
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
          status: i18nText("ui.literals.k2739bb260ce4"),
          result: selectedLocation,
          message: i18nText("ui.literals.k2833807d52ee"),
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

        return { status: i18nText("ui.literals.k1adbcc344b31"), result: null, message: "" };
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
          status: i18nText("ui.literals.kde94f8210cfd"),
          result: null,
          message: i18nText("ui.literals.kb68b07a479c7"),
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
              status: i18nText("ui.literals.k2739bb260ce4"),
              result: match,
              message: i18nText("ui.literals.k2833807d52ee"),
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
            message: i18nText("ui.literals.k1a4f4e6fcfd4"),
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
            message: i18nText("ui.literals.k1a4f4e6fcfd4"),
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

// Opens on the first real edit rather than waiting for address search to finish.
// "Continue writing" and either precise-location action suppress it for the
// current entry session; clearing the field starts a fresh session.
export function useAddressAccuracyCaution(address) {
  const [open, setOpen] = useState(false);
  const dismissedRef = useRef(false);
  const editedRef = useRef(false);
  const value = String(address || "").trim();
  const previousValueRef = useRef(value);

  useEffect(() => {
    const previousValue = previousValueRef.current;
    previousValueRef.current = value;

    if (!value) {
      dismissedRef.current = false;
      editedRef.current = false;
      setOpen(false);
      return;
    }

    if (value !== previousValue) {
      editedRef.current = true;
    }

    if (shouldOpenAddressAccuracyCaution({
      address: value,
      previousAddress: previousValue,
      dismissed: dismissedRef.current,
    })) {
      setOpen(true);
    }
  }, [value]);

  function handleAddressBlur() {
    if (editedRef.current && value && !dismissedRef.current) {
      setOpen(true);
    }
  }

  function dismiss() {
    dismissedRef.current = true;
    setOpen(false);
  }

  // Run a precise-location action (Locate me / Drop a pin) and stop the caution
  // from re-appearing for this address.
  function act(action) {
    dismissedRef.current = true;
    setOpen(false);
    action?.();
  }

  return { open, handleAddressBlur, dismiss, act };
}

export function AddressAccuracyCaution({
  open,
  onLocateMe,
  onDropPin,
  onContinueWriting,
  title = "Help customers find your exact location",
  message = "For greater accuracy, KunThai strongly recommends using Locate me or Drop a pin so customers arrive at the correct entrance.",
  details = "Some streets, businesses, communities, and landmarks share the same or similar names. Spelling differences, incomplete addresses, new roads, and limited map coverage may also place a written address at the wrong point. Confirm the map pin before continuing.",
  locateLabel = "Locate me",
  dropPinLabel = "Drop a pin",
  continueLabel = "Continue writing",
  readMoreLabel = "Read more",
  readLessLabel = "Show less",
}) {
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    if (!open) setExpanded(false);
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="kt-address-accuracy-caution fixed bottom-[max(1rem,env(safe-area-inset-bottom))] left-1/2 z-[1600] w-[calc(100%-2rem)] max-w-md -translate-x-1/2 rounded-[1.75rem] border border-amber-300 bg-white p-4 text-slate-950 shadow-2xl shadow-slate-950/25 dark:shadow-black/70"
      role="alertdialog"
      aria-label={title}
    >
      <div className="flex items-start gap-3">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-amber-100 text-amber-800">
          <ShieldCheck size={20} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-base font-black leading-5">{title}</p>
          <p className="kt-address-caution-copy mt-1.5 text-sm font-semibold leading-5 text-slate-700">{message}</p>

          <button
            type="button"
            onClick={() => setExpanded((current) => !current)}
            aria-expanded={expanded}
            className="kt-touchable mt-2 inline-flex min-h-9 items-center gap-1.5 rounded-lg px-2 text-xs font-black text-amber-800 hover:bg-amber-50"
          >
            {expanded ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
            {expanded ? readLessLabel : readMoreLabel}
          </button>

          {expanded ? (
            <p className="kt-address-caution-details mt-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs font-semibold leading-5 text-slate-700">
              {details}
            </p>
          ) : null}

          <div className="mt-3 grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={onLocateMe}
              className="kt-touchable inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-slate-950 px-3 text-xs font-black text-white hover:bg-slate-800"
            >
              <LocateFixed size={15} />
              {locateLabel}
            </button>
            <button
              type="button"
              onClick={onDropPin}
              className="kt-touchable inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-amber-300 bg-amber-50 px-3 text-xs font-black text-amber-900 hover:bg-amber-100"
            >
              <MapPin size={15} />
              {dropPinLabel}
            </button>
          </div>

          <button
            type="button"
            onClick={onContinueWriting}
            className="kt-touchable mt-2 inline-flex h-11 w-full items-center justify-center rounded-xl border border-slate-300 bg-white px-3 text-xs font-black text-slate-700 hover:bg-slate-50"
          >
            {continueLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

export function AddressAreaStatusIcon({ status, className = "" }) {
  if (status === "searching") {
    return <Loader2 className={`animate-spin text-slate-400 ${className}`} size={18} aria-label={i18nText("ui.literals.k94ed9d492785")} />;
  }

  if (status === "found") {
    return <CheckCircle2 className={`text-emerald-600 ${className}`} size={18} aria-label={i18nText("ui.literals.k3a6c8de09e65")} />;
  }

  if (status === "notFound") {
    return <XCircle className={`text-rose-600 ${className}`} size={18} aria-label={i18nText("ui.literals.k7dd3e67390bd")} />;
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
      ? "border-blue-100 bg-blue-50 text-blue-900 dark:border-blue-500/30 dark:bg-blue-500/10 dark:text-blue-200"
      : "border-emerald-100 bg-emerald-50 text-emerald-900 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-200";

  if (isFound || isSearching) {
    return (
      <div
        className={`flex items-start gap-2 rounded-xl border px-3 py-2 text-xs font-bold leading-5 ${
          isFound ? foundClasses : "border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-300"
        }`}
      >
        <AddressAreaStatusIcon status={status} className="mt-0.5 shrink-0" />
        <span>
          {isSearching
            ? i18nText("ui.literals.kf54264f3a3b8")
            : i18nText("ui.literals.k904512f639d7")}
        </span>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-rose-100 bg-rose-50 p-3 dark:border-rose-500/30 dark:bg-rose-500/10">
      <div className="flex items-start gap-2">
        <XCircle className="mt-0.5 shrink-0 text-rose-600 dark:text-rose-400" size={18} />
        <div className="min-w-0">
          <p className="text-sm font-black text-rose-950 dark:text-rose-200">{i18nText("ui.literals.kfad0ee12627d")}</p>
          <p className="mt-1 text-xs font-semibold leading-5 text-rose-800 dark:text-rose-300/90">
            {i18nText("ui.literals.k407662402308")}
          </p>
        </div>
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <button
          type="button"
          onClick={onLocateMe}
          className="kt-touchable inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-slate-950 px-3 text-xs font-black text-white hover:bg-slate-800 dark:bg-white dark:text-slate-950 dark:hover:bg-slate-200"
        >
          <LocateFixed size={15} />
          {locateLabel}
        </button>

        <button
          type="button"
          onClick={onDropPin}
          className="kt-touchable inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-rose-200 bg-white px-3 text-xs font-black text-rose-700 hover:bg-rose-100 dark:border-rose-500/30 dark:bg-transparent dark:text-rose-300 dark:hover:bg-rose-500/10"
        >
          <MapPin size={15} />
          {dropPinLabel}
        </button>
      </div>
    </div>
  );
}
