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

export const nearbyLocations = [
  {
    id: "loc-home-pickup",
    name: "Lumley Safe Pickup",
    category: "Pickup",
    type: "Safe pickup point",
    status: "verified",
    description: "Busy roadside pickup point near Lumley Beach Road.",
    distance: "0.4 km",
    position: { left: "48%", top: "47%" },
  },
  {
    id: "loc-mini-shop",
    name: "Aminata Mini Shop",
    category: "Shops",
    type: "Shop",
    status: "community",
    description: "Community-added shop useful as a pickup landmark.",
    distance: "0.6 km",
    position: { left: "35%", top: "39%" },
  },
  {
    id: "loc-school",
    name: "Regent Road School",
    category: "Schools",
    type: "School",
    status: "pending",
    description: "School area added by a passenger, pending admin check.",
    distance: "0.9 km",
    position: { left: "58%", top: "36%" },
  },
  {
    id: "loc-market",
    name: "Lumley Market",
    category: "Markets",
    type: "Market",
    status: "verified",
    description: "Known market landmark with taxis and tricycles nearby.",
    distance: "1.2 km",
    position: { left: "25%", top: "58%" },
  },
  {
    id: "loc-clinic",
    name: "Kabasa Clinic",
    category: "Emergency",
    type: "Clinic",
    status: "verified",
    description: "Emergency health point near Kabasa Lodge Estate.",
    distance: "1.5 km",
    position: { left: "62%", top: "67%" },
    phone: "+232 00 000 111",
  },
  {
    id: "loc-police",
    name: "Lumley Police Post",
    category: "Emergency",
    type: "Police",
    status: "verified",
    description: "Nearest listed police help point.",
    distance: "1.8 km",
    position: { left: "72%", top: "49%" },
    phone: "+232 00 000 112",
  },
  {
    id: "loc-fleet-bike",
    name: "Fast Bike Nearby",
    category: "Fleets",
    type: "Active fleet",
    status: "verified",
    description: "Verified motorbike fleet currently active nearby.",
    distance: "0.8 km",
    position: { left: "44%", top: "56%" },
  },
];

export const emergencyContacts = [
  { id: "trusted", label: "Trusted Contact", value: "+232 00 000 100" },
  { id: "police", label: "Police Help", value: "+232 00 000 112" },
  { id: "clinic", label: "Nearest Clinic", value: "+232 00 000 111" },
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
