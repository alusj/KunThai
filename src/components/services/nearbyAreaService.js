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
  approved: {
    label: "Approved",
    className: "border-green-200 bg-green-100 text-green-700",
  },
  rejected: {
    label: "Declined",
    className: "border-rose-200 bg-rose-100 text-rose-700",
  },
};
