import { useEffect, useRef } from "react";
import { FiChevronDown, FiChevronUp, FiPlus, FiTrash2 } from "react-icons/fi";

import CenteredModal from "../../../../shared/CenteredModal";
import RegistrationField from "./RegistrationField";
import RegistrationInput from "./RegistrationInput";
import ToggleRow from "./ToggleRow";
import {
  AddressAccuracyCaution,
  AddressAreaResolutionCard,
  AddressAreaStatusIcon,
  useAddressAccuracyCaution,
  useAddressAreaValidation,
} from "../../../../shared/AddressAreaValidation";
import { useAutoCollapseCard } from "../../../../shared/motionHooks";
import {
  constrainCountryPhoneInput,
  getActiveCountryProfile,
  getCountryPhoneHint,
  validateCountryPhone,
  GLOBAL_COUNTRY_PROFILES,
} from "../../../../../data/globalCountryProfiles";
import { useI18n, t } from "../../../../../i18n";
import { t as i18nText } from "../../../../../i18n/index";

function toOptionalCoordinate(value) {
  if (value === null || value === undefined || value === "") return null;
  const coordinate = Number(value);
  return Number.isFinite(coordinate) ? coordinate : null;
}

function coordinatesMatch(first, second) {
  const firstLat = toOptionalCoordinate(first?.latitude ?? first?.lat);
  const firstLng = toOptionalCoordinate(first?.longitude ?? first?.lng);
  const secondLat = toOptionalCoordinate(second?.latitude ?? second?.lat);
  const secondLng = toOptionalCoordinate(second?.longitude ?? second?.lng);
  if (firstLat === null || firstLng === null || secondLat === null || secondLng === null) return false;
  return Math.abs(firstLat - secondLat) < 0.000001 && Math.abs(firstLng - secondLng) < 0.000001;
}

export default function LocationContactStep({ registration }) {
  useI18n();
  const {
    form,
    errors,
    locationCandidate,
    locationPromptOpen,
    locationStatus,
    locating,
    closeLocationPrompt,
    openCurrentLocationPicker,
    openDropPinPicker,
    updateSection,
    locateBusiness,
    addBranch,
    updateBranch,
    removeBranch,
    maxBusinessLocations = 10,
  } = registration;
  const branches = form.location.branches || [];
  const totalAddresses = 1 + branches.length;
  const addressesFull = totalAddresses >= maxBusinessLocations;
  const locationPoint = form.location.coordinates
    ? {
        lat: form.location.coordinates.latitude ?? form.location.coordinates.lat,
        lng: form.location.coordinates.longitude ?? form.location.coordinates.lng,
        address: form.location.address,
      }
    : null;
  const addressValidation = useAddressAreaValidation(form.location.address, { selectedPoint: locationPoint });
  const addressValidationResult = addressValidation.result;
  const accuracyCaution = useAddressAccuracyCaution(form.location.address);
  const addressInputRef = useRef(null);
  const locationPromptCollapse = useAutoCollapseCard({
    enabled: locationPromptOpen && !locating,
    resetKey: [locationPromptOpen ? "open" : "closed", locationStatus, locating ? "locating" : "ready"].join("|"),
  });
  const countryProfile = getActiveCountryProfile(form.location.country);
  const phoneValidation = validateCountryPhone(form.location.phone, countryProfile);

  useEffect(() => {
    if (addressValidation.status !== "found" || !String(form.location.address || "").trim()) return;

    const latitude = toOptionalCoordinate(
      addressValidationResult?.lat ?? addressValidationResult?.latitude ?? addressValidationResult?.coordinates?.latitude,
    );
    const longitude = toOptionalCoordinate(
      addressValidationResult?.lng ?? addressValidationResult?.longitude ?? addressValidationResult?.coordinates?.longitude,
    );
    if (latitude === null || longitude === null) return;

    const nextCoordinates = { latitude, longitude };
    if (coordinatesMatch(form.location.coordinates, nextCoordinates)) return;

    updateSection("location", { coordinates: nextCoordinates });
  }, [addressValidation.status, addressValidationResult, form.location.address, form.location.coordinates, updateSection]);

  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <RegistrationField label={t("urmall.biz.settings.country")} error={errors.country}>
          <select
            value={form.location.country}
            onChange={(event) => updateSection("location", { country: event.target.value })}
            autoComplete="country-name"
            className="kt-registration-input h-12 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm font-bold text-gray-900 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
          >
            {GLOBAL_COUNTRY_PROFILES.map((country) => (
              <option key={country.iso2} value={country.name}>{country.name}</option>
            ))}
          </select>
        </RegistrationField>
        <RegistrationField label={t("urmall.biz.settings.city")} error={errors.city}>
          <RegistrationInput
            value={form.location.city}
            onChange={(event) => updateSection("location", { city: event.target.value })}
            placeholder={t("urmall.biz.settings.city")}
            autoComplete="address-level2"
          />
        </RegistrationField>
      </div>

      <div className="kt-address-entry-card space-y-4 rounded-xl border border-blue-100 bg-blue-50/40 p-4">
        <p className="text-xs font-black uppercase tracking-wide text-blue-700">{t("urmall.biz.reg.addressNofM", { n: 1, max: maxBusinessLocations })}</p>

        <RegistrationField label={t("urmall.biz.settings.storeName")}>
          <RegistrationInput
            value={form.location.mainLabel ?? t("urmall.biz.reg.mainStore")}
            onChange={(event) => updateSection("location", { mainLabel: event.target.value })}
            placeholder={t("urmall.biz.reg.mainStore")}
          />
        </RegistrationField>

        <RegistrationField
          label={(
            <span className="inline-flex items-center gap-2">
              {t("urmall.biz.reg.address")}
              <AddressAreaStatusIcon status={addressValidation.status} />
            </span>
          )}
        >
          <RegistrationInput
            ref={addressInputRef}
            value={form.location.address}
            onChange={(event) => updateSection("location", { address: event.target.value })}
            onBlur={accuracyCaution.handleAddressBlur}
            placeholder={t("urmall.biz.reg.bizAddressPlaceholder")}
            autoComplete="street-address"
          />
        </RegistrationField>

        <AddressAreaResolutionCard
          validation={addressValidation}
          onLocateMe={() => accuracyCaution.act(() => locateBusiness("main"))}
          onDropPin={() => accuracyCaution.act(() => openDropPinPicker("main"))}
          tone="blue"
        />

        <AddressAccuracyCaution
          open={accuracyCaution.open}
          onLocateMe={() => accuracyCaution.act(() => locateBusiness("main"))}
          onDropPin={() => accuracyCaution.act(() => openDropPinPicker("main"))}
          onContinueWriting={() => {
            accuracyCaution.dismiss();
            window.requestAnimationFrame(() => addressInputRef.current?.focus());
          }}
          title={t("urmall.biz.reg.accuracyTitle")}
          message={t("urmall.biz.reg.accuracyMessage")}
          details={t("urmall.biz.reg.accuracyDetails")}
          locateLabel={t("urmall.biz.reg.locateMe")}
          dropPinLabel={t("urmall.biz.reg.dropPin")}
          continueLabel={t("urmall.biz.reg.accuracyContinueWriting")}
          readMoreLabel={t("urmall.biz.reg.accuracyReadMore")}
          readLessLabel={t("urmall.biz.reg.accuracyReadLess")}
        />

        <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] sm:items-center">
          <button
            type="button"
            onClick={() => accuracyCaution.act(() => locateBusiness("main"))}
            className="rounded-lg bg-gray-900 px-4 py-3 text-sm font-black text-white transition hover:bg-gray-800"
          >
            {t("urmall.biz.reg.locateMe")}
          </button>
          <span className="justify-self-center rounded-full border border-blue-100 bg-blue-50 px-3 py-1 text-[11px] font-black uppercase tracking-wide text-blue-700">
            {t("urmall.biz.reg.recommended")}
          </span>
          <button
            type="button"
            onClick={() => accuracyCaution.act(() => openDropPinPicker("main"))}
            className="rounded-lg border border-gray-200 bg-white px-4 py-3 text-sm font-black text-gray-700 transition hover:bg-gray-50"
          >
            {t("urmall.biz.reg.dropPin")}
          </button>
        </div>
      </div>

      {branches.map((branch, index) => (
        <BranchAddressCard
          key={`branch-${index}`}
          branch={branch}
          index={index}
          maxBusinessLocations={maxBusinessLocations}
          updateBranch={updateBranch}
          removeBranch={removeBranch}
          locateBusiness={locateBusiness}
          openDropPinPicker={openDropPinPicker}
        />
      ))}

      <div className="space-y-2">
        <button
          type="button"
          onClick={addBranch}
          disabled={addressesFull}
          className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-blue-200 bg-white px-4 text-sm font-black text-blue-700 transition hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <FiPlus strokeWidth={3} />
          {t("urmall.biz.reg.addAddress")}
        </button>
        <p className="text-xs font-bold text-gray-500">
          {addressesFull
            ? t("urmall.biz.reg.addressesFull", { max: maxBusinessLocations })
            : t("urmall.biz.reg.addressesHint", { max: maxBusinessLocations, count: totalAddresses })}
        </p>
      </div>

      {locationStatus ? <p className="text-sm font-bold text-gray-600">{locationStatus}</p> : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <RegistrationField label={t("urmall.detail.phoneNumber")} error={errors.phone}>
          <RegistrationInput
            value={form.location.phone}
            onChange={(event) => updateSection("location", { phone: constrainCountryPhoneInput(event.target.value, countryProfile, { international: true }) })}
            placeholder={getCountryPhoneHint(countryProfile)}
            autoComplete="tel"
          />
          <span className={`mt-2 block text-xs font-bold ${phoneValidation.valid || !form.location.phone ? "text-gray-500" : "text-red-600"}`}>
            {phoneValidation.valid ? `${countryProfile.name}: ${countryProfile.dialCode} ${countryProfile.placeholder}` : phoneValidation.message}
          </span>
        </RegistrationField>
        <RegistrationField label={t("urmall.biz.reg.bizEmail")} error={errors.email}>
          <RegistrationInput
            type="email"
            value={form.location.email}
            onChange={(event) => updateSection("location", { email: event.target.value })}
            placeholder={i18nText("ui.literals.k465417316164")}
            autoComplete="email"
          />
        </RegistrationField>
      </div>

      <RegistrationField label={t("urmall.biz.reg.bizWebsite")}>
        <RegistrationInput
          type="url"
          value={form.location.website}
          onChange={(event) => updateSection("location", { website: event.target.value })}
          placeholder="https://yourbusiness.com"
          autoComplete="url"
        />
      </RegistrationField>

      <ToggleRow
        label={t("urmall.biz.reg.useWhatsapp")}
        description={t("urmall.biz.reg.useWhatsappDesc")}
        checked={form.location.whatsappEnabled}
        onChange={(checked) => updateSection("location", { whatsappEnabled: checked })}
      />
      {form.location.whatsappEnabled ? (
        <RegistrationField label={t("urmall.biz.reg.whatsappNumber")}>
          <RegistrationInput
            value={form.location.whatsapp}
            onChange={(event) => updateSection("location", { whatsapp: constrainCountryPhoneInput(event.target.value, countryProfile, { international: true }) })}
            placeholder={getCountryPhoneHint(countryProfile)}
          />
        </RegistrationField>
      ) : null}

      <ToggleRow
        label={t("urmall.biz.reg.discoverable")}
        description={t("urmall.biz.reg.discoverableDesc")}
        checked={form.location.discoverableNearby}
        onChange={(checked) => updateSection("location", { discoverableNearby: checked })}
      />

      {locationPromptOpen && locationPromptCollapse.collapsed ? (
        <div className="fixed bottom-5 right-4 z-50">
          <button
            type="button"
            onClick={locationPromptCollapse.expand}
            className="kt-pressable flex h-12 w-12 items-center justify-center rounded-full border-2 border-gray-300 bg-white/95 text-xl font-black text-gray-950 shadow-2xl backdrop-blur"
            aria-label={t("urmall.biz.reg.maximizeLocation")}
          >
            <FiChevronUp strokeWidth={3.2} />
          </button>
        </div>
      ) : null}

      <CenteredModal
        open={locationPromptOpen && !locationPromptCollapse.collapsed}
        onClose={closeLocationPrompt}
        maxWidth="max-w-lg"
        dismissOnBackdrop={false}
        labelledBy="biz-location-title"
      >
        <button
          type="button"
          onClick={closeLocationPrompt}
          className="absolute left-4 top-4 flex h-9 w-9 items-center justify-center rounded-full bg-gray-100 text-lg font-black text-gray-700 hover:bg-gray-200"
          aria-label={t("urmall.biz.reg.cancelLocation")}
        >
          X
        </button>
        <button
          type="button"
          onClick={locationPromptCollapse.collapse}
          className="kt-pressable absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-full border-2 border-gray-300 bg-white text-lg font-black text-gray-950 shadow-sm"
          aria-label={t("urmall.biz.reg.minimizeLocation")}
        >
          <FiChevronDown strokeWidth={3.2} />
        </button>
        <div className="pl-12">
          <p id="biz-location-title" className="text-lg font-black text-gray-950">{t("urmall.biz.reg.confirmLocation")}</p>
          <p className="mt-2 text-sm font-semibold leading-6 text-gray-600">
            {t("urmall.biz.reg.confirmLocationHint")}
          </p>
        </div>
        {locationCandidate || locating ? (
          <p className="mt-4 rounded-xl bg-blue-50 px-4 py-3 text-sm font-bold text-blue-700">
            {t("urmall.biz.reg.preparingTools")}
          </p>
        ) : null}
        <div className="mt-5 grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] sm:items-center">
          <button
            type="button"
            onClick={openCurrentLocationPicker}
            className="rounded-xl bg-blue-600 px-4 py-3 text-sm font-black text-white hover:bg-blue-700"
          >
            {t("urmall.biz.reg.yesLocate")}
          </button>
          <span className="justify-self-center rounded-full border border-blue-100 bg-blue-50 px-3 py-1 text-[11px] font-black uppercase tracking-wide text-blue-700">
            {t("urmall.biz.reg.recommended")}
          </span>
          <button
            type="button"
            onClick={openDropPinPicker}
            className="rounded-xl border border-gray-200 px-4 py-3 text-sm font-black text-gray-700 hover:bg-gray-50"
          >
            {t("urmall.biz.reg.noDropPin")}
          </button>
        </div>
      </CenteredModal>
    </div>
  );
}

// Each additional branch gets the same Area View resolution the main address has:
// a live found/searching/unknown status, the confirmation card, and the locate /
// drop-a-pin actions — driven by its own address validation hook.
function BranchAddressCard({ branch, index, maxBusinessLocations, updateBranch, removeBranch, locateBusiness, openDropPinPicker }) {
  const branchPoint = branch.coordinates
    ? {
        lat: branch.coordinates.latitude ?? branch.coordinates.lat,
        lng: branch.coordinates.longitude ?? branch.coordinates.lng,
        address: branch.address,
      }
    : null;
  const validation = useAddressAreaValidation(branch.address, { selectedPoint: branchPoint });
  const result = validation.result;
  const accuracyCaution = useAddressAccuracyCaution(branch.address);
  const addressInputRef = useRef(null);

  useEffect(() => {
    if (validation.status !== "found" || !String(branch.address || "").trim()) return;
    const latitude = toOptionalCoordinate(result?.lat ?? result?.latitude ?? result?.coordinates?.latitude);
    const longitude = toOptionalCoordinate(result?.lng ?? result?.longitude ?? result?.coordinates?.longitude);
    if (latitude === null || longitude === null) return;
    const nextCoordinates = { latitude, longitude };
    if (coordinatesMatch(branch.coordinates, nextCoordinates)) return;
    updateBranch(index, { coordinates: nextCoordinates });
  }, [validation.status, result, branch.address, branch.coordinates, index, updateBranch]);

  return (
    <div className="kt-address-entry-card space-y-4 rounded-xl border border-gray-200 bg-white p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-black uppercase tracking-wide text-gray-500">{t("urmall.biz.reg.addressNofM", { n: index + 2, max: maxBusinessLocations })}</p>
        <button
          type="button"
          onClick={() => removeBranch(index)}
          className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-red-100 bg-red-50 px-3 text-xs font-black text-red-700 transition hover:bg-red-100"
          aria-label={t("urmall.biz.reg.removeAddressAria", { name: branch.label || t("urmall.biz.reg.addressN", { n: index + 2 }) })}
        >
          <FiTrash2 />
          {t("urmall.biz.reg.remove")}
        </button>
      </div>

      <RegistrationField label={t("urmall.biz.settings.storeName")}>
        <RegistrationInput
          value={branch.label}
          onChange={(event) => updateBranch(index, { label: event.target.value })}
          placeholder={t("urmall.biz.reg.secondBranch")}
        />
      </RegistrationField>

      <RegistrationField
        label={(
          <span className="inline-flex items-center gap-2">
            {t("urmall.biz.reg.address")}
            <AddressAreaStatusIcon status={validation.status} />
          </span>
        )}
      >
        <RegistrationInput
          ref={addressInputRef}
          value={branch.address}
          onChange={(event) => updateBranch(index, { address: event.target.value })}
          onBlur={accuracyCaution.handleAddressBlur}
          placeholder={t("urmall.biz.reg.branchAddressPlaceholder")}
          autoComplete="street-address"
        />
      </RegistrationField>

      <AddressAreaResolutionCard
        validation={validation}
        onLocateMe={() => accuracyCaution.act(() => locateBusiness(index))}
        onDropPin={() => accuracyCaution.act(() => openDropPinPicker(index))}
        tone="blue"
      />

      <AddressAccuracyCaution
        open={accuracyCaution.open}
        onLocateMe={() => accuracyCaution.act(() => locateBusiness(index))}
        onDropPin={() => accuracyCaution.act(() => openDropPinPicker(index))}
        onContinueWriting={() => {
          accuracyCaution.dismiss();
          window.requestAnimationFrame(() => addressInputRef.current?.focus());
        }}
        title={t("urmall.biz.reg.accuracyTitle")}
        message={t("urmall.biz.reg.accuracyMessage")}
        details={t("urmall.biz.reg.accuracyDetails")}
        locateLabel={t("urmall.biz.reg.locateMe")}
        dropPinLabel={t("urmall.biz.reg.dropPin")}
        continueLabel={t("urmall.biz.reg.accuracyContinueWriting")}
        readMoreLabel={t("urmall.biz.reg.accuracyReadMore")}
        readLessLabel={t("urmall.biz.reg.accuracyReadLess")}
      />

      <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] sm:items-center">
        <button
          type="button"
          onClick={() => accuracyCaution.act(() => locateBusiness(index))}
          className="rounded-lg bg-gray-900 px-4 py-3 text-sm font-black text-white transition hover:bg-gray-800"
        >
          {t("urmall.biz.reg.locateMe")}
        </button>
        <span className="justify-self-center rounded-full border border-blue-100 bg-blue-50 px-3 py-1 text-[11px] font-black uppercase tracking-wide text-blue-700">
          {t("urmall.biz.reg.recommended")}
        </span>
        <button
          type="button"
          onClick={() => accuracyCaution.act(() => openDropPinPicker(index))}
          className="rounded-lg border border-gray-200 bg-white px-4 py-3 text-sm font-black text-gray-700 transition hover:bg-gray-50"
        >
          {t("urmall.biz.reg.dropPin")}
        </button>
      </div>
      {branch.coordinates ? (
        <p className="text-xs font-bold text-emerald-700">{t("urmall.biz.reg.branchPinned")}</p>
      ) : null}
    </div>
  );
}
