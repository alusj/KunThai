import { useEffect, useMemo, useRef, useState } from "react";
import { CheckCircle2, ChevronDown, ChevronUp, LocateFixed, Loader2, MapPin, PencilLine, ShieldCheck, XCircle } from "lucide-react";
import { searchLocations } from "../../Backend/services/locationSearchService";
import { t as i18nText } from "../../i18n/index";
import { shouldOpenAddressAccuracyCaution } from "./addressAccuracyCautionState";
import { uiText as translateUi, useI18n as useUiLocale } from "../../i18n/index.js";

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
          status: "found",
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

        return { status: "idle", result: null, message: "" };
      });

      return undefined;
    }

    let alive = true;

    const timer = window.setTimeout(async () => {
      setState((current) => {
        if (current.status === "searching" && current.message === i18nText("ui.literals.kb68b07a479c7")) {
          return current;
        }

        return {
          status: "searching",
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
              status: "found",
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

// The address field starts locked: touching it raises the caution over the
// field and typing does nothing until the person picks one of the three ways
// to set the address — Locate me, Drop a pin, or Enter manually. A written
// address is the least accurate of the three, so it is a deliberate choice
// rather than the path of least resistance.
//
// `gate: false` keeps the old behaviour (caution on the first real edit) for
// forms where the address is not the primary input.
//
// `lockOnEdit` moves the gate from the tap to the first character: the field
// opens writable, and the moment the person starts typing an address the
// caution covers the field and takes it back. They see the caution next to
// their own words rather than before they have written anything, and the same
// three buttons are still the only way back in.
export function useAddressAccuracyCaution(address, { gate = true, lockOnEdit = false } = {}) {
  const [open, setOpen] = useState(false);
  const [blocked, setBlocked] = useState(gate);
  // Mirrors `blocked` synchronously, so a change arriving in the same frame as
  // the lock is already refused by `guardChange` before React re-renders.
  const blockedRef = useRef(gate);
  const dismissedRef = useRef(false);
  const editedRef = useRef(false);
  const value = String(address || "").trim();
  const previousValueRef = useRef(value);
  const fieldRef = useRef(null);

  useEffect(() => {
    const previousValue = previousValueRef.current;
    previousValueRef.current = value;

    if (!value) {
      dismissedRef.current = false;
      editedRef.current = false;
      setOpen(false);
      // A cleared field is never left locked, so the next attempt starts from
      // the same writable state as the first one.
      if (lockOnEdit) {
        blockedRef.current = false;
        setBlocked(false);
      }
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
      // The first character is what closes the field on a `lockOnEdit` form.
      // Dropping focus puts the phone keyboard away so it cannot hide the card.
      if (lockOnEdit) {
        blockedRef.current = true;
        setBlocked(true);
        fieldRef.current?.blur();
      }
    }
  }, [lockOnEdit, value]);

  function handleAddressBlur() {
    if (editedRef.current && value && !dismissedRef.current) {
      setOpen(true);
    }
  }

  // "Enter manually": unlock the field and stop the caution re-appearing.
  function dismiss() {
    dismissedRef.current = true;
    blockedRef.current = false;
    setBlocked(false);
    setOpen(false);
  }

  // Run a precise-location action (Locate me / Drop a pin) and stop the caution
  // from re-appearing for this address.
  function act(action) {
    dismissedRef.current = true;
    blockedRef.current = false;
    setBlocked(false);
    setOpen(false);
    action?.();
  }

  // Wrap the field's onChange with this. Refusing keydown is not enough on its
  // own: Android keyboards (keyCode 229), autocomplete, dictation and inserted
  // text change the value without a cancellable key. Dropping the change at
  // the model lets the controlled input snap back, whatever produced it.
  function guardChange(onChange) {
    return (event) => {
      if (blockedRef.current) return;
      onChange(event);
    };
  }

  // Called when the person taps or focuses a locked address field: show the
  // caution and tell the caller to keep the keyboard closed.
  function requestEntry() {
    if (!blocked) return false;
    setOpen(true);
    return true;
  }

  // Spread onto the address input. While locked, tapping it raises the caution
  // instead of the keyboard and nothing can be typed, pasted or dropped in.
  // The input stays writable in the DOM (not `readOnly`) so a `required`
  // address is still validated by the browser when the form is submitted.
  function blockInput(event) {
    if (!blocked) return;
    event.preventDefault();
    requestEntry();
  }

  const inputProps = {
    "aria-readonly": blocked || undefined,
    onFocus: (event) => {
      fieldRef.current = event.currentTarget;
      if (requestEntry()) event.currentTarget.blur();
    },
    onPointerDown: blockInput,
    // Keys, paste and drop are all refused while locked (React's onBeforeInput
    // is synthesised and cannot cancel the native edit, so it is not used).
    onKeyDown: blockInput,
    onPaste: blockInput,
    onDrop: blockInput,
    onBlur: handleAddressBlur,
  };

  return { open, blocked, handleAddressBlur, requestEntry, inputProps, guardChange, dismiss, act };
}

export function AddressAccuracyCaution({
  open,
  // `cover` lays the caution over the address field it belongs to, so the
  // field cannot be read or reached around it. Without it the caution floats
  // just above the field, which suits forms where the field is one of many.
  cover = false,
  onLocateMe,
  onDropPin,
  onContinueWriting,
  title = "Help customers find your exact location",
  message = "For greater accuracy, KunThai strongly recommends using Locate me or Drop a pin so customers arrive at the correct entrance.",
  details = "Some streets, businesses, communities, and landmarks share the same or similar names. Spelling differences, incomplete addresses, new roads, and limited map coverage may also place a written address at the wrong point. Confirm the map pin before continuing.",
  locateLabel = "Locate me",
  dropPinLabel = "Drop a pin",
  continueLabel = "Enter manually",
  readMoreLabel = "Read more",
  readLessLabel = "Show less",
}) {
  useUiLocale();
  const [expanded, setExpanded] = useState(false);
  const cardRef = useRef(null);

  useEffect(() => {
    if (!open) setExpanded(false);
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;

    const frame = window.requestAnimationFrame(() => {
      cardRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "nearest" });
    });

    return () => window.cancelAnimationFrame(frame);
  }, [open]);

  if (!open) return null;

  // Covering starts at the top of the field's wrapper and is at least as tall
  // as the wrapper, so the label and the input are both behind the card.
  const placement = cover
    ? "absolute inset-x-0 top-0 min-h-full w-full"
    : "absolute bottom-[calc(100%+0.75rem)] left-1/2 w-[calc(100vw-2rem)] max-w-md -translate-x-1/2";

  return (
    <div
      ref={cardRef}
      className={`kt-address-accuracy-caution ${placement} z-[1600] max-h-[min(70dvh,34rem)] overflow-y-auto overscroll-contain rounded-[1.75rem] bg-white p-4 text-slate-950 shadow-2xl shadow-slate-950/25 dark:shadow-black/70`}
      role="alertdialog"
      aria-label={translateUi(title)}
    >
      <div className="flex items-start gap-3">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-amber-100 text-amber-800">
          <ShieldCheck size={20} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-base font-black leading-5">{translateUi(title)}</p>
          <p className="kt-address-caution-copy mt-1.5 text-sm font-semibold leading-5 text-slate-700">{translateUi(message)}</p>

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
            <p className="kt-address-caution-details mt-2 rounded-xl bg-amber-50 p-3 text-xs font-semibold leading-5 text-slate-700">
              {details}
            </p>
          ) : null}

        </div>
      </div>

      {/* One full-width button per line, in order of accuracy: Locate me,
          Drop a pin, then Enter manually. */}
      <div className="kt-address-caution-actions mt-4 grid grid-cols-1 gap-2">
        <button
          type="button"
          onClick={onLocateMe}
          className="kt-touchable inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 text-sm font-black text-white hover:bg-slate-800"
        >
          <LocateFixed size={16} />
          {locateLabel}
        </button>
        <button
          type="button"
          onClick={onDropPin}
          className="kt-touchable inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-amber-100 px-4 text-sm font-black text-amber-900 hover:bg-amber-200"
        >
          <MapPin size={16} />
          {dropPinLabel}
        </button>
        <button
          type="button"
          onClick={onContinueWriting}
          className="kt-touchable inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-slate-100 px-4 text-sm font-black text-slate-700 hover:bg-slate-200"
        >
          <PencilLine size={16} />
          {continueLabel}
        </button>
      </div>
    </div>
  );
}

export function AddressAreaStatusIcon({ status, className = "" }) {
  useUiLocale();
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
  useUiLocale();
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
