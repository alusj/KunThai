import { constrainCountryPhoneInput } from "../../../data/globalCountryProfiles";
import { t } from "../../../i18n";

// KAI on the UrRide driver / vehicle registration.
//
// KAI is told every field of the registration (all steps) with its current
// value and may fill text, number, choice and yes/no answers. Vehicle photos
// and documents are listed so KAI can point to them, but only the person can
// add them. Values go through the drawer's own setters.

const STEP_NAMES = ["Your details", "Service type", "Vehicle & pricing", "Vehicle checks", "Photos & documents", "Review"];

const AVAILABILITY = ["Full-time", "Part-time", "Scheduled", "Weekends only", "Night service"];
const FUEL_TYPES = ["Petrol", "Diesel", "Hybrid", "Electric", "Not applicable"];
const CAR_BODY_TYPES = ["Sedan", "SUV", "Hatchback", "Minivan", "Pickup", "Van"];
const DELIVERY_BODY_TYPES = ["Open cargo", "Covered cargo", "Delivery box", "Insulated box", "Passenger + cargo"];
const ANSWERS = ["Yes", "No", "Needs admin check"];

function enumOptions(values) {
  return values.map((value) => ({ value, label: t(`urride.fleetEdit.enum.${value}`) }));
}

export function buildFleetRegistrationAiContext({
  step,
  form,
  answers,
  questions,
  categoryOptions,
  fleetTypeOptions,
  documents,
  fieldErrors,
  stepError,
  update,
  updateCategory,
  updateAnswer,
}) {
  const delivery = form.category === "Delivery" || form.category === "Both";
  const fields = [
    { key: "name", label: "Full name", type: "text", required: true, maxLength: 80, value: form.name },
    { key: "phone", label: "Phone number", type: "phone", required: true, value: form.phone },
    { key: "city", label: "City / town", type: "text", required: true, maxLength: 80, value: form.city },
    { key: "emergencyContact", label: "Emergency contact phone", type: "phone", required: true, value: form.emergencyContact },
    { key: "category", label: "Service category", type: "select", required: true, options: categoryOptions || [], value: form.category },
    { key: "fleetType", label: "Vehicle type", type: "select", required: true, options: fleetTypeOptions || [], value: form.fleetType },
    { key: "fleetName", label: "Vehicle / service name", type: "text", maxLength: 80, value: form.fleetName },
    { key: "plateNumber", label: "Plate number", type: "text", maxLength: 20, value: form.plateNumber },
    { key: "make", label: "Make", type: "text", maxLength: 40, value: form.make },
    { key: "model", label: "Model", type: "text", maxLength: 40, value: form.model },
    { key: "year", label: "Year", type: "number", min: 1950, max: new Date().getFullYear() + 1, value: form.year },
    { key: "color", label: "Colour", type: "text", maxLength: 30, value: form.color },
    { key: "operatingArea", label: "Operating area", type: "text", maxLength: 120, value: form.operatingArea },
    { key: "homeBaseLocation", label: "Home base", type: "text", maxLength: 120, value: form.homeBaseLocation },
    { key: "baseFare", label: `Starting price (${form.currency || "local currency"})`, type: "number", min: 0, value: form.baseFare },
    { key: "pricePerKm", label: `Price per km (${form.currency || "local currency"})`, type: "number", min: 0, value: form.pricePerKm },
    { key: "pricePerHour", label: `Price per hour (${form.currency || "local currency"})`, type: "number", min: 0, value: form.pricePerHour },
    { key: "priceHint", label: "Price note for passengers", type: "text", maxLength: 120, value: form.priceHint },
    { key: "availability", label: "Availability", type: "select", options: enumOptions(AVAILABILITY), value: form.availability },
  ];
  if (form.fleetType === "Car") {
    fields.push(
      { key: "fuelType", label: "Fuel type", type: "select", options: enumOptions(FUEL_TYPES), value: form.fuelType },
      { key: "carBodyType", label: "Car body type", type: "select", options: enumOptions(CAR_BODY_TYPES), value: form.carBodyType },
    );
  }
  if (delivery) fields.push({ key: "maxLoad", label: "Maximum load", type: "text", maxLength: 40, value: form.maxLoad });
  if (delivery && form.fleetType === "Tricycle") {
    fields.push({ key: "deliveryBodyType", label: "Delivery body", type: "select", options: enumOptions(DELIVERY_BODY_TYPES), value: form.deliveryBodyType });
  }
  (questions || []).forEach((question) => {
    fields.push(question.type === "number"
      ? { key: `answer.${question.key}`, label: t(question.labelKey), type: "number", min: 0, value: answers[question.key] || "" }
      : { key: `answer.${question.key}`, label: t(question.labelKey), type: "select", options: ANSWERS, value: answers[question.key] || "Yes" });
  });
  fields.push({ key: "photos", label: "Vehicle photos", type: "image", value: "" });
  (documents || []).slice(0, 8).forEach((document, index) => {
    fields.push({ key: `document.${index}`, label: document.label || document.title || "Document", type: "file", value: "" });
  });

  const errors = Object.values(fieldErrors || {}).filter(Boolean);

  return {
    id: "urride-fleet-registration",
    title: "UrRide driver & vehicle registration",
    describe: () => [
      `The person is registering as an UrRide driver/operator. Current step: ${STEP_NAMES[step] || `step ${step + 1}`}.`,
      `Country: ${form.country || "not set"}; prices are in ${form.currency || "the local currency"}.`,
      stepError ? `Message shown: ${stepError}.` : "",
      errors.length ? `Problems shown on the form: ${errors.slice(0, 6).join("; ")}.` : "",
      "Vehicle photos and documents are uploaded by the person on the Photos & documents step.",
    ].filter(Boolean).join(" "),
    form: {
      fields: () => fields,
      apply: (values) => {
        // Category first: it can change which vehicle types are available.
        if (values.category) updateCategory(values.category);
        Object.entries(values).forEach(([key, value]) => {
          if (key === "category") return;
          if (key.startsWith("answer.")) {
            updateAnswer(key.slice("answer.".length), value);
            return;
          }
          if (key === "phone" || key === "emergencyContact") {
            update(key, constrainCountryPhoneInput(value, form.countryCode || form.country, { international: true }));
            return;
          }
          if (key === "plateNumber") {
            update(key, String(value).toUpperCase());
            return;
          }
          update(key, value);
        });
      },
    },
  };
}
