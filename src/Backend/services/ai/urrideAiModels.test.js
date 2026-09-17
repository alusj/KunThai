import assert from "node:assert/strict";
import test from "node:test";

import {
  areaViewDestinationFromPlace,
  companyOverviewFacts,
  operatorOverviewFacts,
  placeFactsForAi,
  transportOptionsFacts,
  tripFactsForAi,
} from "./urrideAiModels.js";

const PLACE = {
  id: "osm-42",
  name: "Lumley Beach",
  address: "Lumley Beach Road, Freetown",
  fullAddress: "Lumley Beach Road, Lumley, Freetown, Western Area, Sierra Leone",
  category: "beach",
  country: "Sierra Leone",
  countryCode: "sl",
  lat: 8.4203,
  lng: -13.2876,
  distanceMeters: 5234,
};

test("places reach the model without coordinates", () => {
  const facts = placeFactsForAi(PLACE);
  assert.deepEqual(facts, { id: "osm-42", name: "Lumley Beach", address: "Lumley Beach Road, Freetown", category: "beach", distanceFromYouKm: 5.2 });
  const json = JSON.stringify(facts);
  assert.ok(!json.includes("8.42") && !json.includes("13.28"));
});

test("the Area View handoff uses only the place search's own coordinates", () => {
  const destination = areaViewDestinationFromPlace(PLACE);
  assert.equal(destination.lat, 8.4203);
  assert.equal(destination.lng, -13.2876);
  assert.equal(destination.searchQuery, PLACE.fullAddress);
  assert.equal(areaViewDestinationFromPlace({ id: "x", name: "No coords" }), null);
});

test("trip facts keep UrRide's recorded fare and drop operator contact and GPS points", () => {
  const facts = tripFactsForAi({
    id: "t1",
    mode: "Ride",
    status: "In Progress",
    pickup: "Wilkinson Road",
    destination: "Lumley Beach",
    fare: "Le 120.00",
    fareAmount: 120,
    distanceCoveredMeters: 3400,
    operatorPhone: "+23277000000",
    operatorName: "Mohamed",
    lastLocationLatitude: 8.47,
    lastLocationLongitude: -13.25,
    fleet: { fleetType: "Motorbike", operatorPhone: "+23277000000" },
  });
  assert.equal(facts.fareRecordedByUrRide, "Le 120.00");
  assert.equal(facts.distanceCoveredKmRecorded, 3.4);
  const json = JSON.stringify(facts);
  assert.ok(!json.includes("+232") && !json.includes("Mohamed") && !json.includes("8.47"));
  assert.equal(tripFactsForAi({ id: "t2", fare: "Fare pending", fareAmount: 0 }).fareRecordedByUrRide, "not recorded yet");
});

test("transport options list vehicle types but never fares", () => {
  const facts = transportOptionsFacts(
    { country: { name: "Sierra Leone" }, rideOptions: [{ displayName: "Bike", value: "Motorcycle" }], deliveryOptions: [{ displayName: "Van", value: "Car" }] },
    "ride",
  );
  assert.deepEqual(facts.rideOptions, [{ name: "Bike", vehicle: "Motorcycle" }]);
  assert.equal(facts.deliveryOptions, undefined);
  assert.match(facts.fares, /UrRide calculates each fare/);
});

test("operator overviews carry figures, not passenger identities", () => {
  const facts = operatorOverviewFacts({
    operator: { id: "o1" },
    today: { trips: 3, earnings: 450, acceptanceRate: 90 },
    waitingPassengers: [{ name: "Aminata", phone: "+23276" }],
    tripHistory: [{ requestType: "Passenger ride", status: "completed", route: "A to B", fare: "Le 150.00", name: "Aminata" }],
    reviews: { count: 1, averageRating: 5, items: [{ rating: 5, reviewText: "Safe driver", passengerName: "Aminata" }] },
    alerts: [],
  }, "SLE");
  assert.equal(facts.waitingRequests, 1);
  assert.equal(facts.today.completedTrips, 3);
  assert.ok(!JSON.stringify(facts).includes("Aminata"));
  assert.match(operatorOverviewFacts(null).error, /No UrRide operator account/);
});

test("company overviews count fleets and bookings without passenger details", () => {
  const facts = companyOverviewFacts(
    {
      id: "c1",
      companyName: "Salone Movers",
      fleets: [
        { fleetType: "Motorbike", status: "verified", activeStatus: "online", isVisibleToPassengers: true, operators: [{ status: "accepted" }] },
        { fleetType: "Taxi", status: "pending_review", activeStatus: "offline", operators: [] },
      ],
    },
    [{ status: "in_progress", requestType: "Passenger ride", fleetName: "Bike 1", route: "A to B", passengerName: "Sorie", contactPhone: "+23278" }],
  );
  assert.equal(facts.fleets.total, 2);
  assert.deepEqual(facts.fleets.byType, { Motorbike: 1, Taxi: 1 });
  assert.equal(facts.operators.total, 1);
  assert.equal(facts.liveBookings.byStatus.in_progress, 1);
  const json = JSON.stringify(facts);
  assert.ok(!json.includes("Sorie") && !json.includes("+23278"));
});
