import { searchLocations } from "../../locationSearchService";
import { fetchActiveTrips, fetchPassengerTrips } from "../../../../components/services/passengerTransportService";
import { fetchOperatorDashboard } from "../../../../components/services/transportOperatorAccountService";
import { getTransportCompanyAccount, getTransportCompanyBookingQueue } from "../../../../components/services/transportCompanyService";
import { getTransportCapabilities } from "../../../../data/globalTransportCapabilities";
import { getActiveCountryProfile } from "../../../../data/globalCountryProfiles";
import { readBuyerCoordinates } from "../urmallAiModels";
import {
  areaViewDestinationFromPlace,
  companyOverviewFacts,
  operatorOverviewFacts,
  placeFactsForAi,
  transportOptionsFacts,
  tripFactsForAi,
} from "../urrideAiModels";

// KAI — UrRide tools.
//
// Places come from KunThai's own place search (the same one Area View's search
// bar uses). A trip is only ever PREPARED: plan_trip returns a button that
// opens Area View with the real place, and UrRide's existing routing, operator
// matching and fare calculation take over from there.

// Places found this session. plan_trip may only point at one of these, so the
// model cannot send Area View to a place KunThai's search never returned.
const RECENT_PLACES = new Map();
const MAX_RECENT_PLACES = 40;

function rememberPlaces(places) {
  places.forEach((place) => {
    RECENT_PLACES.set(String(place.id), place);
    if (RECENT_PLACES.size > MAX_RECENT_PLACES) RECENT_PLACES.delete(RECENT_PLACES.keys().next().value);
  });
}

export function getRecentAssistantPlace(placeId) {
  return RECENT_PLACES.get(String(placeId)) || null;
}

async function findPlace(args) {
  const buyer = readBuyerCoordinates();
  const country = getActiveCountryProfile();
  const center = buyer ? { lat: buyer.latitude, lng: buyer.longitude, countryCode: country.iso2 } : null;
  const places = (await searchLocations(args.query, center, { limit: 5, countryCode: String(country.iso2 || "").toLowerCase() })).slice(0, 5);
  rememberPlaces(places);
  return {
    result: {
      query: args.query,
      found: places.length,
      ...(center ? {} : { note: "Your location is not known, so places are not sorted by distance." }),
      places: places.map(placeFactsForAi),
    },
    entities: { places },
  };
}

async function planTrip(args) {
  const place = getRecentAssistantPlace(args.placeId);
  const destination = place ? areaViewDestinationFromPlace(place) : null;
  if (!destination) {
    return { result: { error: "That place was not found in this conversation's place search. Search for it first." } };
  }
  return {
    result: {
      prepared: true,
      place: place.name,
      note: "The person will see a button that opens Area View for this destination. Area View shows the route, available operators and fare. Nothing is booked yet.",
    },
    entities: { places: [place] },
    actions: [{ type: "open_area_view", placeId: String(place.id), name: place.name }],
  };
}

async function getTransportOptions(args) {
  return { result: transportOptionsFacts(getTransportCapabilities(getActiveCountryProfile()), args.service) };
}

async function getMyTrips(args) {
  const trips = args.scope === "recent" ? await fetchPassengerTrips() : await fetchActiveTrips();
  const list = (Array.isArray(trips) ? trips : []).slice(0, 8);
  return {
    result: {
      scope: args.scope,
      count: list.length,
      trips: list.map(tripFactsForAi),
      note: "ETAs, routes and live positions are shown in the trip screen, not here.",
    },
  };
}

async function getOperatorOverview() {
  const dashboard = await fetchOperatorDashboard();
  return { result: operatorOverviewFacts(dashboard, getActiveCountryProfile().currency?.code) };
}

async function getCompanyOverview() {
  const company = await getTransportCompanyAccount();
  const bookings = company?.id ? await getTransportCompanyBookingQueue(company).catch(() => []) : [];
  return { result: companyOverviewFacts(company, bookings) };
}

export const URRIDE_TOOLS = {
  find_place: findPlace,
  plan_trip: planTrip,
  get_transport_options: getTransportOptions,
  get_my_trips: getMyTrips,
  get_operator_overview: getOperatorOverview,
  get_company_overview: getCompanyOverview,
};
