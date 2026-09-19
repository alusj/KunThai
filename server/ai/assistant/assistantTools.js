// KAI — the assistant's tool registry.
//
// These are the ONLY things the assistant can ask KunThai to do. Gemini never
// gets a database handle: it can only name a tool below, the server checks the
// name against the current section and cleans every argument, and the browser
// then runs the matching existing KunThai service under the person's own login
// and row-level security. Results come back as data for Gemini to explain.
//
// Two kinds:
//   data   — read real KunThai records (search listings, business numbers…)
//   action — PREPARE something the person then confirms in KunThai's own UI
//            (open a screen, prefill a booking). No action tool can pay, post,
//            send, book, refund, delete or change a price.

import { cleanLine, cleanSlug } from "../aiInput.js";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// --- argument cleaners -------------------------------------------------------

export class ToolArgumentError extends Error {}

function text(value, max, { required = false, field = "value" } = {}) {
  const cleaned = cleanLine(value, max);
  if (required && !cleaned) throw new ToolArgumentError(`${field} is required`);
  return cleaned;
}

function choice(value, options, fallback) {
  const candidate = String(value ?? "").trim().toLowerCase();
  return options.includes(candidate) ? candidate : fallback;
}

function money(value) {
  if (value === undefined || value === null || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 && number < 1e12 ? Math.round(number * 100) / 100 : null;
}

function currencyCode(value) {
  const code = String(value ?? "").trim().toUpperCase();
  return /^[A-Z]{3}$/.test(code) ? code : "";
}

function uuid(value, field) {
  const id = String(value ?? "").trim();
  if (!UUID.test(id)) throw new ToolArgumentError(`${field} must be a KunThai id from an earlier result`);
  return id;
}

function uuidList(value, field, max) {
  const list = Array.isArray(value) ? value : [];
  const ids = Array.from(new Set(list.map((item) => String(item ?? "").trim()).filter((item) => UUID.test(item)))).slice(0, max);
  if (!ids.length) throw new ToolArgumentError(`${field} must list KunThai ids from earlier results`);
  return ids;
}

function bool(value) {
  return value === true || value === "true";
}

// --- the registry ------------------------------------------------------------

export const ASSISTANT_TOOLS = {
  // ---------------------------------------------------------------- global
  open_section: {
    kind: "action",
    // Not in /admin: that workspace is a separate app with no section switch.
    surfaces: ["explore", "urmall", "urride", "global"],
    description: "Offer to take the person to a KunThai section. Only use when they ask to go somewhere.",
    parameters: {
      type: "object",
      properties: {
        section: { type: "string", enum: ["explore", "urmall", "urride"], description: "Section to open." },
      },
      required: ["section"],
    },
    clean: (args) => ({ section: choice(args.section, ["explore", "urmall", "urride"], "explore") }),
  },

  // ---------------------------------------------------------------- UrMall buyer
  search_products: {
    kind: "data",
    surfaces: ["urmall", "global"],
    roles: ["", "buyer"],
    description:
      "Search real, in-stock UrMall product listings. Use for any request to find, browse or recommend products. Returns up to 6 listings with exact prices.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "What to look for, in a few words (e.g. 'phone good camera', 'work shoes')." },
        category: { type: "string", description: "Optional category name if the person named one." },
        minPrice: { type: "number", description: "Minimum price, only if the person gave one." },
        maxPrice: { type: "number", description: "Maximum price / budget, only if the person gave one." },
        budgetCurrency: {
          type: "string",
          description: "ISO currency code of the budget the person gave (USD for $, SLE for Le/Leones, NGN for naira…). Leave empty if they gave no currency.",
        },
        delivery: { type: "string", enum: ["any", "delivery", "pickup"] },
        sort: { type: "string", enum: ["relevance", "price-low", "price-high", "popular", "nearby", "discount"] },
        condition: { type: "string", enum: ["any", "new", "used", "refurbished"] },
      },
      required: ["query"],
    },
    clean: (args) => ({
      query: text(args.query, 80, { required: true, field: "query" }),
      category: text(args.category, 60),
      minPrice: money(args.minPrice),
      maxPrice: money(args.maxPrice),
      budgetCurrency: currencyCode(args.budgetCurrency),
      delivery: choice(args.delivery, ["any", "delivery", "pickup"], "any"),
      sort: choice(args.sort, ["relevance", "price-low", "price-high", "popular", "nearby", "discount"], "relevance"),
      condition: choice(args.condition, ["any", "new", "used", "refurbished"], "any"),
    }),
  },

  search_food_and_stays: {
    kind: "data",
    surfaces: ["urmall", "global"],
    roles: ["", "buyer"],
    description:
      "Search real UrMall restaurant meals on today's menus, hotel rooms, or property listings. Use for food, restaurants, hotels, places to stay, houses or land.",
    parameters: {
      type: "object",
      properties: {
        type: { type: "string", enum: ["restaurant", "hotel", "property"] },
        query: { type: "string", description: "Optional words to match (e.g. 'rice', 'jollof', 'two bedroom')." },
        maxPrice: { type: "number" },
        budgetCurrency: { type: "string" },
        nearby: { type: "boolean", description: "True if the person asked for places near them." },
      },
      required: ["type"],
    },
    clean: (args) => ({
      type: choice(args.type, ["restaurant", "hotel", "property"], "restaurant"),
      query: text(args.query, 60),
      maxPrice: money(args.maxPrice),
      budgetCurrency: currencyCode(args.budgetCurrency),
      nearby: bool(args.nearby),
    }),
  },

  get_product_details: {
    kind: "data",
    surfaces: ["urmall", "global"],
    roles: ["", "buyer"],
    description:
      "Get full listing details for up to 3 products by id — use to answer questions about a product or to compare products. Ids must come from earlier results or the screen.",
    parameters: {
      type: "object",
      properties: { productIds: { type: "array", items: { type: "string" } } },
      required: ["productIds"],
    },
    clean: (args) => ({ productIds: uuidList(args.productIds, "productIds", 3) }),
  },

  get_product_reviews: {
    kind: "data",
    surfaces: ["urmall", "global"],
    roles: ["", "buyer"],
    description: "Get the real buyer reviews and rating for one product id.",
    parameters: {
      type: "object",
      properties: { productId: { type: "string" } },
      required: ["productId"],
    },
    clean: (args) => ({ productId: uuid(args.productId, "productId") }),
  },

  find_stores: {
    kind: "data",
    surfaces: ["urmall", "global"],
    roles: ["", "buyer"],
    description: "Find UrMall businesses by name.",
    parameters: {
      type: "object",
      properties: { query: { type: "string" } },
      required: ["query"],
    },
    clean: (args) => ({ query: text(args.query, 60, { required: true, field: "query" }) }),
  },
};

// Extra tool groups live in their own modules and are merged in below.
export function registerToolGroup(group) {
  Object.assign(ASSISTANT_TOOLS, group);
}

// ---------------------------------------------------------------- UrMall seller
// Read-only views of the seller's OWN business. The browser runs them through
// the seller services, whose queries are scoped to the signed-in seller's
// business and protected by row-level security.
registerToolGroup({
  get_business_summary: {
    kind: "data",
    surfaces: ["urmall"],
    roles: ["seller"],
    description:
      "Get the seller's real business summary: setup health, verification, today's and recent orders and revenue, unread customer conversations and low-stock count.",
    clean: () => ({}),
  },
  get_product_performance: {
    kind: "data",
    surfaces: ["urmall"],
    roles: ["seller"],
    description:
      "Get the seller's products with real views, sales, conversion and stock. Use for questions about best sellers, products getting attention, weak products or inventory.",
    parameters: {
      type: "object",
      properties: {
        sortBy: { type: "string", enum: ["views", "sales", "conversion", "low_stock", "newest"] },
        limit: { type: "number", description: "How many products (1-10)." },
      },
    },
    clean: (args) => ({
      sortBy: choice(args.sortBy, ["views", "sales", "conversion", "low_stock", "newest"], "views"),
      limit: Math.min(10, Math.max(1, Math.round(Number(args.limit) || 6))),
    }),
  },
  get_sales_trend: {
    kind: "data",
    surfaces: ["urmall"],
    roles: ["seller"],
    description: "Get the seller's real order and completed-revenue totals per day for the last 7, 30 or 90 days, with the previous period for comparison.",
    parameters: {
      type: "object",
      properties: { days: { type: "number", description: "7, 30 or 90." } },
    },
    clean: (args) => ({ days: [7, 30, 90].includes(Number(args.days)) ? Number(args.days) : 30 }),
  },
  get_review_insights: {
    kind: "data",
    surfaces: ["urmall"],
    roles: ["seller"],
    description: "Get the seller's real review count, average rating and recent review comments (no customer names).",
    clean: () => ({}),
  },
  get_customer_messages_overview: {
    kind: "data",
    surfaces: ["urmall"],
    roles: ["seller"],
    description: "Get an overview of the seller's customer conversations: unread count, question and negotiation counts, and recent topics with the buyer's last message (no buyer names or contacts).",
    clean: () => ({}),
  },
});

export const MAX_TOOL_CALLS_PER_ROUND = 3;

// `capabilities` are what the current screen offers ("form", "message"). A tool
// with a `capability` exists only while such a screen is open.
function toolAllowed(tool, surface, role, capabilities = []) {
  const surfaceOk = tool.surfaces.includes("*") || tool.surfaces.includes(surface);
  if (!surfaceOk) return false;
  if (tool.capability && !capabilities.includes(tool.capability)) return false;
  if (!tool.roles) return true;
  return tool.roles.includes(role || "");
}

/** Tool names available in a section for a role and the screen's capabilities. */
export function toolNamesFor(surface, role = "", capabilities = []) {
  return Object.entries(ASSISTANT_TOOLS)
    .filter(([, tool]) => toolAllowed(tool, surface, role, capabilities))
    .map(([name]) => name);
}

/** Gemini function declarations for a section and role. */
export function functionDeclarationsFor(surface, role = "", capabilities = []) {
  // Tools without arguments omit `parameters`: Gemini rejects an object schema
  // with no properties.
  return toolNamesFor(surface, role, capabilities).map((name) => ({
    name,
    description: ASSISTANT_TOOLS[name].description,
    ...(ASSISTANT_TOOLS[name].parameters ? { parameters: ASSISTANT_TOOLS[name].parameters } : {}),
  }));
}

/**
 * Validate one model-requested call. Never throws: a call the section does not
 * allow, or with unusable arguments, comes back `rejected` so the browser
 * reports the refusal to the model instead of running anything.
 */
export function validateToolCall(call, surface, role = "", capabilities = []) {
  const name = cleanSlug(call?.name, 48).replace(/[.-]/g, "_");
  const id = cleanLine(call?.id, 80) || `call_${Math.random().toString(36).slice(2, 10)}`;
  const tool = Object.prototype.hasOwnProperty.call(ASSISTANT_TOOLS, name) ? ASSISTANT_TOOLS[name] : null;

  if (!tool || !toolAllowed(tool, surface, role, capabilities)) {
    return { id, name: name || "unknown", kind: "data", args: {}, rejected: true, reason: "This KunThai tool is not available here." };
  }
  try {
    const args = tool.clean(call?.args && typeof call.args === "object" ? call.args : {});
    return { id, name, kind: tool.kind, args, rejected: false };
  } catch (error) {
    return {
      id,
      name,
      kind: tool.kind,
      args: {},
      rejected: true,
      reason: error instanceof ToolArgumentError ? error.message : "The request to this tool was not valid.",
    };
  }
}
