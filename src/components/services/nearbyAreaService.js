import {
  getCountryPhonePlaceholder,
  getEmergencyContactsForCountry,
} from "../../data/westAfricanCountryProfiles";

const activeEmergencyContacts = getEmergencyContactsForCountry();
const fallbackPhone = getCountryPhonePlaceholder();

export const locationCategories = [
  "All",
  "Fleets",
  "Pickup",
  "Shops",
  "Schools",
  "Markets",
  "Emergency",
  "Community",
];

export const nearbyLocations = [];

export const emergencyContacts = [
  { id: "trusted", label: "Trusted Contact", value: fallbackPhone },
  { id: "police", label: "Police Help", value: activeEmergencyContacts.police?.[0] || fallbackPhone },
  { id: "clinic", label: "Nearest Clinic", value: activeEmergencyContacts.ambulance?.[0] || fallbackPhone },
];

export const locationStatusStyles = {
  community: {
    label: "Community Added",
    className: "border-purple-200 bg-purple-100 text-purple-700",
  },
  pending: {
    label: "Under Review",
    className: "border-amber-200 bg-amber-100 text-amber-800",
  },
  verified: {
    label: "Verified Location",
    className: "border-green-200 bg-green-100 text-green-700",
  },
};
