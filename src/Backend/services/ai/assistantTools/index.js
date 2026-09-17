import { URMALL_BUYER_TOOLS } from "./urmallBuyerTools";
import { SELLER_TOOLS } from "./sellerTools";
import { URRIDE_TOOLS } from "./urrideTools";
import { EXPLORE_TOOLS } from "./exploreTools";

// KAI — browser tool executors.
//
// The server decides WHETHER a tool may run (section, role, cleaned
// arguments). The browser decides nothing: it looks the approved name up here
// and runs the existing KunThai service with the server-cleaned arguments.
// A name missing from this map is reported back as unavailable — it is never
// guessed at.
//
// Executors return { result, entities?, actions? }:
//   result   — compact facts for the model
//   entities — real records the chat renders as cards
//   actions  — things the person may confirm (never performed automatically)

const GLOBAL_TOOLS = {
  open_section: async (args) => ({
    result: { prepared: true, note: "The person will see a button to open this section." },
    actions: [{ type: "open_section", section: args.section }],
  }),
};

const REGISTRY = {
  ...GLOBAL_TOOLS,
  ...URMALL_BUYER_TOOLS,
  ...SELLER_TOOLS,
  ...URRIDE_TOOLS,
  ...EXPLORE_TOOLS,
};

export function registerAssistantTools(tools) {
  Object.assign(REGISTRY, tools);
}

export function hasAssistantTool(name) {
  return Object.prototype.hasOwnProperty.call(REGISTRY, name);
}

export async function executeAssistantTool(call) {
  if (call.rejected) {
    return { result: { error: call.reason || "This tool is not available here." } };
  }
  if (!hasAssistantTool(call.name)) {
    return { result: { error: "This KunThai tool is not available in this version of the app." } };
  }
  try {
    const outcome = await REGISTRY[call.name](call.args || {});
    return outcome && typeof outcome === "object" ? outcome : { result: { error: "No result." } };
  } catch (error) {
    return { result: { error: error?.message ? String(error.message).slice(0, 200) : "KunThai could not load this information." } };
  }
}
