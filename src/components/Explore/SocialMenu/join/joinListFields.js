// Field schemas for the repeatable parts of a Join KunThai application.
// Kept out of the component file so the editor stays a pure component module.

export const EDUCATION_FIELDS = [
  { key: "qualification", label: "Qualification", type: "text", width: "half" },
  {
    key: "level",
    label: "Level",
    type: "select",
    width: "half",
    options: [
      ["secondary", "Secondary or high school"],
      ["certificate", "Certificate"],
      ["diploma", "Diploma"],
      ["bachelors", "Bachelor's degree"],
      ["postgraduate_diploma", "Postgraduate diploma"],
      ["masters", "Master's degree"],
      ["doctorate", "Doctorate or PhD"],
      ["professional", "Professional qualification"],
      ["other", "Other"],
    ],
  },
  { key: "institution", label: "Institution", type: "text", width: "half" },
  { key: "country", label: "Country", type: "country", width: "half" },
  { key: "fieldOfStudy", label: "Field of study", type: "text", width: "half" },
  { key: "startYear", label: "Start year", type: "year", width: "quarter" },
  { key: "endYear", label: "Completion year", type: "year", width: "quarter" },
  { key: "currentlyStudying", label: "Still studying here", type: "boolean", width: "full" },
  { key: "achievements", label: "Achievements", type: "textarea", width: "full" },
];

export const EXPERIENCE_FIELDS = [
  { key: "organization", label: "Organization", type: "text", width: "half" },
  { key: "positionTitle", label: "Position", type: "text", width: "half" },
  {
    key: "employmentType",
    label: "Type",
    type: "select",
    width: "half",
    options: [
      ["full_time", "Full-time"],
      ["part_time", "Part-time"],
      ["contract", "Contract"],
      ["internship", "Internship"],
      ["volunteer", "Volunteer"],
      ["freelance", "Freelance"],
    ],
  },
  { key: "startDate", label: "Start date", type: "date", width: "quarter" },
  { key: "endDate", label: "End date", type: "date", width: "quarter" },
  { key: "currentlyHere", label: "I still work here", type: "boolean", width: "full" },
  { key: "responsibilities", label: "What you were responsible for", type: "textarea", width: "full" },
  { key: "mayContact", label: "KunThai may contact this organization", type: "boolean", width: "full" },
];

export const SKILL_FIELDS = [
  { key: "skill", label: "Skill", type: "text", width: "half" },
  {
    key: "proficiency",
    label: "Self-assessed proficiency",
    type: "select",
    width: "half",
    options: [
      ["beginner", "Beginner"],
      ["basic", "Basic"],
      ["intermediate", "Intermediate"],
      ["advanced", "Advanced"],
      ["expert", "Expert"],
    ],
  },
  {
    key: "yearsExperience",
    label: "Years of practical experience",
    type: "select",
    width: "half",
    options: [
      ["under_1", "Less than 1 year"],
      ["1_2", "1 to 2 years"],
      ["3_5", "3 to 5 years"],
      ["6_10", "6 to 10 years"],
      ["10_plus", "More than 10 years"],
    ],
  },
  { key: "evidenceUrl", label: "Evidence link", type: "text", width: "half" },
  { key: "context", label: "Where have you used this skill?", type: "textarea", width: "full" },
];
