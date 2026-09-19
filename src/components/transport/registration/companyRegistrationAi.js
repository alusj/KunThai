import { constrainCountryPhoneInput, getActiveCountryProfile, GLOBAL_COUNTRY_PROFILES } from "../../../data/globalCountryProfiles";
import { t } from "../../../i18n";

// KAI on the UrRide transport-company registration.
//
// KAI may fill the company details, location text, operating areas and each
// fleet's details and prices. It never fills documents, photos or the map pin.
// A fleet's service category and vehicle type rebuild that fleet's safety
// checklist, so the person picks those in the form. Values go through the
// screen's own setters.

const COMPANY_TYPES = ["Transport company", "Delivery company", "Taxi union", "Bike riders group", "Community fleet", "Other organization"];
const MAX_FLEETS = 6;
const FLEET_TEXT_FIELDS = [
  ["fleetName", "Fleet name", 80],
  ["plateNumber", "Plate number", 20],
  ["make", "Make", 40],
  ["model", "Model", 40],
  ["color", "Colour", 30],
  ["operatingArea", "Operating area", 120],
  ["homeBase", "Home base", 120],
  ["priceHint", "Price note", 120],
];
const FLEET_NUMBER_FIELDS = [
  ["year", "Year"],
  ["baseFare", "Starting price"],
  ["pricePerKm", "Price per km"],
  ["pricePerHour", "Price per hour"],
];

function matchCountry(text) {
  const wanted = String(text || "").trim().toLowerCase();
  const country = GLOBAL_COUNTRY_PROFILES.find((profile) => (
    profile.name.toLowerCase() === wanted || String(profile.iso2 || "").toLowerCase() === wanted
  ));
  return country ? { ok: true, value: country.name, display: country.name } : { ok: false, reason: "Not a country KunThai supports." };
}

export function buildCompanyRegistrationAiContext({
  step,
  form,
  fleets,
  areaText,
  fieldErrors,
  status,
  updateForm,
  updateFleet,
  setAreaText,
}) {
  const currency = form.currency || "local currency";
  const fields = [
    { key: "companyName", label: "Company name", type: "text", required: true, maxLength: 100, value: form.companyName },
    {
      key: "companyType",
      label: "Company type",
      type: "select",
      options: COMPANY_TYPES.map((value) => ({ value, label: t(`urride.companyReg.type.${value}`) })),
      value: form.companyType,
    },
    { key: "registrationNumber", label: "Business registration number", type: "text", maxLength: 60, value: form.registrationNumber },
    { key: "taxId", label: "Tax ID", type: "text", maxLength: 60, value: form.taxId },
    { key: "ownerName", label: "Owner / manager name", type: "text", maxLength: 80, value: form.ownerName },
    { key: "phone", label: "Company phone", type: "phone", required: true, value: form.phone },
    { key: "email", label: "Company email", type: "email", value: form.email },
    { key: "country", label: "Country (full country name)", type: "text", required: true, normalize: matchCountry, value: form.country },
    { key: "city", label: "City / town", type: "text", required: true, maxLength: 80, value: form.city },
    { key: "address", label: "Street address", type: "text", maxLength: 200, value: form.address },
    { key: "pin", label: "Exact map location (use Locate me or Drop a pin)", type: "file", value: form.coordinates ? "set" : "" },
    { key: "operatingAreas", label: "Operating areas (comma separated)", type: "text", maxLength: 300, value: areaText },
    { key: "supportPolicy", label: "Support / customer care policy", type: "textarea", maxLength: 600, value: form.supportPolicy },
    { key: "documents", label: "Company documents", type: "file", value: Object.keys(form.documents || {}).length ? "some added" : "" },
  ];

  (fleets || []).slice(0, MAX_FLEETS).forEach((fleet, index) => {
    const prefix = `fleet${index + 1}`;
    const name = fleet.fleetName || `Fleet ${index + 1}`;
    fields.push(
      { key: `${prefix}.serviceCategory`, label: `${name} — service category (choose in the form)`, type: "text", fillable: false, value: fleet.serviceCategory },
      { key: `${prefix}.fleetType`, label: `${name} — vehicle type (choose in the form)`, type: "text", fillable: false, value: fleet.fleetType },
    );
    FLEET_TEXT_FIELDS.forEach(([field, label, maxLength]) => {
      fields.push({ key: `${prefix}.${field}`, label: `${name} — ${label}`, type: "text", maxLength, value: fleet[field] });
    });
    FLEET_NUMBER_FIELDS.forEach(([field, label]) => {
      const priced = field !== "year";
      fields.push({
        key: `${prefix}.${field}`,
        label: `${name} — ${label}${priced ? ` (${currency})` : ""}`,
        type: "number",
        min: field === "year" ? 1950 : 0,
        ...(field === "year" ? { max: new Date().getFullYear() + 1 } : {}),
        value: fleet[field],
      });
    });
    fields.push({ key: `${prefix}.photos`, label: `${name} — photos and documents`, type: "image", value: "" });
  });

  const errors = Object.values(fieldErrors || {}).filter(Boolean);

  return {
    id: "urride-company-registration",
    title: "UrRide transport company registration",
    describe: () => [
      `The person is registering a transport company on UrRide (step ${Number(step || 0) + 1}), with ${fleets?.length || 0} fleet(s) so far.`,
      `Country: ${form.country || "not set"}; prices are in ${currency}.`,
      status ? `Message shown: ${status}.` : "",
      errors.length ? `Problems shown on the form: ${errors.slice(0, 6).join("; ")}.` : "",
      "Each fleet's service category and vehicle type, documents, photos and the map pin are set by the person in the form.",
    ].filter(Boolean).join(" "),
    form: {
      fields: () => fields,
      apply: (values) => {
        const fleetPatches = {};
        // Country first: it resets currency and the fleets' allowed options.
        if (values.country) updateForm("country", values.country);
        const country = getActiveCountryProfile(values.country || form.country);
        Object.entries(values).forEach(([key, value]) => {
          if (key === "country") return;
          const fleetMatch = key.match(/^fleet(\d+)\.(.+)$/);
          if (fleetMatch) {
            const fleet = fleets?.[Number(fleetMatch[1]) - 1];
            if (!fleet) return;
            fleetPatches[fleet.localId] = {
              ...(fleetPatches[fleet.localId] || {}),
              [fleetMatch[2]]: fleetMatch[2] === "plateNumber" ? String(value).toUpperCase() : value,
            };
            return;
          }
          if (key === "operatingAreas") {
            setAreaText(value);
            return;
          }
          if (key === "phone") {
            updateForm("phone", constrainCountryPhoneInput(value, country, { international: true }));
            return;
          }
          updateForm(key, value);
        });
        Object.entries(fleetPatches).forEach(([localId, patch]) => updateFleet(localId, patch));
      },
    },
  };
}
