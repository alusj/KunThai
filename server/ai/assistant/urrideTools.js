// KAI — UrRide assistant tools.
//
// UrRide's map, routing, fares and live operator positions are NOT tools. The
// assistant can look places up through KunThai's own place search, list the
// transport types KunThai offers in the person's country, read the person's
// own trips, and PREPARE a trip plan that opens in Area View — where the
// existing routing and booking flow calculates everything and the person
// confirms. Gemini never supplies coordinates, routes, fares or ETAs.

import { cleanLine } from "../aiInput.js";
import { ToolArgumentError, registerToolGroup } from "./assistantTools.js";

function choice(value, options, fallback) {
  const candidate = String(value ?? "").trim().toLowerCase();
  return options.includes(candidate) ? candidate : fallback;
}

function requiredText(value, max, field) {
  const text = cleanLine(value, max);
  if (!text) throw new ToolArgumentError(`${field} is required`);
  return text;
}

const PASSENGER_ROLES = ["", "passenger"];

registerToolGroup({
  find_place: {
    kind: "data",
    surfaces: ["urride", "global"],
    roles: PASSENGER_ROLES,
    description:
      "Look up a destination or pickup place through KunThai's place search (e.g. 'Lumley Beach', 'Connaught Hospital'). Returns real places with their KunThai place ids. Use the person's own words; never guess coordinates.",
    parameters: {
      type: "object",
      properties: { query: { type: "string", description: "The place as the person described it." } },
      required: ["query"],
    },
    clean: (args) => ({ query: requiredText(args.query, 120, "query") }),
  },

  plan_trip: {
    kind: "action",
    surfaces: ["urride", "global"],
    roles: PASSENGER_ROLES,
    description:
      "Prepare a trip to a place returned by find_place. This only offers a button that opens Area View, where KunThai shows the route, operators and fare. It does not book anything.",
    parameters: {
      type: "object",
      properties: { placeId: { type: "string", description: "The id of a place from find_place results." } },
      required: ["placeId"],
    },
    clean: (args) => ({ placeId: requiredText(args.placeId, 80, "placeId") }),
  },

  get_transport_options: {
    kind: "data",
    surfaces: ["urride", "global"],
    roles: ["", "passenger", "operator"],
    description: "List the ride and delivery vehicle types KunThai offers in the person's country. Fares are not included: UrRide calculates them per trip.",
    parameters: {
      type: "object",
      properties: { service: { type: "string", enum: ["ride", "delivery", "both"] } },
    },
    clean: (args) => ({ service: choice(args.service, ["ride", "delivery", "both"], "both") }),
  },

  get_my_trips: {
    kind: "data",
    surfaces: ["urride", "global"],
    roles: PASSENGER_ROLES,
    description: "Get the person's own active trips or recent trip history as recorded by UrRide (status, pickup and destination labels, recorded fare).",
    parameters: {
      type: "object",
      properties: { scope: { type: "string", enum: ["active", "recent"] } },
    },
    clean: (args) => ({ scope: choice(args.scope, ["active", "recent"], "active") }),
  },

  get_operator_overview: {
    kind: "data",
    surfaces: ["urride"],
    roles: ["operator"],
    description: "Get the operator's own dashboard figures: today's trips and earnings, acceptance rate, waiting requests, recent trips, reviews and alerts.",
    clean: () => ({}),
  },

  get_company_overview: {
    kind: "data",
    surfaces: ["urride"],
    roles: ["company"],
    description: "Get the transport company's own fleet overview: fleets by type and status, operators, and live bookings by status.",
    clean: () => ({}),
  },
});

