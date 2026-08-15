const suggestion = (id, label, text) => ({ id, label, text });

const DECISION_REASON_LIBRARY = {
  approve: [
    suggestion("approve-evidence", "Evidence meets requirements", "I reviewed the submitted evidence and confirmed that it meets the applicable KunThai requirements. The information is consistent, no unresolved risk indicators were found, and the request can be approved."),
    suggestion("approve-identity", "Identity successfully verified", "The submitted identity information matches the account details and the verification checks were completed successfully. No material discrepancies were identified."),
    suggestion("approve-business", "Business verification completed", "The business information, ownership details, and supporting documents were reviewed and found to be complete and consistent with the verification requirements."),
    suggestion("approve-transport", "Transport documents accepted", "The operator, company, or fleet documents were reviewed and satisfy the current transport verification and safety requirements."),
    suggestion("approve-correction", "Requested correction confirmed", "The requested correction was checked against the available records and supporting evidence. The corrected information is appropriate and can be accepted."),
  ],
  reject: [
    suggestion("reject-incomplete", "Required information is incomplete", "The request cannot be approved because required information or supporting documents are incomplete. The user may submit a new request after providing the missing items."),
    suggestion("reject-mismatch", "Information does not match", "The submitted information does not match the account or supporting records. The discrepancies must be resolved before this request can be approved."),
    suggestion("reject-invalid-document", "Document could not be validated", "One or more submitted documents could not be validated or did not meet the applicable requirements. A clear and valid replacement is required."),
    suggestion("reject-eligibility", "Eligibility requirements not met", "The available information shows that the request does not currently meet the applicable eligibility requirements. The decision can be reconsidered if new evidence is submitted."),
    suggestion("reject-duplicate", "Duplicate or superseded request", "This request duplicates or has been superseded by another active case. The related case should remain the single source of review and decision history."),
  ],
  dismiss: [
    suggestion("dismiss-no-violation", "No policy violation found", "The reported material was reviewed in context and does not violate the applicable KunThai policy. No enforcement action is required at this time."),
    suggestion("dismiss-insufficient", "Insufficient supporting evidence", "The report does not contain enough reliable evidence to support an enforcement action. It is being dismissed without prejudice if material new evidence becomes available."),
    suggestion("dismiss-duplicate", "Duplicate report", "This report duplicates an existing case covering the same account or content. The original case will retain the investigation and action history."),
    suggestion("dismiss-resolved", "Issue already resolved", "The reported issue has already been corrected or resolved and no additional administrative action is required."),
    suggestion("dismiss-mistaken", "Report submitted in error", "The available records indicate that this report was submitted in error or concerns a different account, item, or transaction."),
  ],
  remove: [
    suggestion("remove-policy", "Confirmed policy violation", "The content was reviewed in context and was found to violate the applicable KunThai content policy. Removal is necessary to prevent further exposure or harm."),
    suggestion("remove-safety", "Immediate safety risk", "The content presents a credible safety risk and should be removed promptly. Relevant evidence has been preserved in the case record for audit and appeal review."),
    suggestion("remove-prohibited", "Prohibited content or product", "The submitted content or listing contains prohibited material and cannot remain available on KunThai under the applicable platform rules."),
    suggestion("remove-fraud", "Fraudulent or deceptive material", "The material contains misleading, fraudulent, or deceptive claims that create a material risk to users. Removal is appropriate based on the available evidence."),
    suggestion("remove-privacy", "Privacy or personal-data exposure", "The content exposes personal or sensitive information without an appropriate basis. Removal is required to reduce privacy and safety risk."),
  ],
  restrict: [
    suggestion("restrict-repeat", "Repeated policy violations", "The account has repeated related violations after prior notice. A proportionate restriction is required to prevent continued misuse while preserving access to unaffected services."),
    suggestion("restrict-investigation", "Temporary restriction during review", "A temporary restriction is required while material risk indicators are investigated. The restriction should expire or be reviewed when the investigation is complete."),
    suggestion("restrict-sector", "Sector-specific misuse", "The evidence supports restricting access to the affected KunThai sector. Other account services should remain available unless additional risk is identified."),
    suggestion("restrict-fraud", "Fraud risk controls required", "The account shows activity consistent with elevated fraud or abuse risk. A temporary restriction is appropriate while ownership and transaction details are verified."),
    suggestion("restrict-safety", "Safety controls required", "The account activity creates a safety concern that requires limited access while the case is reviewed and appropriate safeguards are confirmed."),
  ],
  suspend: [
    suggestion("suspend-serious", "Serious policy violation", "The investigation confirmed a serious violation that creates substantial risk to users or the platform. Temporary suspension is necessary pending final review or appeal."),
    suggestion("suspend-repeat", "Persistent violations after warnings", "The account continued violating applicable policies after previous warnings or restrictions. Suspension is proportionate to the repeated conduct and documented history."),
    suggestion("suspend-fraud", "Confirmed fraud or account abuse", "The available evidence indicates serious fraudulent or abusive activity. Suspension is required to protect users while any related cases and transactions are reviewed."),
    suggestion("suspend-security", "Account security compromised", "The account appears to be compromised or under unauthorized control. Suspension is required until ownership and access security can be re-established."),
    suggestion("suspend-safety", "Urgent safety protection", "An urgent safety concern requires temporary suspension to prevent further contact, activity, or exposure while the incident is investigated."),
  ],
  resolve: [
    suggestion("resolve-complete", "Review completed", "The available evidence and account history were reviewed, the necessary administrative checks were completed, and no further action is required on this case."),
    suggestion("resolve-user-helped", "User concern addressed", "The user's concern was reviewed and the appropriate guidance or corrective action was provided. The case can now be resolved."),
    suggestion("resolve-corrected", "Issue corrected", "The underlying issue has been corrected and the result was verified. No remaining operational action is required."),
    suggestion("resolve-linked", "Handled in related case", "The material issue is being handled in the related case recorded in the internal notes. This duplicate case can be resolved without a separate enforcement action."),
    suggestion("resolve-monitor", "Resolved with monitoring", "The immediate issue has been addressed. No additional action is required now, but the account or content may be reviewed again if related activity continues."),
  ],
  request_information: [
    suggestion("request-identity", "Request identity information", "Additional identity information is required before the review can continue. Please provide a clear valid document and ensure the account details match the submitted information."),
    suggestion("request-ownership", "Request proof of ownership", "Please provide reliable proof that you own or are authorized to manage the account, business, vehicle, listing, or other subject of this request."),
    suggestion("request-clear-files", "Request clearer documents", "The submitted files are incomplete, unclear, expired, or unreadable. Please provide complete and legible replacements showing all required details."),
    suggestion("request-transaction", "Request transaction details", "Additional order, trip, payment, or transaction information is required, including the relevant reference, date, amount, and supporting communication."),
    suggestion("request-context", "Request incident details", "Please provide the date, location, people involved, sequence of events, and any screenshots, recordings, or other evidence needed to assess this incident."),
  ],
};

export const INTERNAL_NOTE_SUGGESTIONS = [
  suggestion("note-initial", "Initial review completed", "Initial review completed. Identity, case metadata, and available evidence were checked. No final decision has been made yet."),
  suggestion("note-await-user", "Waiting for the user", "Waiting for the user to provide the requested information or replacement documents. Do not close the case until the response deadline has passed."),
  suggestion("note-contacted", "User contacted", "The user was contacted with a clear explanation of the missing information and the next steps required to continue the review."),
  suggestion("note-evidence", "Evidence cross-checked", "The submitted evidence was cross-checked against the account and source records. Relevant discrepancies and confirmed details are recorded below:"),
  suggestion("note-escalate", "Escalate for senior review", "Escalating this case for senior review because the proposed action is sensitive, high impact, disputed, or outside the current administrator's authority."),
  suggestion("note-related", "Related case found", "A related case or earlier report was identified. Review the linked history before applying a new decision to avoid duplicate or conflicting action."),
  suggestion("note-no-risk", "No immediate safety risk", "No immediate safety risk was identified during this review. Continue the normal evidence and policy assessment."),
  suggestion("note-risk", "Potential safety or fraud risk", "Potential safety, fraud, or account-integrity indicators were identified. Preserve the evidence and consult the appropriate specialist queue before taking irreversible action."),
  suggestion("note-handoff", "Shift handoff", "Handoff for the next administrator: the review completed so far, outstanding questions, and recommended next action are recorded below:"),
  suggestion("note-deadline", "Follow-up deadline set", "A follow-up deadline has been set. If the requested information is not received by that time, reassess the case using the available evidence and applicable policy."),
  suggestion("note-translation", "Translation or local context needed", "The case requires language, regional, or local-policy context before a reliable decision can be made. Route it to an administrator with the appropriate scope."),
  suggestion("note-appeal", "Appeal considerations", "Treat this note as part of the appeal record. Preserve the original evidence, decision rationale, and any information that may materially affect a second review."),
];

export const NOTIFICATION_TITLE_SUGGESTIONS = [
  suggestion("title-account", "Important account notice", "Important update about your KunThai account"),
  suggestion("title-action", "Action required", "Action required to continue using KunThai"),
  suggestion("title-review", "Review update", "Update on your KunThai review"),
  suggestion("title-verification", "Verification update", "Your KunThai verification status has been updated"),
  suggestion("title-safety", "Safety notice", "Important KunThai safety notice"),
  suggestion("title-maintenance", "Scheduled maintenance", "KunThai scheduled maintenance notice"),
  suggestion("title-feature", "New feature", "A new KunThai feature is available"),
  suggestion("title-urmall", "UrMall update", "Important update from UrMall"),
  suggestion("title-transport", "Transport update", "Important KunThai Transport update"),
  suggestion("title-explore", "Explore update", "Important update from Explore"),
  suggestion("title-reminder", "Friendly reminder", "A reminder from the KunThai team"),
  suggestion("title-resolved", "Issue resolved", "Your KunThai support issue has been resolved"),
];

export const NOTIFICATION_MESSAGE_SUGGESTIONS = [
  suggestion("message-account-review", "Account review update", "We have completed a review of your KunThai account. Please open the app to see the latest status and any next steps that may apply."),
  suggestion("message-info-needed", "More information required", "We need additional information to complete your request. Please open KunThai, review the request details, and provide the missing information as soon as possible."),
  suggestion("message-verified", "Verification approved", "Your verification has been approved. You can now return to KunThai and continue using the available verified-account features."),
  suggestion("message-not-approved", "Verification not approved", "We could not approve your verification with the information currently available. Please review the requirements and submit complete, valid information before trying again."),
  suggestion("message-maintenance", "Scheduled maintenance", "KunThai will undergo scheduled maintenance on [date] from [start time] to [end time]. Some services may be temporarily unavailable during this period."),
  suggestion("message-safety", "Safety guidance", "Your safety matters to us. Please review the latest notice in KunThai and contact Support if you believe your account or activity may be at risk."),
  suggestion("message-feature", "Feature announcement", "We have introduced [feature name] to make KunThai more useful and reliable. Update or reopen the app to explore what is new."),
  suggestion("message-urmall", "UrMall service update", "There is an important update affecting UrMall. Please open your seller or buyer workspace to review the details and any required next steps."),
  suggestion("message-transport", "Transport service update", "There is an important update affecting KunThai Transport. Please open your transport workspace to review the details before your next trip or operation."),
  suggestion("message-explore", "Explore service update", "There is an important update affecting Explore. Please open KunThai to review the details and continue using the community safely."),
  suggestion("message-resolved", "Support issue resolved", "The issue you reported has been reviewed and resolved. Thank you for your patience. If the problem continues, contact KunThai Support and include your original reference."),
  suggestion("message-reminder", "General reminder", "This is a friendly reminder to complete [required action] by [date]. Open KunThai for full details and assistance if you need it."),
];

export const ACCOUNT_CONTROL_REASON_SUGGESTIONS = [
  suggestion("access-restore", "Restore after completed review", "Account access restored after the related review was completed and no continuing restriction was required."),
  suggestion("access-warning", "Formal policy warning", "A formal warning is required because the reviewed activity did not meet KunThai policy expectations. Further related violations may result in restricted access."),
  suggestion("access-temporary", "Temporary investigation restriction", "Temporary access restriction applied while the related safety, fraud, ownership, or verification concerns are investigated."),
  suggestion("access-sector", "Restrict affected sector", "Access restricted in the affected KunThai sector because the reviewed activity creates a specific operational or policy risk there."),
  suggestion("access-suspend", "Suspend for serious violation", "Account suspended following confirmation of a serious or repeated violation. The supporting evidence and policy basis are recorded in the related case."),
  suggestion("access-security", "Protect a compromised account", "Account access restricted as a protective measure because the available evidence indicates possible unauthorized access or account compromise."),
];

export const VISIBILITY_CREDIT_REASON_SUGGESTIONS = [
  suggestion("credit-support", "Support resolution", "Visibility Credits granted as an approved support resolution after reviewing the user's case and account history."),
  suggestion("credit-campaign", "Official campaign reward", "Visibility Credits granted as part of an approved KunThai promotional or participation campaign."),
  suggestion("credit-service", "Service recovery", "Visibility Credits granted as a service-recovery adjustment after a verified platform issue affected the user's promotion or visibility purchase."),
  suggestion("credit-correction", "Correct a wallet discrepancy", "Visibility Credits granted to correct a verified wallet or transaction discrepancy. The supporting records were reviewed before this adjustment."),
  suggestion("credit-goodwill", "Approved goodwill credit", "Visibility Credits granted as a documented goodwill adjustment approved under the current support guidelines."),
];

export function getDecisionReasonSuggestions(decision = "resolve") {
  return DECISION_REASON_LIBRARY[decision] || DECISION_REASON_LIBRARY.resolve;
}

export function applyCaseContext(text, item = {}) {
  return String(text || "")
    .replaceAll("[case number]", item.case_number ? `KT-${String(item.case_number).padStart(6, "0")}` : "the current case")
    .replaceAll("[case title]", item.title || "the current case");
}

