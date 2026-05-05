const fleetData = [
  {
    id: "fleet-alpha-bike",
    fleetName: "Alpha City Bike",
    operatorId: "KT-73042",
    plateNumber: "MKL 552",
    serviceCategory: "Transport",
    fleetType: "Motorcycle",
    displayType: "Motorbike",
    verificationStatus: "verified",
    activeStatus: "active",
    currentLocation: "Lumley Roundabout",
    lastKnownLocation: "Lumley Roundabout",
    lastActive: "Active now",
    distanceKm: 0.8,
    etaMinutes: 4,
    rating: 4.5,
    trips: 214,
    priceHint: "From SLE 18",
    safety: ["Passenger helmet available", "Brake system checked", "Mirrors and lights working"],
    photos: ["Front view", "Back view", "Left side", "Right side"],
  },
  {
    id: "fleet-easy-bike",
    fleetName: "Easy Move Bike",
    operatorId: "KT-65820",
    plateNumber: "BKE 441",
    serviceCategory: "Both",
    fleetType: "Motorcycle",
    displayType: "Motorbike",
    verificationStatus: "recommended",
    activeStatus: "active",
    currentLocation: "Aberdeen Road",
    lastKnownLocation: "Aberdeen Road",
    lastActive: "Active now",
    distanceKm: 1.1,
    etaMinutes: 6,
    rating: 4.9,
    trips: 391,
    priceHint: "From SLE 20",
    safety: ["Passenger helmet available", "Delivery box fitted", "Admin recommended"],
    photos: ["Front view", "Back view", "Left side", "Right side"],
  },
  {
    id: "fleet-kadiatu-keke",
    fleetName: "Kadiatu Keke",
    operatorId: "KT-10936",
    plateNumber: "TRC 011",
    serviceCategory: "Transport",
    fleetType: "Tricycle",
    displayType: "Tricycle",
    verificationStatus: "pending",
    activeStatus: "offline",
    currentLocation: null,
    lastKnownLocation: "Waterloo Park",
    lastActive: "Last active 2h ago",
    distanceKm: 3.4,
    etaMinutes: null,
    rating: 4.1,
    trips: 89,
    priceHint: "From SLE 15",
    safety: ["Documents under review", "Passenger entry pending admin check"],
    photos: ["Front view", "Back view", "Left side", "Right side"],
  },
  {
    id: "fleet-central-keke",
    fleetName: "Central Keke Line",
    operatorId: "KT-48291",
    plateNumber: "KEK 220",
    serviceCategory: "Both",
    fleetType: "Tricycle",
    displayType: "Tricycle",
    verificationStatus: "recommended",
    activeStatus: "active",
    currentLocation: "Siaka Stevens Street",
    lastKnownLocation: "Siaka Stevens Street",
    lastActive: "Active now",
    distanceKm: 1.6,
    etaMinutes: 8,
    rating: 4.8,
    trips: 502,
    priceHint: "From SLE 17",
    safety: ["Passenger rails checked", "Cargo space covered", "Admin recommended"],
    photos: ["Front view", "Back view", "Left side", "Right side"],
  },
  {
    id: "fleet-alpha-taxi",
    fleetName: "Alpha City Taxi",
    operatorId: "KT-88410",
    plateNumber: "ABX 184",
    serviceCategory: "Transport",
    fleetType: "Car",
    displayType: "Taxi",
    verificationStatus: "recommended",
    activeStatus: "active",
    currentLocation: "Central",
    lastKnownLocation: "Central",
    lastActive: "Active now",
    distanceKm: 0.5,
    etaMinutes: 3,
    rating: 4.8,
    trips: 621,
    priceHint: "From SLE 35",
    safety: ["Seatbelts usable", "Interior checked", "Road worthiness approved"],
    photos: ["Front view", "Back view", "Left side", "Right side", "Interior"],
  },
  {
    id: "fleet-open-car-delivery",
    fleetName: "Open Fleet Van",
    operatorId: "KT-94073",
    plateNumber: "VAN 903",
    serviceCategory: "Delivery",
    fleetType: "Car",
    displayType: "Van",
    verificationStatus: "notVerified",
    activeStatus: "offline",
    currentLocation: null,
    lastKnownLocation: "Congo Cross",
    lastActive: "Last active yesterday",
    distanceKm: 4.2,
    etaMinutes: null,
    rating: null,
    trips: 12,
    priceHint: "Quote required",
    safety: ["Not yet checked by KunThai", "Use caution before booking"],
    photos: ["Front view", "Back view", "Left side", "Right side"],
  },
  {
    id: "fleet-fast-delivery-bike",
    fleetName: "Fast Drop Bike",
    operatorId: "KT-45176",
    plateNumber: "FDX 118",
    serviceCategory: "Delivery",
    fleetType: "Motorcycle",
    displayType: "Delivery Bike",
    verificationStatus: "verified",
    activeStatus: "active",
    currentLocation: "Wilkinson Road",
    lastKnownLocation: "Wilkinson Road",
    lastActive: "Active now",
    distanceKm: 0.9,
    etaMinutes: 5,
    rating: 4.6,
    trips: 177,
    priceHint: "From SLE 22",
    safety: ["Delivery box fitted", "License checked", "Insurance checked"],
    photos: ["Front view", "Back view", "Left side", "Right side", "Delivery box"],
  },
  {
    id: "fleet-keke-delivery",
    fleetName: "Market Keke Delivery",
    operatorId: "KT-33610",
    plateNumber: "DLK 720",
    serviceCategory: "Delivery",
    fleetType: "Tricycle",
    displayType: "Delivery Tricycle",
    verificationStatus: "pending",
    activeStatus: "active",
    currentLocation: "Kissy Road",
    lastKnownLocation: "Kissy Road",
    lastActive: "Active now",
    distanceKm: 2.2,
    etaMinutes: 10,
    rating: 4.2,
    trips: 64,
    priceHint: "From SLE 28",
    safety: ["Documents under review", "Open booth cargo space photo submitted"],
    photos: ["Front view", "Back view", "Left side", "Right side"],
  },
];

const statusRank = {
  recommended: 0,
  verified: 1,
  pending: 2,
  notVerified: 3,
};

function matchesMode(fleet, mode) {
  if (mode === "topRated") {
    return true;
  }

  if (mode === "ride") {
    return fleet.serviceCategory === "Transport" || fleet.serviceCategory === "Both";
  }

  return fleet.serviceCategory === "Delivery" || fleet.serviceCategory === "Both";
}

export function getTransportFleets({ mode, fleetType }) {
  return fleetData
    .filter((fleet) => matchesMode(fleet, mode) && (!fleetType || fleet.fleetType === fleetType))
    .sort((a, b) => {
      if (mode === "topRated") {
        const ratingDifference = (b.rating || 0) - (a.rating || 0);
        if (ratingDifference !== 0) return ratingDifference;

        const tripDifference = b.trips - a.trips;
        if (tripDifference !== 0) return tripDifference;
      }

      if (a.activeStatus !== b.activeStatus) {
        return a.activeStatus === "active" ? -1 : 1;
      }

      if (a.activeStatus === "active" && a.distanceKm !== b.distanceKm) {
        return a.distanceKm - b.distanceKm;
      }

      return statusRank[a.verificationStatus] - statusRank[b.verificationStatus];
    });
}

export function getTransportFleetById(id) {
  return fleetData.find((fleet) => fleet.id === id);
}
