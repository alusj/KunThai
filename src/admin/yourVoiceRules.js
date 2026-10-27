// Pure rules for the admin Your Voice page, kept apart from the service so the
// counts and filters can be tested without Supabase.

export const YOUR_VOICE_STATUSES = ["submitted", "under_review", "planned", "fixed", "closed"];
export const YOUR_VOICE_OPEN_STATUSES = ["submitted", "under_review", "planned"];
export const YOUR_VOICE_TYPES = ["idea", "bug", "complaint", "safety", "other"];

// English labels already carried by the translation bundles (the user's own
// Your Voice screen uses the same ones), shown through uiText().
export const YOUR_VOICE_STATUS_LABELS = {
  submitted: "Submitted",
  under_review: "Under review",
  planned: "Planned",
  fixed: "Fixed",
  closed: "Closed",
};

export const YOUR_VOICE_TYPE_LABELS = {
  idea: "Idea",
  bug: "Bug",
  complaint: "Complaint",
  safety: "Safety",
  other: "Other",
};

export const YOUR_VOICE_CATEGORY_LABELS = {
  explore: "Explore",
  urfeed: "UrFeed",
  swip: "Swip",
  marketplace: "Marketplace",
  transport: "Transport",
  payments: "Payments",
  account: "Account",
  other: "Other",
};

export function isOpenYourVoice(row) {
  return YOUR_VOICE_OPEN_STATUSES.includes(row?.status);
}

export function countYourVoice(rows = []) {
  return {
    total: rows.length,
    open: rows.filter(isOpenYourVoice).length,
    newFeedback: rows.filter((row) => row.status === "submitted").length,
    underReview: rows.filter((row) => row.status === "under_review").length,
    planned: rows.filter((row) => row.status === "planned").length,
    unseen: rows.filter((row) => !row.admin_seen).length,
    openSafety: rows.filter((row) => row.feedback_type === "safety" && isOpenYourVoice(row)).length,
  };
}

// type: "all" or a feedback type; status: "open", "all" or a single status.
export function filterYourVoice(rows = [], { type = "all", status = "open", search = "" } = {}) {
  const text = String(search || "").trim().toLowerCase();
  return rows.filter((row) => {
    if (type !== "all" && row.feedback_type !== type) return false;
    if (status === "open" && !isOpenYourVoice(row)) return false;
    if (status !== "open" && status !== "all" && row.status !== status) return false;
    if (!text) return true;
    return [row.title, row.message, row.display_name, row.username, row.current_screen, row.category]
      .map((value) => String(value || "").toLowerCase())
      .some((value) => value.includes(text));
  });
}

// Open Your Voice cases in the admin case list, for the sidebar badge.
export function yourVoiceAttentionCount(cases = []) {
  const closed = new Set(["actioned", "resolved", "closed"]);
  return cases.filter((item) => (item.case_type === "user_voice" || item.resource_type === "user_care_feedback") && !closed.has(item.status)).length;
}
