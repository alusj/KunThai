import supabase from "../../lib/supabaseClient";
import { isMissingTable } from "./errors";

// Join KunThai: investor, staff, and volunteer applications.
//
// The questionnaire itself lives in the database (join_question_definitions and
// friends), so this module never hard-codes a question. Everything that changes
// an application's state after submission goes through a security-definer RPC,
// which is what keeps the review trail honest.

const APPLICATION_TYPES = new Set(["investor", "staff", "volunteer"]);
const DOCUMENT_BUCKET = "join-applications";
const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024;
const DOCUMENT_TYPES = new Set(["cv", "cover_letter", "certificate", "portfolio", "supporting"]);
const DOCUMENT_MIME_TYPES = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "image/png",
  "image/jpeg",
  "image/webp",
]);

export const APPLICATION_STATUS_FLOW = [
  "submitted",
  "under_review",
  "shortlisted",
  "assessment",
  "interview",
  "due_diligence",
  "offer",
  "accepted",
];

export const APPLICATION_STATUS_LABELS = {
  draft: "Draft",
  submitted: "Submitted",
  under_review: "Under review",
  shortlisted: "Shortlisted",
  assessment: "Assessment",
  interview: "Interview",
  due_diligence: "Due diligence",
  offer: "Offer",
  accepted: "Accepted",
  rejected: "Not selected",
  withdrawn: "Withdrawn",
  archived: "Archived",
};

export const APPLICATION_TYPE_LABELS = {
  investor: "Investor",
  staff: "Team",
  volunteer: "Volunteer",
};

function unavailableError() {
  const error = new Error("Join KunThai is being prepared. Please check back shortly.");
  error.code = "JOIN_KUNTHAI_UNAVAILABLE";
  return error;
}

function raise(error) {
  if (isMissingTable(error)) throw unavailableError();
  throw error;
}

async function currentUser() {
  const { data, error } = await supabase.auth.getUser();
  if (error) throw error;
  if (!data?.user?.id) throw new Error("Sign in to apply to KunThai.");
  return data.user;
}

async function callRpc(name, params) {
  const { data, error } = await supabase.rpc(name, params);
  if (error) {
    if (isMissingTable(error) || /could not find the function/i.test(error.message || "")) throw unavailableError();
    throw error;
  }
  return data;
}

// ---------------------------------------------------------------------------
// Normalizers
// ---------------------------------------------------------------------------

function normalizeApplication(row = {}) {
  return {
    id: row.id,
    userId: row.user_id || "",
    applicationType: row.application_type || "staff",
    reference: row.reference || "",
    applicationNumber: row.application_number || null,
    status: row.status || "draft",
    headline: row.headline || "",
    displayName: row.display_name || "",
    contactEmail: row.contact_email || "",
    contactPhone: row.contact_phone || "",
    country: row.country || "",
    city: row.city || "",
    assignedAdminId: row.assigned_admin_id || "",
    priority: row.priority || "normal",
    reviewerScore: row.reviewer_score === null || row.reviewer_score === undefined ? null : Number(row.reviewer_score),
    scoreBreakdown: row.score_breakdown || {},
    consent: row.consent || {},
    consentAcceptedAt: row.consent_accepted_at || "",
    decision: row.decision || "",
    decisionReason: row.decision_reason || "",
    decidedAt: row.decided_at || "",
    submittedAt: row.submitted_at || "",
    lastActivityAt: row.last_activity_at || row.created_at || "",
    applicantUnreadCount: row.applicant_unread_count || 0,
    adminUnreadCount: row.admin_unread_count || 0,
    createdAt: row.created_at || "",
    updatedAt: row.updated_at || row.created_at || "",
  };
}

function normalizeQuestion(row = {}) {
  return {
    questionKey: row.question_key,
    applicationType: row.application_type,
    sectionKey: row.section_key,
    sectionTitle: row.section_title || "",
    sectionDescription: row.section_description || "",
    sectionOrder: row.section_order || 0,
    questionOrder: row.question_order || 0,
    label: row.label || "",
    helper: row.helper || "",
    placeholder: row.placeholder || "",
    inputType: row.input_type || "short_text",
    required: Boolean(row.required),
    maxLength: row.max_length || null,
    minValue: row.min_value === null || row.min_value === undefined ? null : Number(row.min_value),
    maxValue: row.max_value === null || row.max_value === undefined ? null : Number(row.max_value),
    options: [],
    rule: null,
  };
}

function normalizeEducation(row = {}) {
  return {
    id: row.id,
    level: row.level || "",
    institution: row.institution || "",
    country: row.country || "",
    fieldOfStudy: row.field_of_study || "",
    qualification: row.qualification || "",
    startYear: row.start_year || "",
    endYear: row.end_year || "",
    currentlyStudying: Boolean(row.currently_studying),
    achievements: row.achievements || "",
    sortOrder: row.sort_order || 0,
  };
}

function normalizeExperience(row = {}) {
  return {
    id: row.id,
    organization: row.organization || "",
    positionTitle: row.position_title || "",
    employmentType: row.employment_type || "",
    startDate: row.start_date || "",
    endDate: row.end_date || "",
    currentlyHere: Boolean(row.currently_here),
    responsibilities: row.responsibilities || "",
    mayContact: Boolean(row.may_contact),
    sortOrder: row.sort_order || 0,
  };
}

function normalizeSkill(row = {}) {
  return {
    id: row.id,
    skill: row.skill || "",
    proficiency: row.proficiency || "intermediate",
    yearsExperience: row.years_experience || "",
    context: row.context || "",
    evidenceUrl: row.evidence_url || "",
    sortOrder: row.sort_order || 0,
  };
}

function normalizeDocument(row = {}) {
  return {
    id: row.id,
    documentType: row.document_type || "supporting",
    storagePath: row.storage_path || "",
    fileName: row.file_name || "",
    mimeType: row.mime_type || "",
    byteSize: row.byte_size || 0,
    uploadedAt: row.uploaded_at || "",
  };
}

function normalizeStatusEvent(row = {}) {
  return {
    id: row.id,
    fromStatus: row.from_status || "",
    toStatus: row.to_status || "",
    actorRole: row.actor_role || "system",
    reason: row.reason || "",
    createdAt: row.created_at || "",
  };
}

function normalizeMessage(row = {}) {
  return {
    id: row.id,
    senderRole: row.sender_role || "recruitment",
    senderId: row.sender_id || "",
    body: row.body || "",
    createdAt: row.created_at || "",
    readAt: row.read_at || "",
  };
}

function normalizeAssessment(row = {}) {
  return {
    id: row.id,
    assessmentKey: row.assessment_key || "general",
    title: row.title || "KunThai assessment",
    prompt: row.prompt || "",
    response: row.response || "",
    status: row.status || "assigned",
    assignedAt: row.assigned_at || "",
    dueAt: row.due_at || "",
    submittedAt: row.submitted_at || "",
    reviewerScore: row.reviewer_score === null || row.reviewer_score === undefined ? null : Number(row.reviewer_score),
    reviewerNotes: row.reviewer_notes || "",
  };
}

// ---------------------------------------------------------------------------
// Questionnaire catalogue
// ---------------------------------------------------------------------------

export async function fetchQuestionCatalogue(applicationType) {
  if (!APPLICATION_TYPES.has(applicationType)) throw new Error("Unknown application path.");

  const [definitions, options, rules] = await Promise.all([
    supabase
      .from("join_question_definitions")
      .select("application_type, question_key, section_key, section_title, section_description, section_order, question_order, label, helper, placeholder, input_type, required, max_length, min_value, max_value")
      .eq("application_type", applicationType)
      .eq("active", true)
      .order("section_order", { ascending: true })
      .order("question_order", { ascending: true }),
    supabase
      .from("join_question_options")
      .select("question_key, value, label, option_order")
      .eq("application_type", applicationType)
      .eq("active", true)
      .order("option_order", { ascending: true }),
    supabase
      .from("join_conditional_rules")
      .select("question_key, match_mode, conditions")
      .eq("application_type", applicationType)
      .eq("active", true),
  ]);

  if (definitions.error) raise(definitions.error);
  if (options.error) raise(options.error);
  if (rules.error) raise(rules.error);

  const questions = (definitions.data || []).map(normalizeQuestion);
  const byKey = new Map(questions.map((question) => [question.questionKey, question]));

  for (const option of options.data || []) {
    const question = byKey.get(option.question_key);
    if (question) question.options.push({ value: option.value, label: option.label });
  }
  for (const rule of rules.data || []) {
    const question = byKey.get(rule.question_key);
    if (question) {
      question.rule = {
        matchMode: rule.match_mode === "any" ? "any" : "all",
        conditions: Array.isArray(rule.conditions) ? rule.conditions : [],
      };
    }
  }

  const sections = [];
  const sectionsByKey = new Map();
  for (const question of questions) {
    let section = sectionsByKey.get(question.sectionKey);
    if (!section) {
      section = {
        key: question.sectionKey,
        title: question.sectionTitle,
        description: question.sectionDescription,
        order: question.sectionOrder,
        questions: [],
      };
      sectionsByKey.set(question.sectionKey, section);
      sections.push(section);
    }
    section.questions.push(question);
  }

  return { applicationType, sections, questions };
}

// ---------------------------------------------------------------------------
// Applications
// ---------------------------------------------------------------------------

export async function fetchMyApplications() {
  const user = await currentUser();
  const { data, error } = await supabase
    .from("join_applications")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  if (error) raise(error);
  return (data || []).map(normalizeApplication);
}

export async function startApplication(applicationType) {
  if (!APPLICATION_TYPES.has(applicationType)) throw new Error("Unknown application path.");
  const row = await callRpc("join_start_application", { p_type: applicationType });
  return normalizeApplication(row);
}

export async function fetchApplicationDetail(applicationId) {
  const [application, answers, education, experience, skills, documents, history, messages, assessments] =
    await Promise.all([
      supabase.from("join_applications").select("*").eq("id", applicationId).maybeSingle(),
      supabase.from("join_answers").select("question_key, value").eq("application_id", applicationId),
      supabase.from("join_education").select("*").eq("application_id", applicationId).order("sort_order", { ascending: true }),
      supabase.from("join_experience").select("*").eq("application_id", applicationId).order("sort_order", { ascending: true }),
      supabase.from("join_skills").select("*").eq("application_id", applicationId).order("sort_order", { ascending: true }),
      supabase.from("join_documents").select("*").eq("application_id", applicationId).order("uploaded_at", { ascending: true }),
      supabase.from("join_status_history").select("*").eq("application_id", applicationId).order("created_at", { ascending: true }),
      supabase.from("join_messages").select("*").eq("application_id", applicationId).order("created_at", { ascending: true }),
      supabase.from("join_assessments").select("*").eq("application_id", applicationId).order("assigned_at", { ascending: false }),
    ]);

  if (application.error) raise(application.error);
  if (!application.data) throw new Error("Application not found.");
  for (const result of [answers, education, experience, skills, documents, history, messages, assessments]) {
    if (result.error) raise(result.error);
  }

  const answerMap = {};
  for (const row of answers.data || []) {
    answerMap[row.question_key] = row.value;
  }

  return {
    application: normalizeApplication(application.data),
    answers: answerMap,
    education: (education.data || []).map(normalizeEducation),
    experience: (experience.data || []).map(normalizeExperience),
    skills: (skills.data || []).map(normalizeSkill),
    documents: (documents.data || []).map(normalizeDocument),
    statusHistory: (history.data || []).map(normalizeStatusEvent),
    messages: (messages.data || []).map(normalizeMessage),
    assessments: (assessments.data || []).map(normalizeAssessment),
  };
}

export async function acceptApplicationConsent(applicationId, consent = {}) {
  const { data, error } = await supabase
    .from("join_applications")
    .update({ consent, consent_accepted_at: new Date().toISOString() })
    .eq("id", applicationId)
    .select()
    .single();

  if (error) raise(error);
  return normalizeApplication(data);
}

export async function saveAnswer(applicationId, questionKey, value) {
  const { error } = await supabase
    .from("join_answers")
    .upsert(
      { application_id: applicationId, question_key: questionKey, value: value === undefined ? null : value, answered_at: new Date().toISOString() },
      { onConflict: "application_id,question_key" },
    );

  if (error) raise(error);
}

export async function saveAnswers(applicationId, answers = {}) {
  const rows = Object.entries(answers).map(([questionKey, value]) => ({
    application_id: applicationId,
    question_key: questionKey,
    value: value === undefined ? null : value,
    answered_at: new Date().toISOString(),
  }));
  if (!rows.length) return;

  const { error } = await supabase.from("join_answers").upsert(rows, { onConflict: "application_id,question_key" });
  if (error) raise(error);
}

export async function submitApplication(applicationId) {
  const row = await callRpc("join_submit_application", { p_application_id: applicationId });
  return normalizeApplication(row);
}

export async function withdrawApplication(applicationId, reason = "") {
  const row = await callRpc("join_withdraw_application", { p_application_id: applicationId, p_reason: reason });
  return normalizeApplication(row);
}

export async function discardDraftApplication(applicationId) {
  const { error } = await supabase.from("join_applications").delete().eq("id", applicationId);
  if (error) raise(error);
}

// ---------------------------------------------------------------------------
// Repeatable sections
// ---------------------------------------------------------------------------

function educationPayload(applicationId, entry) {
  return {
    application_id: applicationId,
    level: entry.level || "",
    institution: entry.institution || "",
    country: entry.country || "",
    field_of_study: entry.fieldOfStudy || "",
    qualification: entry.qualification || "",
    start_year: entry.startYear ? Number(entry.startYear) : null,
    end_year: entry.endYear ? Number(entry.endYear) : null,
    currently_studying: Boolean(entry.currentlyStudying),
    achievements: entry.achievements || "",
    sort_order: entry.sortOrder || 0,
  };
}

function experiencePayload(applicationId, entry) {
  return {
    application_id: applicationId,
    organization: entry.organization || "",
    position_title: entry.positionTitle || "",
    employment_type: entry.employmentType || "",
    start_date: entry.startDate || null,
    end_date: entry.currentlyHere ? null : entry.endDate || null,
    currently_here: Boolean(entry.currentlyHere),
    responsibilities: entry.responsibilities || "",
    may_contact: Boolean(entry.mayContact),
    sort_order: entry.sortOrder || 0,
  };
}

function skillPayload(applicationId, entry) {
  return {
    application_id: applicationId,
    skill: entry.skill || "",
    proficiency: entry.proficiency || "intermediate",
    years_experience: entry.yearsExperience || "",
    context: entry.context || "",
    evidence_url: entry.evidenceUrl || "",
    sort_order: entry.sortOrder || 0,
  };
}

const LIST_TABLES = {
  education: { table: "join_education", payload: educationPayload, normalize: normalizeEducation },
  experience: { table: "join_experience", payload: experiencePayload, normalize: normalizeExperience },
  skills: { table: "join_skills", payload: skillPayload, normalize: normalizeSkill },
};

export async function saveListEntry(kind, applicationId, entry) {
  const config = LIST_TABLES[kind];
  if (!config) throw new Error("Unknown application section.");

  const payload = config.payload(applicationId, entry);
  const query = entry.id
    ? supabase.from(config.table).update(payload).eq("id", entry.id).select().single()
    : supabase.from(config.table).insert(payload).select().single();

  const { data, error } = await query;
  if (error) raise(error);
  return config.normalize(data);
}

export async function deleteListEntry(kind, entryId) {
  const config = LIST_TABLES[kind];
  if (!config) throw new Error("Unknown application section.");
  const { error } = await supabase.from(config.table).delete().eq("id", entryId);
  if (error) raise(error);
}

// ---------------------------------------------------------------------------
// Documents
// ---------------------------------------------------------------------------

export function validateApplicationDocument(file) {
  if (!file) return "Choose a file first.";
  if (file.size > MAX_DOCUMENT_BYTES) return "Documents must be 10MB or smaller.";
  if (!DOCUMENT_MIME_TYPES.has(String(file.type || "").toLowerCase())) {
    return "Attach a PDF, Word document, or image.";
  }
  return "";
}

function documentExtension(file) {
  const fromName = String(file?.name || "").split(".").pop()?.toLowerCase();
  if (fromName && /^[a-z0-9]{2,5}$/.test(fromName)) return fromName === "jpeg" ? "jpg" : fromName;
  const byType = {
    "application/pdf": "pdf",
    "application/msword": "doc",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
    "image/png": "png",
    "image/jpeg": "jpg",
    "image/webp": "webp",
  };
  return byType[file?.type] || "bin";
}

export async function uploadApplicationDocument(applicationId, file, documentType = "supporting") {
  const validation = validateApplicationDocument(file);
  if (validation) throw new Error(validation);
  if (!DOCUMENT_TYPES.has(documentType)) throw new Error("Unknown document type.");

  const user = await currentUser();
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const path = `join/${user.id}/${applicationId}/${documentType}-${stamp}.${documentExtension(file)}`;

  const upload = await supabase.storage.from(DOCUMENT_BUCKET).upload(path, file, {
    cacheControl: "3600",
    contentType: file.type,
    upsert: false,
  });
  if (upload.error) {
    if (/bucket not found|not found/i.test(upload.error.message || "")) throw unavailableError();
    throw upload.error;
  }

  const { data, error } = await supabase
    .from("join_documents")
    .insert({
      application_id: applicationId,
      document_type: documentType,
      storage_path: path,
      file_name: String(file.name || "").slice(0, 200),
      mime_type: file.type || "",
      byte_size: file.size || 0,
    })
    .select()
    .single();

  if (error) {
    await supabase.storage.from(DOCUMENT_BUCKET).remove([path]).catch(() => null);
    raise(error);
  }
  return normalizeDocument(data);
}

export async function deleteApplicationDocument(document) {
  if (!document?.id) return;
  const { error } = await supabase.from("join_documents").delete().eq("id", document.id);
  if (error) raise(error);
  if (document.storagePath) {
    await supabase.storage.from(DOCUMENT_BUCKET).remove([document.storagePath]).catch(() => null);
  }
}

export async function createApplicationDocumentUrl(storagePath) {
  if (!storagePath) return "";
  const { data, error } = await supabase.storage.from(DOCUMENT_BUCKET).createSignedUrl(storagePath, 300);
  if (error) return "";
  return data?.signedUrl || "";
}

// ---------------------------------------------------------------------------
// Conversation and assessments
// ---------------------------------------------------------------------------

export async function postApplicationMessage(applicationId, body) {
  const row = await callRpc("join_post_application_message", { p_application_id: applicationId, p_body: body });
  return normalizeMessage(row);
}

export async function markApplicationRead(applicationId) {
  await callRpc("join_mark_application_read", { p_application_id: applicationId });
}

export async function submitAssessmentResponse(assessmentId, response) {
  const row = await callRpc("join_submit_assessment", { p_assessment_id: assessmentId, p_response: response });
  return normalizeAssessment(row);
}
