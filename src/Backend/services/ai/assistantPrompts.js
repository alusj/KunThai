import { t } from "../../../i18n";

// KAI — what the assistant suggests, per section and role.
//
// Suggested prompts are written as things a KunThai member would actually
// say. Progress labels turn tool names into plain language while KunThai
// fetches real data.

const PROMPTS = {
  "explore:": ["ai.chat.prompts.explore1", "ai.chat.prompts.explore2", "ai.chat.prompts.explore3"],
  "urmall:": ["ai.chat.prompts.buyer1", "ai.chat.prompts.buyer2", "ai.chat.prompts.buyer3", "ai.chat.prompts.buyer4"],
  "urmall:buyer": ["ai.chat.prompts.buyer1", "ai.chat.prompts.buyer2", "ai.chat.prompts.buyer3", "ai.chat.prompts.buyer4"],
  "urmall:seller": ["ai.chat.prompts.seller1", "ai.chat.prompts.seller2", "ai.chat.prompts.seller3", "ai.chat.prompts.seller4"],
  "urride:": ["ai.chat.prompts.passenger1", "ai.chat.prompts.passenger2", "ai.chat.prompts.passenger3"],
  "urride:passenger": ["ai.chat.prompts.passenger1", "ai.chat.prompts.passenger2", "ai.chat.prompts.passenger3"],
  "urride:operator": ["ai.chat.prompts.operator1", "ai.chat.prompts.operator2", "ai.chat.prompts.operator3"],
  "urride:company": ["ai.chat.prompts.company1", "ai.chat.prompts.company2", "ai.chat.prompts.company3"],
  "admin:admin": ["ai.chat.prompts.admin1", "ai.chat.prompts.admin2", "ai.chat.prompts.admin3"],
  "global:": ["ai.chat.prompts.global1", "ai.chat.prompts.global2", "ai.chat.prompts.global3"],
};

export function assistantPromptsFor(surface, role = "") {
  const keys = PROMPTS[`${surface}:${role}`] || PROMPTS[`${surface}:`] || PROMPTS["global:"];
  return keys.map((key) => t(key));
}

const PROGRESS = {
  search_products: "ai.chat.progress.products",
  search_food_and_stays: "ai.chat.progress.foodStays",
  get_product_details: "ai.chat.progress.details",
  get_product_reviews: "ai.chat.progress.reviews",
  find_stores: "ai.chat.progress.stores",
  open_section: "ai.chat.progress.preparing",
  get_business_summary: "ai.chat.progress.business",
  get_product_performance: "ai.chat.progress.productPerformance",
  get_sales_trend: "ai.chat.progress.sales",
  get_review_insights: "ai.chat.progress.reviews",
  get_customer_messages_overview: "ai.chat.progress.messages",
  find_place: "ai.chat.progress.places",
  plan_trip: "ai.chat.progress.preparing",
  get_transport_options: "ai.chat.progress.transportOptions",
  get_my_trips: "ai.chat.progress.trips",
  get_operator_overview: "ai.chat.progress.operator",
  get_company_overview: "ai.chat.progress.company",
  search_explore: "ai.chat.progress.explore",
};

export function registerAssistantProgressLabels(labels) {
  Object.assign(PROGRESS, labels);
}

export function assistantProgressLabel(progress) {
  const first = String(progress || "").split(",").filter(Boolean)[0];
  return first && PROGRESS[first] ? t(PROGRESS[first]) : t("ai.thinking");
}

const ROLE_LABELS = {
  buyer: "ai.chat.roles.buyer",
  seller: "ai.chat.roles.seller",
  passenger: "ai.chat.roles.passenger",
  operator: "ai.chat.roles.operator",
  company: "ai.chat.roles.company",
  admin: "ai.chat.roles.admin",
};

export function assistantRoleLabel(role) {
  return ROLE_LABELS[role] ? t(ROLE_LABELS[role]) : "";
}
