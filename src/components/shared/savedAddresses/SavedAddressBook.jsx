// One saved-locations experience for UrMall delivery addresses and UrRide saved
// places: the list with a "..." action sheet, one add/edit form whose address
// field goes through the accuracy caution, an animated save, a toast, and then
// the saved location back in the list with "Add another location" below it.
//
// Each app supplies only what genuinely differs — its categories, where the
// data lives (onSave / onRemove) and what "use this location" means
// (menuActions). Addresses share one shape:
//   { id, category, customCategory, fullName, phone, street, note,
//     frontPictureUrl, detectedAddress, coordinates: { latitude, longitude } }

import { createElement, useEffect, useMemo, useRef, useState } from "react";
import {
  Camera,
  CheckCircle2,
  LocateFixed,
  MapPin,
  MoreHorizontal,
  Pencil,
  Plus,
  Share2,
  Trash2,
  X,
} from "lucide-react";

import AppPortal from "../AppPortal";
import NearbyAreaScreen from "../../transport/NearbyAreaScreen";
import {
  AddressAccuracyCaution,
  AddressAreaResolutionCard,
  AddressAreaStatusIcon,
  normalizeAreaLocation,
  useAddressAccuracyCaution,
  useAddressAreaValidation,
} from "../AddressAreaValidation";
import { resizedImageUrl } from "../../../Backend/lib/imageProxy";
import { showToast } from "../../../Backend/services/toastService";
import { shortErrorToast } from "../../../Backend/services/friendlyErrorService";
import { t, useI18n } from "../../../i18n";
import { compressAddressPhoto } from "./addressPhoto";
import { getAddressCategoryLabel, getAddressShareText, getAddressText } from "./savedAddressModel";

// Long enough that the saving animation reads as a deliberate step even when
// the save itself is instant, short enough not to feel slow.
const SAVING_MIN_MS = 800;
const SAVED_HOLD_MS = 700;

const wait = (ms) => new Promise((resolve) => window.setTimeout(resolve, ms));

function addressPoint(address) {
  const coordinates = address?.coordinates;
  if (!coordinates) return null;
  const lat = Number(coordinates.latitude ?? coordinates.lat);
  const lng = Number(coordinates.longitude ?? coordinates.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng, address: address.detectedAddress || address.street };
}

function MenuAction({ danger = false, icon, label, onClick }) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className={`kt-touchable flex min-h-12 w-full items-center gap-3 rounded-2xl px-3 py-3 text-left text-sm font-black ${
        danger ? "text-rose-600 hover:bg-rose-50" : "text-gray-700 hover:bg-gray-50 hover:text-gray-950"
      }`}
    >
      <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${danger ? "bg-rose-50" : "bg-slate-50"}`}>
        {createElement(icon, { size: 18 })}
      </span>
      <span className="min-w-0 flex-1 truncate">{label}</span>
    </button>
  );
}

function FieldLabel({ children }) {
  return <span className="text-xs font-black uppercase text-gray-500">{children}</span>;
}

const inputClass =
  "h-12 w-full rounded-xl border border-gray-200 bg-gray-50 px-3 text-sm font-semibold text-gray-950 outline-none focus:border-emerald-500";

// The form is keyed per opening, so the accuracy caution starts from the
// address the form opened with: editing a saved address does not count as
// "starting to type" and does not raise the caution by itself.
function SavedAddressForm({ initial, categories, pickerLabels, pickerBackLabel, onSave, onCancel }) {
  useI18n();
  const [draft, setDraft] = useState(initial);
  const [saveState, setSaveState] = useState("idle"); // idle | saving | saved
  const [formError, setFormError] = useState("");
  const [photoBusy, setPhotoBusy] = useState(false);
  const [areaPicker, setAreaPicker] = useState(null);
  const formRef = useRef(null);
  const streetRef = useRef(null);
  const photoInputRef = useRef(null);
  const point = addressPoint(draft);
  const validation = useAddressAreaValidation(draft.street, { selectedPoint: point });
  const caution = useAddressAccuracyCaution(draft.street, { gate: false, lockOnEdit: true });
  const busy = saveState !== "idle";

  useEffect(() => {
    const timer = window.setTimeout(() => {
      formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 80);
    return () => window.clearTimeout(timer);
  }, []);

  function update(patch) {
    setDraft((current) => ({ ...current, ...patch }));
    setFormError("");
  }

  function openPicker(start) {
    setAreaPicker({ start });
  }

  function acceptAreaLocation(location) {
    const next = normalizeAreaLocation(location, draft.street);
    setAreaPicker(null);
    if (!next) return;
    update({
      detectedAddress: next.address || "",
      street: next.address || draft.street,
      coordinates: next.coordinates,
    });
  }

  async function handlePhoto(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setPhotoBusy(true);
    try {
      update({ frontPictureUrl: await compressAddressPhoto(file) });
    } catch {
      setFormError(t("addressBook.pictureFailed"));
    } finally {
      setPhotoBusy(false);
    }
  }

  async function submit(event) {
    event?.preventDefault();
    if (busy) return;
    if (!getAddressText(draft)) {
      setFormError(t("addressBook.needAddress"));
      streetRef.current?.focus();
      return;
    }

    setSaveState("saving");
    const startedAt = Date.now();
    try {
      const result = await onSave(draft);
      await wait(Math.max(0, SAVING_MIN_MS - (Date.now() - startedAt)));
      setSaveState("saved");
      await wait(SAVED_HOLD_MS);
      result?.finish?.();
    } catch (error) {
      setSaveState("idle");
      setFormError(t("addressBook.saveFailed"));
      showToast(shortErrorToast(error, t("addressBook.toastSaveFailed")), "danger");
    }
  }

  return (
    <form
      ref={formRef}
      onSubmit={submit}
      aria-busy={busy || undefined}
      className="kt-page-fade-slide relative grid scroll-mt-4 gap-3 overflow-hidden rounded-2xl border border-gray-200 bg-white p-4 shadow-sm"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-black text-gray-950">
            {initial.id ? t("addressBook.formEditTitle") : t("addressBook.formAddTitle")}
          </p>
          <p className="mt-1 text-xs font-semibold leading-5 text-gray-500">{t("addressBook.formHint")}</p>
        </div>
        <button
          type="button"
          onClick={onCancel}
          disabled={busy}
          className="kt-touchable flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-gray-200 text-gray-500 hover:bg-gray-50 disabled:opacity-40"
          aria-label={t("addressBook.closeForm")}
        >
          <X size={16} />
        </button>
      </div>

      <label className="space-y-1">
        <FieldLabel>{t("addressBook.category")}</FieldLabel>
        <select
          value={draft.category}
          onChange={(event) => update({ category: event.target.value })}
          className={`${inputClass} font-black`}
        >
          {categories.map((category) => (
            <option key={category} value={category}>
              {getAddressCategoryLabel({ category })}
            </option>
          ))}
        </select>
      </label>

      {draft.category === "Other" ? (
        <label className="space-y-1">
          <FieldLabel>{t("addressBook.customCategory")}</FieldLabel>
          <input
            value={draft.customCategory}
            onChange={(event) => update({ customCategory: event.target.value })}
            placeholder={t("addressBook.customCategoryPlaceholder")}
            className={inputClass}
          />
        </label>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="space-y-1">
          <FieldLabel>{t("addressBook.contactName")}</FieldLabel>
          <input
            value={draft.fullName}
            onChange={(event) => update({ fullName: event.target.value })}
            placeholder={t("addressBook.contactNamePlaceholder")}
            autoComplete="name"
            className={inputClass}
          />
        </label>
        <label className="space-y-1">
          <FieldLabel>{t("addressBook.phone")}</FieldLabel>
          <input
            value={draft.phone}
            onChange={(event) => update({ phone: event.target.value })}
            placeholder={t("addressBook.phonePlaceholder")}
            inputMode="tel"
            autoComplete="tel"
            className={inputClass}
          />
        </label>
      </div>

      <div className="relative">
        <label className="block space-y-1">
          <span className="inline-flex items-center gap-2 text-xs font-black uppercase text-gray-500">
            {t("addressBook.street")}
            <AddressAreaStatusIcon status={validation.status} />
          </span>
          <input
            ref={streetRef}
            value={draft.street}
            onChange={caution.guardChange((event) => update({ street: event.target.value }))}
            {...caution.inputProps}
            placeholder={t("addressBook.streetPlaceholder")}
            autoComplete="street-address"
            className={`kt-address-entry-input ${inputClass}`}
          />
        </label>

        <AddressAccuracyCaution
          cover
          open={caution.open}
          onLocateMe={() => caution.act(() => openPicker("current"))}
          onDropPin={() => caution.act(() => openPicker("dropPin"))}
          onContinueWriting={() => {
            caution.dismiss();
            window.requestAnimationFrame(() => streetRef.current?.focus());
          }}
          title={t("addressBook.cautionTitle")}
          message={t("addressBook.cautionMessage")}
          details={t("urmall.biz.reg.accuracyDetails")}
          locateLabel={t("addressBook.locateMe")}
          dropPinLabel={t("addressBook.dropPin")}
          continueLabel={t("urmall.biz.reg.accuracyContinueWriting")}
          readMoreLabel={t("urmall.biz.reg.accuracyReadMore")}
          readLessLabel={t("urmall.biz.reg.accuracyReadLess")}
        />
      </div>

      <AddressAreaResolutionCard
        validation={validation}
        onLocateMe={() => caution.act(() => openPicker("current"))}
        onDropPin={() => caution.act(() => openPicker("dropPin"))}
        locateLabel={t("addressBook.locateMe")}
        dropPinLabel={t("addressBook.dropPin")}
      />

      <div className="grid grid-cols-1 gap-2">
        <button
          type="button"
          onClick={() => caution.act(() => openPicker("current"))}
          className="kt-touchable inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-gray-950 px-4 text-sm font-black text-white transition hover:bg-gray-800"
        >
          <LocateFixed size={16} />
          {t("addressBook.locateMe")}
        </button>
        <button
          type="button"
          onClick={() => caution.act(() => openPicker("dropPin"))}
          className="kt-touchable inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white px-4 text-sm font-black text-gray-700 transition hover:bg-gray-50"
        >
          <MapPin size={16} />
          {t("addressBook.dropPin")}
        </button>
      </div>

      {point && draft.detectedAddress ? (
        <p className="flex items-start gap-2 rounded-xl bg-emerald-50 p-3 text-xs font-bold leading-5 text-emerald-800">
          <CheckCircle2 size={15} className="mt-0.5 shrink-0" />
          <span className="min-w-0 break-words">{t("addressBook.pinned", { address: draft.detectedAddress })}</span>
        </p>
      ) : null}

      <label className="space-y-1">
        <FieldLabel>{t("addressBook.note")}</FieldLabel>
        <textarea
          value={draft.note}
          onChange={(event) => update({ note: event.target.value })}
          placeholder={t("addressBook.notePlaceholder")}
          rows={3}
          className="w-full resize-none rounded-xl border border-gray-200 bg-gray-50 px-3 py-3 text-sm font-semibold text-gray-950 outline-none focus:border-emerald-500"
        />
      </label>

      <div className="space-y-2">
        <FieldLabel>{t("addressBook.picture")}</FieldLabel>
        <div className="grid grid-cols-[96px_1fr] gap-3">
          <button
            type="button"
            onClick={() => photoInputRef.current?.click()}
            className="kt-touchable flex aspect-square items-center justify-center overflow-hidden rounded-xl border border-dashed border-gray-300 bg-gray-50"
            aria-label={draft.frontPictureUrl ? t("addressBook.pictureChange") : t("addressBook.pictureAdd")}
          >
            {draft.frontPictureUrl ? (
              <img src={resizedImageUrl(draft.frontPictureUrl, { width: 240, quality: 70 })} alt="" className="h-full w-full object-cover" />
            ) : (
              <Camera className="text-gray-400" size={28} />
            )}
          </button>
          <div className="flex min-w-0 flex-col justify-center gap-2">
            <p className="text-xs font-semibold leading-5 text-gray-500">
              {photoBusy ? t("addressBook.pictureProcessing") : t("addressBook.pictureHint")}
            </p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => photoInputRef.current?.click()}
                disabled={photoBusy}
                className="kt-touchable h-9 rounded-lg bg-gray-950 px-3 text-xs font-black text-white disabled:opacity-50"
              >
                {draft.frontPictureUrl ? t("addressBook.pictureChange") : t("addressBook.pictureAdd")}
              </button>
              {draft.frontPictureUrl ? (
                <button
                  type="button"
                  onClick={() => update({ frontPictureUrl: "" })}
                  className="kt-touchable h-9 rounded-lg border border-gray-200 px-3 text-xs font-black text-gray-600"
                >
                  {t("addressBook.pictureRemove")}
                </button>
              ) : null}
            </div>
          </div>
        </div>
        <input ref={photoInputRef} type="file" accept="image/*" onChange={handlePhoto} className="hidden" />
      </div>

      {formError ? (
        <p role="alert" className="rounded-xl bg-rose-50 p-3 text-xs font-bold leading-5 text-rose-700">{formError}</p>
      ) : null}

      <button
        type="submit"
        disabled={busy || photoBusy}
        className={`kt-touchable relative inline-flex h-12 w-full items-center justify-center gap-2 overflow-hidden rounded-xl px-4 text-sm font-black text-white shadow-sm transition-colors ${
          saveState === "saved" ? "bg-emerald-500" : "bg-emerald-600 hover:bg-emerald-700"
        } disabled:cursor-default`}
      >
        {initial.id ? t("addressBook.update") : t("addressBook.save")}
      </button>

      {busy ? (
        <div
          className="kt-address-saving-overlay absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 bg-white/90 px-6 text-center backdrop-blur-[2px] dark:bg-slate-950/90"
          role="status"
          aria-live="polite"
        >
          {saveState === "saving" ? (
            <>
              <span className="relative flex h-16 w-16 items-end justify-center">
                <span className="kt-address-saving-pin relative z-10 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-600 text-white shadow-lg shadow-emerald-600/30">
                  <MapPin size={24} />
                </span>
                <span className="kt-address-saving-shadow absolute -bottom-1 h-2 w-8 rounded-full bg-slate-900/30" />
              </span>
              <p className="text-base font-black text-gray-950 dark:text-white">{t("addressBook.saving")}</p>
              <p className="max-w-xs text-xs font-semibold leading-5 text-gray-500 dark:text-slate-300">{t("addressBook.savingHint")}</p>
              <span className="relative mt-1 h-1.5 w-40 overflow-hidden rounded-full bg-emerald-100 dark:bg-emerald-500/20">
                <span className="kt-address-saving-bar absolute inset-y-0 left-0 w-2/5 rounded-full bg-emerald-600" />
              </span>
            </>
          ) : (
            <>
              <span className="kt-address-saved-pop flex h-16 w-16 items-center justify-center rounded-full bg-emerald-600 text-white shadow-lg shadow-emerald-600/30">
                <CheckCircle2 size={32} />
              </span>
              <p className="text-base font-black text-gray-950 dark:text-white">{t("addressBook.saved")}</p>
              <p className="max-w-xs text-xs font-semibold leading-5 text-gray-500 dark:text-slate-300">{t("addressBook.savedHint")}</p>
            </>
          )}
        </div>
      ) : null}

      {areaPicker ? (
        <AppPortal>
          <div className="fixed inset-0 z-[1300] bg-slate-950">
            <NearbyAreaScreen
              mode="businessLocationPicker"
              pickerStart={areaPicker.start}
              pickerLabels={pickerLabels}
              backLabel={pickerBackLabel}
              onBack={() => setAreaPicker(null)}
              onLocationPicked={acceptAreaLocation}
            />
          </div>
        </AppPortal>
      ) : null}
    </form>
  );
}

export default function SavedAddressBook({
  addresses = [],
  categories,
  createEmptyAddress,
  getKey,
  selectedKey = "",
  menuActions = [],
  onSave,
  onRemove,
  pickerLabels,
  pickerBackLabel,
}) {
  useI18n();
  const [form, setForm] = useState(null); // { session, initial }
  const [menuKey, setMenuKey] = useState("");
  const [highlightKey, setHighlightKey] = useState("");
  const addButtonRef = useRef(null);
  const menuAddress = useMemo(
    () => addresses.find((address) => getKey(address) === menuKey) || null,
    [addresses, getKey, menuKey],
  );

  useEffect(() => {
    if (!highlightKey) return undefined;
    const timer = window.setTimeout(() => setHighlightKey(""), 2600);
    return () => window.clearTimeout(timer);
  }, [highlightKey]);

  function openForm(initial) {
    setMenuKey("");
    setForm({ session: Date.now(), initial: { ...createEmptyAddress(), ...initial } });
  }

  // `onSave(draft)` persists and resolves with
  //   { address, synced, apply }
  // where `apply()` puts the saved list on screen. It is held back until the
  // "saved" state has shown, so the location lands in the list as the form
  // closes rather than appearing behind the saving animation. `synced: false`
  // means it is kept on this device only (offline, or not signed in).
  async function saveAddress(draft) {
    const editing = Boolean(draft.id);
    const result = await onSave(draft);
    return {
      finish() {
        result?.apply?.();
        setForm(null);
        setHighlightKey(result?.address ? getKey(result.address) : "");
        if (result?.synced === false) showToast(t("addressBook.toastSavedLocal"), "success");
        else showToast(editing ? t("addressBook.toastUpdated") : t("addressBook.toastSaved"), "success");
        window.requestAnimationFrame(() => {
          addButtonRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
        });
      },
    };
  }

  async function removeAddress(address) {
    setMenuKey("");
    if (form && getKey(form.initial) === getKey(address)) setForm(null);
    try {
      const result = await onRemove(address);
      showToast(result?.synced === false ? t("addressBook.toastRemovedLocal") : t("addressBook.toastRemoved"), "success");
    } catch (error) {
      showToast(shortErrorToast(error, t("addressBook.toastRemovedLocal")), "info");
    }
  }

  async function shareAddress(address) {
    setMenuKey("");
    const text = getAddressShareText(address);
    try {
      if (navigator.share) {
        await navigator.share({ title: t("addressBook.shareTitle", { label: getAddressCategoryLabel(address) }), text });
        return;
      }
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        showToast(t("addressBook.toastCopied"), "success");
        return;
      }
      throw new Error("Sharing is unavailable.");
    } catch (error) {
      if (error?.name === "AbortError") return;
      showToast(t("addressBook.toastShareFailed"), "danger");
    }
  }

  return (
    <div className="space-y-4">
      {addresses.length ? (
        <section className="space-y-2">
          <p className="text-sm font-black text-gray-950">{t("addressBook.listHeading")}</p>
          {addresses.map((address) => {
            const key = getKey(address);
            const selected = Boolean(selectedKey) && key === selectedKey;
            return (
              <article
                key={key}
                className={`relative rounded-xl border bg-white p-3 text-left shadow-sm ${
                  highlightKey === key ? "kt-address-card-new border-emerald-300" : "border-gray-200"
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <button type="button" onClick={() => openForm(address)} className="kt-touchable flex min-w-0 flex-1 items-start gap-3 text-left">
                    {address.frontPictureUrl ? (
                      <img src={resizedImageUrl(address.frontPictureUrl, { width: 96, quality: 65 })} alt="" className="h-11 w-11 shrink-0 rounded-lg object-cover" />
                    ) : (
                      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700">
                        <MapPin size={19} />
                      </span>
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-black text-gray-950">{getAddressCategoryLabel(address)}</span>
                        {selected ? (
                          <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-black uppercase tracking-wide text-emerald-700">
                            {t("addressBook.inUse")}
                          </span>
                        ) : null}
                      </span>
                      <span className="mt-1 line-clamp-2 block text-xs font-semibold leading-5 text-gray-500">{getAddressText(address)}</span>
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setMenuKey((current) => (current === key ? "" : key))}
                    className="kt-touchable flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-gray-200 bg-white text-gray-500 hover:bg-gray-50 hover:text-gray-950"
                    aria-label={t("addressBook.actionsAria", { label: getAddressCategoryLabel(address) })}
                    aria-expanded={menuKey === key}
                    aria-haspopup="menu"
                  >
                    <MoreHorizontal size={18} />
                  </button>
                </div>
              </article>
            );
          })}
        </section>
      ) : null}

      {form ? (
        <SavedAddressForm
          key={form.session}
          initial={form.initial}
          categories={categories}
          pickerLabels={pickerLabels}
          pickerBackLabel={pickerBackLabel}
          onSave={saveAddress}
          onCancel={() => setForm(null)}
        />
      ) : (
        <button
          ref={addButtonRef}
          type="button"
          onClick={() => openForm({})}
          className="kt-touchable inline-flex h-12 w-full scroll-mb-6 items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 text-sm font-black text-white shadow-sm hover:bg-emerald-700"
        >
          <Plus size={17} />
          {addresses.length ? t("addressBook.addAnother") : t("addressBook.addFirst")}
        </button>
      )}

      {menuAddress ? (
        <AppPortal>
          <div
            className="fixed inset-0 z-[1300] flex items-end justify-center bg-slate-950/20 px-3 py-4 sm:items-center sm:p-6"
            role="presentation"
            onClick={() => setMenuKey("")}
          >
            <section
              className="kt-modal-enter w-full max-w-sm overflow-hidden rounded-[1.75rem] border border-gray-200 bg-white p-2 shadow-2xl shadow-slate-950/20 sm:max-w-xs"
              role="menu"
              aria-label={t("addressBook.menuAria", { label: getAddressCategoryLabel(menuAddress) })}
              onClick={(event) => event.stopPropagation()}
            >
              <div className="border-b border-gray-100 px-3 py-3">
                <p className="text-xs font-black uppercase tracking-wide text-emerald-700">{getAddressCategoryLabel(menuAddress)}</p>
                <p className="mt-1 line-clamp-2 text-xs font-semibold leading-5 text-gray-500">
                  {getAddressText(menuAddress) || t("addressBook.addressPending")}
                </p>
              </div>
              <div className="grid gap-1 p-1">
                {menuActions.map((action) => (
                  <MenuAction
                    key={action.id}
                    icon={action.icon}
                    label={action.label}
                    onClick={() => {
                      setMenuKey("");
                      action.onSelect(menuAddress);
                    }}
                  />
                ))}
                <MenuAction icon={Pencil} label={t("addressBook.edit")} onClick={() => openForm(menuAddress)} />
                <MenuAction icon={Share2} label={t("addressBook.share")} onClick={() => shareAddress(menuAddress)} />
                <MenuAction danger icon={Trash2} label={t("addressBook.delete")} onClick={() => removeAddress(menuAddress)} />
              </div>
            </section>
          </div>
        </AppPortal>
      ) : null}
    </div>
  );
}
