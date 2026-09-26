import { t } from "../../../i18n";

// KAI — what each surface offers.
//
// The server decides which tasks EXIST; this file decides which of them a
// given screen should put in front of someone, and what to call them. Keeping
// the two apart means a surface can never advertise an action the server would
// reject.

/**
 * Every action a screen can offer.
 *
 * - needsText: only offered when there is text to work on.
 * - needsLanguage: asks for a target language before running.
 * - insertKey: label for the button that hands the result back to the screen.
 */
const ACTIONS = {
  "text.improve": { labelKey: "ai.actions.improve", needsText: true },
  "text.grammar": { labelKey: "ai.actions.grammar", needsText: true },
  "text.shorten": { labelKey: "ai.actions.shorten", needsText: true },
  "text.expand": { labelKey: "ai.actions.expand", needsText: true },
  "text.rewrite": { labelKey: "ai.actions.rewrite", needsText: true },
  "text.translate": { labelKey: "ai.actions.translate", needsText: true, needsLanguage: true },
  "text.summarize": { labelKey: "ai.actions.summarize", needsText: true, insertKey: "ai.useThis" },
  "core.assist": { labelKey: "ai.actions.ask" },

  // Explore (UrFeed + Swip)
  "explore.caption_generate": { labelKey: "ai.explore.generateCaption", insertKey: "ai.explore.useCaption" },
  "explore.hashtags": { labelKey: "ai.explore.suggestHashtags", needsText: true, insertKey: "ai.explore.addHashtags" },
  "explore.title_suggest": { labelKey: "ai.explore.suggestTitle", needsText: true, insertKey: "ai.explore.useTitle" },
  "explore.topic_suggest": { labelKey: "ai.explore.suggestTopic", needsText: true, insertKey: "ai.explore.useTopic" },
  "explore.reply_suggest": { labelKey: "ai.explore.suggestReply", insertKey: "ai.explore.useReply" },

  // UrMall buyer
  "urmall.product_explain": { labelKey: "ai.urmall.explainProduct" },
  "urmall.review_summary": { labelKey: "ai.urmall.summarizeReviews" },

  // UrMall seller
  "urmall.listing_description": { labelKey: "ai.seller.writeDescription", insertKey: "ai.seller.useDescription" },
  "urmall.listing_title": { labelKey: "ai.seller.suggestTitles", insertKey: "ai.seller.useTitle" },
  "urmall.listing_category": { labelKey: "ai.seller.suggestCategory", insertKey: "ai.seller.useCategory" },
  "urmall.listing_keywords": { labelKey: "ai.seller.suggestKeywords", insertKey: "ai.seller.addKeywords" },
  "urmall.listing_quality": { labelKey: "ai.seller.checkQuality", readOnly: true },
  "urmall.customer_reply": { labelKey: "ai.seller.draftReply", insertKey: "ai.seller.useReply" },
  "urmall.conversation_summary": { labelKey: "ai.seller.summarizeConversation", readOnly: true },
  "urmall.seller_review_insights": { labelKey: "ai.seller.reviewInsights", readOnly: true },
  "urmall.marketing_copy": { labelKey: "ai.seller.marketingCopy" },

  // UrRide
  "urride.support_draft": { labelKey: "ai.urride.writeReport", insertKey: "ai.urride.useReport" },
  "urride.lost_item_draft": { labelKey: "ai.urride.lostItem", insertKey: "ai.urride.useReport" },
  "urride.message_draft": { labelKey: "ai.urride.draftMessage" },

  // Admin
  "admin.case_summary": { labelKey: "ai.admin.caseSummary", readOnly: true },
  "admin.user_response_draft": { labelKey: "ai.admin.userReply" },
  "admin.decision_reason_draft": { labelKey: "ai.admin.decisionReason", insertKey: "ai.admin.useText" },
  "admin.note_draft": { labelKey: "ai.admin.note", insertKey: "ai.admin.useText" },
  "admin.announcement_draft": { labelKey: "ai.admin.announcementMessage", insertKey: "ai.admin.useMessage" },
  "admin.announcement_title": { labelKey: "ai.admin.announcementTitle", insertKey: "ai.admin.useTitle" },
};

const SURFACE_ACTIONS = {
  explore: ["text.improve", "text.grammar", "text.shorten", "text.expand", "text.translate"],
  urmall: ["text.improve", "text.expand", "text.shorten", "text.translate"],
  urride: ["text.improve", "text.grammar", "text.translate"],
  admin: ["text.improve", "text.shorten", "text.summarize"],
  global: ["text.improve", "text.grammar", "text.shorten", "text.translate"],
};

export function defaultActionsForSurface(surface) {
  return SURFACE_ACTIONS[surface] || SURFACE_ACTIONS.global;
}

// Explore's post composer. Writing tools first, then the Explore-specific
// helpers, with translation last because it replaces the whole draft.
export const EXPLORE_COMPOSER_ACTIONS = [
  "explore.caption_generate",
  "text.improve",
  "text.grammar",
  "text.rewrite",
  "text.shorten",
  "text.expand",
  "explore.hashtags",
  "explore.title_suggest",
  "explore.topic_suggest",
  "text.translate",
];

// Explore's comment and reply box.
export const EXPLORE_COMMENT_ACTIONS = [
  "explore.reply_suggest",
  "text.improve",
  "text.grammar",
  "text.shorten",
  "text.translate",
];

export function actionLabel(taskId) {
  const action = ACTIONS[taskId];
  return action ? t(action.labelKey) : taskId;
}

export function actionInsertLabel(taskId) {
  const action = ACTIONS[taskId];
  return t(action?.insertKey || "ai.useThis");
}

export function actionNeedsText(taskId) {
  return Boolean(ACTIONS[taskId]?.needsText);
}

/** Read-only results (summaries, reviews) never offer to insert into a field. */
export function actionIsReadOnly(taskId) {
  return Boolean(ACTIONS[taskId]?.readOnly);
}

export function actionNeedsLanguage(taskId) {
  return Boolean(ACTIONS[taskId]?.needsLanguage);
}

// Conversation starters shown when the assistant opens with nothing to act on.
// Written as things a KunThai member would actually type.
const SURFACE_PROMPTS = {
  explore: ["ai.prompts.explore1", "ai.prompts.explore2", "ai.prompts.explore3"],
  urmall: ["ai.prompts.urmall1", "ai.prompts.urmall2", "ai.prompts.urmall3"],
  urride: ["ai.prompts.urride1", "ai.prompts.urride2", "ai.prompts.urride3"],
  admin: ["ai.prompts.admin1", "ai.prompts.admin2"],
  global: ["ai.prompts.global1", "ai.prompts.global2", "ai.prompts.global3"],
};

export function suggestedPrompts(surface) {
  return (SURFACE_PROMPTS[surface] || SURFACE_PROMPTS.global).map((key) => t(key));
}

// Languages offered for one-tap translation. Matches the locales KunThai's own
// interface ships, so a translated result can also be read in the app.
export const AI_TRANSLATE_LANGUAGES = [
  { code: "en", labelKey: "ai.languages.en" },
  { code: "fr", labelKey: "ai.languages.fr" },
  { code: "ar", labelKey: "ai.languages.ar" },
  { code: "es", labelKey: "ai.languages.es" },
  { code: "zh", labelKey: "ai.languages.zh" },
  { code: "hi", labelKey: "ai.languages.hi" },
  { code: "bn", labelKey: "ai.languages.bn" },
  { code: "pt", labelKey: "ai.languages.pt" },
];
