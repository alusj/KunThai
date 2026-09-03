import supabase from "../Backend/lib/supabaseClient";

// Admin side of Join KunThai. Reads go through row level security (join.view);
// every state change goes through an audited security-definer RPC so the
// applicant-visible history and the admin audit log cannot drift apart.

const DOCUMENT_BUCKET = "join-applications";

export const JOIN_STATUSES = [
  "submitted",
  "under_review",
  "shortlisted",
  "assessment",
  "interview",
  "due_diligence",
  "offer",
  "accepted",
  "rejected",
  "archived",
];

export const JOIN_OPEN_STATUSES = [
  "submitted",
  "under_review",
  "shortlisted",
  "assessment",
  "interview",
  "due_diligence",
  "offer",
];

// Weights used to suggest a review score. The suggestion is a prompt for the
// reviewer, never a decision: nothing in this system accepts or rejects an
// applicant automatically.
export const STAFF_SCORE_AREAS = [
  { key: "skills", label: "Relevant skills", weight: 25 },
  { key: "experience", label: "Demonstrated experience", weight: 20 },
  { key: "problem_solving", label: "Problem solving", weight: 15 },
  { key: "product_understanding", label: "KunThai understanding", weight: 15 },
  { key: "motivation", label: "Motivation", weight: 10 },
  { key: "communication", label: "Communication", weight: 10 },
  { key: "availability", label: "Availability", weight: 5 },
];

export const INVESTOR_SCORE_AREAS = [
  { key: "readiness", label: "Investment readiness", weight: 25 },
  { key: "strategic_fit", label: "Strategic fit", weight: 25 },
  { key: "proposed_amount", label: "Proposed amount", weight: 15 },
  { key: "timeframe", label: "Timeframe", weight: 15 },
  { key: "experience", label: "Investor experience", weight: 10 },
  { key: "verification", label: "Verification readiness", weight: 10 },
];

export const VOLUNTEER_SCORE_AREAS = [
  { key: "skills", label: "Relevant skills", weight: 30 },
  { key: "commitment", label: "Time commitment", weight: 25 },
  { key: "motivation", label: "Motivation", weight: 25 },
  { key: "communication", label: "Communication", weight: 20 },
];

export function scoreAreasFor(applicationType) {
  if (applicationType === "investor") return INVESTOR_SCORE_AREAS;
  if (applicationType === "volunteer") return VOLUNTEER_SCORE_AREAS;
  return STAFF_SCORE_AREAS;
}

// Each area is rated 0-5 by the reviewer; the weighted total is a percentage.
export function weightedScore(applicationType, ratings = {}) {
  const areas = scoreAreasFor(applicationType);
  const rated = areas.filter((area) => Number.isFinite(Number(ratings[area.key])));
  if (!rated.length) return null;
  const weightTotal = rated.reduce((total, area) => total + area.weight, 0);
  const earned = rated.reduce((total, area) => total + (Number(ratings[area.key]) / 5) * area.weight, 0);
  return Math.round((earned / weightTotal) * 100);
}

function unwrap(result, fallbackMessage) {
  if (result.error) {
    const error = new Error(result.error.message || fallbackMessage);
    error.code = result.error.code;
    throw error;
  }
  return result.data;
}

export async function getJoinApplications({ applicationType = "all", status = "all", search = "", limit = 300 } = {}) {
  let query = supabase
    .from("join_applications")
    .select("*")
    .neq("status", "draft")
    .order("last_activity_at", { ascending: false })
    .limit(limit);

  if (applicationType !== "all") query = query.eq("application_type", applicationType);
  if (status !== "all") query = query.eq("status", status);

  const rows = unwrap(await query, "Unable to load Join KunThai applications.") || [];
  const text = search.trim().toLowerCase();
  if (!text) return rows;

  return rows.filter((row) =>
    [row.reference, row.display_name, row.headline, row.contact_email, row.country]
      .map((value) => String(value || "").toLowerCase())
      .some((value) => value.includes(text)),
  );
}

export async function getJoinApplicationDetail(applicationId) {
  const [profile, answers, education, experience, skills, documents, history, messages, assessments, notes, reviews] =
    await Promise.all([
      supabase.from("join_applicant_profiles").select("*").eq("application_id", applicationId).maybeSingle(),
      supabase.from("join_answers").select("question_key, value").eq("application_id", applicationId),
      supabase.from("join_education").select("*").eq("application_id", applicationId).order("sort_order"),
      supabase.from("join_experience").select("*").eq("application_id", applicationId).order("sort_order"),
      supabase.from("join_skills").select("*").eq("application_id", applicationId).order("sort_order"),
      supabase.from("join_documents").select("*").eq("application_id", applicationId).order("uploaded_at"),
      supabase.from("join_status_history").select("*").eq("application_id", applicationId).order("created_at"),
      supabase.from("join_messages").select("*").eq("application_id", applicationId).order("created_at"),
      supabase.from("join_assessments").select("*").eq("application_id", applicationId).order("assigned_at", { ascending: false }),
      supabase.from("join_admin_notes").select("*").eq("application_id", applicationId).order("created_at", { ascending: false }),
      supabase.from("join_reviews").select("*").eq("application_id", applicationId).order("created_at", { ascending: false }),
    ]);

  const answerMap = {};
  for (const row of unwrap(answers, "Unable to load the application answers.") || []) {
    answerMap[row.question_key] = row.value;
  }

  return {
    profile: profile.data || null,
    answers: answerMap,
    education: unwrap(education, "Unable to load qualifications.") || [],
    experience: unwrap(experience, "Unable to load experience.") || [],
    skills: unwrap(skills, "Unable to load skills.") || [],
    documents: unwrap(documents, "Unable to load documents.") || [],
    statusHistory: unwrap(history, "Unable to load the application history.") || [],
    messages: unwrap(messages, "Unable to load the conversation.") || [],
    assessments: unwrap(assessments, "Unable to load assessments.") || [],
    notes: unwrap(notes, "Unable to load internal notes.") || [],
    reviews: unwrap(reviews, "Unable to load reviews.") || [],
  };
}

export async function getJoinQuestionCatalogue(applicationType) {
  const [definitions, options] = await Promise.all([
    supabase
      .from("join_question_definitions")
      .select("question_key, section_key, section_title, section_order, question_order, label, input_type")
      .eq("application_type", applicationType)
      .order("section_order")
      .order("question_order"),
    supabase
      .from("join_question_options")
      .select("question_key, value, label")
      .eq("application_type", applicationType),
  ]);

  const questions = unwrap(definitions, "Unable to load the question catalogue.") || [];
  const optionRows = unwrap(options, "Unable to load the question options.") || [];
  const optionsByKey = new Map();
  for (const option of optionRows) {
    if (!optionsByKey.has(option.question_key)) optionsByKey.set(option.question_key, new Map());
    optionsByKey.get(option.question_key).set(option.value, option.label);
  }
  return { questions, optionsByKey };
}

export async function setJoinApplicationStatus(applicationId, status, reason = "") {
  return unwrap(
    await supabase.rpc("join_admin_set_status", { p_application_id: applicationId, p_status: status, p_reason: reason }),
    "Unable to change the application status.",
  );
}

export async function assignJoinApplication(applicationId, adminId) {
  return unwrap(
    await supabase.rpc("join_admin_assign", { p_application_id: applicationId, p_admin_id: adminId || null }),
    "Unable to assign this application.",
  );
}

export async function setJoinApplicationPriority(applicationId, priority) {
  return unwrap(
    await supabase.rpc("join_admin_set_priority", { p_application_id: applicationId, p_priority: priority }),
    "Unable to change the priority.",
  );
}

export async function scoreJoinApplication(applicationId, score, breakdown) {
  return unwrap(
    await supabase.rpc("join_admin_score_application", {
      p_application_id: applicationId,
      p_score: score,
      p_breakdown: breakdown || {},
    }),
    "Unable to record the review score.",
  );
}

export async function assignJoinAssessment(applicationId, { assessmentKey, title, prompt, dueAt }) {
  return unwrap(
    await supabase.rpc("join_admin_assign_assessment", {
      p_application_id: applicationId,
      p_assessment_key: assessmentKey || "general",
      p_title: title || "KunThai assessment",
      p_prompt: prompt,
      p_due_at: dueAt || null,
    }),
    "Unable to send the assessment.",
  );
}

export async function postJoinApplicationMessage(applicationId, body) {
  return unwrap(
    await supabase.rpc("join_post_application_message", { p_application_id: applicationId, p_body: body }),
    "Unable to send that message.",
  );
}

export async function markJoinApplicationRead(applicationId) {
  await supabase.rpc("join_mark_application_read", { p_application_id: applicationId });
}

export async function addJoinAdminNote(applicationId, body) {
  const { data: session } = await supabase.auth.getUser();
  return unwrap(
    await supabase
      .from("join_admin_notes")
      .insert({ application_id: applicationId, author_id: session?.user?.id || null, body })
      .select()
      .single(),
    "Unable to save that note.",
  );
}

export async function saveJoinReview(applicationId, review) {
  const { data: session } = await supabase.auth.getUser();
  const reviewerId = session?.user?.id || null;
  const payload = {
    application_id: applicationId,
    reviewer_id: reviewerId,
    rating: review.rating ?? null,
    recommendation: review.recommendation || "undecided",
    strengths: review.strengths || "",
    concerns: review.concerns || "",
    scores: review.scores || {},
  };

  const existing = await supabase
    .from("join_reviews")
    .select("id")
    .eq("application_id", applicationId)
    .eq("reviewer_id", reviewerId)
    .maybeSingle();

  if (existing.data?.id) {
    return unwrap(
      await supabase.from("join_reviews").update(payload).eq("id", existing.data.id).select().single(),
      "Unable to save your review.",
    );
  }
  return unwrap(await supabase.from("join_reviews").insert(payload).select().single(), "Unable to save your review.");
}

export async function createJoinDocumentUrl(storagePath) {
  if (!storagePath) return "";
  const { data, error } = await supabase.storage.from(DOCUMENT_BUCKET).createSignedUrl(storagePath, 300);
  if (error) return "";
  return data?.signedUrl || "";
}
