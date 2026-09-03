// The notices an applicant must read before each Join KunThai path.
//
// This text is deliberately held in code rather than in the questionnaire
// tables: it carries legal weight, and it should not be editable from the same
// place a label is edited. It should be reviewed by a qualified lawyer for each
// jurisdiction KunThai accepts applications or investment from before the
// feature is opened to the public.

export const JOIN_PATHS = [
  {
    type: "investor",
    title: "Invest in KunThai",
    description: "Explore opportunities to participate in KunThai's growth.",
    accent: "amber",
  },
  {
    type: "staff",
    title: "Join Our Team",
    description: "Apply for employment and help build KunThai.",
    accent: "sky",
  },
  {
    type: "volunteer",
    title: "Volunteer With Us",
    description: "Contribute your skills, experience, and time to our mission.",
    accent: "emerald",
  },
];

export const JOIN_PATH_BY_TYPE = Object.fromEntries(JOIN_PATHS.map((path) => [path.type, path]));

export const JOIN_NOTICES = {
  investor: {
    title: "Important Investment Notice",
    intro: "Read this before you continue. It describes what an investor application is, and what it is not.",
    points: [
      "Submitting this application is an expression of interest. It is not an investment agreement.",
      "Submitting it does not guarantee that KunThai will accept your investment.",
      "Any valuation or investment terms shown before a formal offer are indicative only.",
      "Final equity, share class, investor rights, and terms are determined through negotiation, due diligence, and signed definitive agreements.",
      "Investment carries risk, including the possible loss of the whole investment.",
      "KunThai does not guarantee returns, dividends, liquidity, or any appreciation in value.",
      "Confidential information shared by KunThai remains subject to the applicable confidentiality terms.",
      "You confirm that the information you supply is accurate and complete.",
      "KunThai may carry out identity, source-of-funds, and other legally required verification before accepting any investment.",
      "Applicable securities and company law, and any eligibility requirements, must be satisfied before an investment can proceed.",
    ],
    acknowledgements: [
      { key: "read_notice", label: "I have read and understood this Investment Notice." },
      { key: "not_shareholder", label: "I understand that submitting this application does not make me a shareholder." },
      { key: "understands_risk", label: "I understand that investment carries financial risk, including total loss." },
      { key: "accepts_terms", label: "I agree to KunThai's Privacy Policy and the relevant terms." },
    ],
  },
  staff: {
    title: "Working With KunThai",
    intro: "Read this before you continue. It describes how KunThai handles a job application.",
    points: [
      "Submitting an application does not guarantee employment.",
      "The information you provide must be accurate. False qualifications or experience may lead to disqualification.",
      "Your information may be used for recruitment, assessment, and verification purposes.",
      "You may be asked to complete interviews, technical assessments, and reference checks.",
      "Any confidential information you encounter during recruitment must not be misused or shared.",
      "Salary, benefits, working terms, and intellectual-property obligations are established only through a signed employment agreement.",
      "KunThai does not ask for identity documents at this stage. Identity verification happens later, through a secure channel.",
    ],
    acknowledgements: [
      { key: "read_notice", label: "I have read and understood this notice." },
      { key: "accurate_information", label: "The information I provide is accurate to the best of my knowledge." },
      { key: "accepts_terms", label: "I agree to KunThai's Privacy Policy and the relevant terms." },
    ],
  },
  volunteer: {
    title: "Volunteer Agreement",
    intro: "Read this before you continue. Volunteering with KunThai is not the same as employment.",
    points: [
      "Volunteering does not constitute employment and does not create an employment relationship by itself.",
      "Volunteering does not guarantee future employment with KunThai.",
      "Volunteering does not, by itself, create an entitlement to salary, equity, or other compensation.",
      "Volunteers are expected to follow KunThai policies, including its safety and privacy rules.",
      "Volunteer work may involve confidential information, and may require confidentiality or intellectual-property agreements depending on the work performed.",
      "A volunteer arrangement can be ended by either side in line with the arrangement agreed at the time.",
      "Whether unpaid volunteering is permitted depends on local law and on the nature of the work, and KunThai will follow the law that applies to you.",
    ],
    acknowledgements: [
      { key: "read_notice", label: "I have read and understood this Volunteer Agreement." },
      { key: "not_employment", label: "I understand that volunteering is not employment and does not guarantee a paid role." },
      { key: "accurate_information", label: "The information I provide is accurate to the best of my knowledge." },
      { key: "accepts_terms", label: "I agree to KunThai's Privacy Policy and the relevant terms." },
    ],
  },
};

export const APPLICATION_LIST_SECTIONS = {
  staff: ["education", "experience", "skills", "documents"],
  volunteer: ["education", "skills"],
  investor: [],
};

export function noticeFor(applicationType) {
  return JOIN_NOTICES[applicationType] || JOIN_NOTICES.staff;
}
