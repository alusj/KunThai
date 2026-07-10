import { legalConfig } from "../../config/legalConfig";
import { policyChangelog } from "./policyChangelog";
import { prohibitedProductGroups } from "./prohibitedProducts";

const commonDates = {
  effectiveDate: legalConfig.effectiveDate,
  lastUpdated: legalConfig.lastUpdated,
  version: legalConfig.policyVersion,
};

function section(id, title, content = {}) {
  return { id, title, ...content };
}

function policy(config) {
  return {
    status: "current",
    audience: "KunThai users",
    appliesWhen: "Applies when the related KunThai service is available in your area.",
    supportActions: ["Get help", "Report a problem"],
    ...commonDates,
    ...config,
  };
}

function productGroupBullets() {
  return prohibitedProductGroups.map((group) => `${group.title}: ${group.examples.join(" ")}`);
}

export const policyDocuments = [
  policy({
    id: "terms",
    slug: "terms",
    title: "Terms Of Service",
    shortTitle: "Terms",
    category: "account-privacy",
    summary: "The rules for using KunThai accounts, Explore, UrMall, Transport, support, and related services.",
    keywords: ["terms", "account", "minimum age", "content licence", "transport", "marketplace", "payments"],
    audience: "Everyone who creates an account, browses public content, posts, messages, buys, sells, books transport, or uses support tools.",
    appliesWhen: "Applies to all KunThai services that are currently enabled. Future services apply only when launched for your account or country.",
    sections: [
      section("acceptance", "Accepting These Terms", {
        paragraphs: [
          `By using ${legalConfig.platformName}, you agree to follow these Terms and the policies linked from the Policy Center. If you do not agree, you should not use the service.`,
          "Some services have extra rules. For example, sellers must follow marketplace standards, transport operators must follow transport standards, and users of payment features must follow the payment notice when those features are enabled.",
        ],
        bullets: [
          "Use KunThai only for lawful, honest, and respectful activity.",
          "Do not try to bypass safety, verification, moderation, or account controls.",
          "Do not use another person's account without permission.",
        ],
      }),
      section("eligibility", "Who May Use KunThai", {
        paragraphs: [
          `You must be at least ${legalConfig.minimumAge} years old, or older if local law requires a higher age for the service you want to use.`,
          "Business, seller, driver, and transport-company accounts may require additional eligibility checks, documents, or authorization from the business owner.",
        ],
        callouts: [
          "If a service requires legal capacity, a licence, or business authorization, you are responsible for making sure you meet that requirement before using it.",
        ],
      }),
      section("account-security", "Account Information And Security", {
        paragraphs: [
          "Keep your account details accurate and protect your login details. You are responsible for activity that happens through your account unless the activity was caused by a security failure outside your control.",
        ],
        bullets: [
          "Use your real contact details where verification is required.",
          "Do not sell, rent, or transfer account access.",
          "Tell support quickly if you believe your account was taken over.",
        ],
      }),
      section("content", "Your Content", {
        paragraphs: [
          "You keep ownership of content you create and upload, such as posts, comments, images, videos, voice notes, listings, reviews, messages, and business profile details.",
          "You give KunThai a licence to host, display, process, copy, adapt for technical formatting, moderate, recommend, translate where available, and share your content as needed to operate the service.",
        ],
        bullets: [
          "Only upload content you created or have permission to use.",
          "You are responsible for the accuracy and legality of your content.",
          "Removing content from one surface may not immediately remove copies from reports, backups, messages, support cases, or legal records.",
        ],
      }),
      section("service-roles", "Marketplace, Transport, And Payment Roles", {
        paragraphs: [
          "KunThai provides technology that helps people discover, communicate, list, book, report, and manage activity. Unless a specific written agreement says otherwise, KunThai is not automatically the seller, buyer, driver, transporter, bank, insurer, police service, ambulance service, or physical security provider.",
          "Third-party sellers, businesses, drivers, transport operators, payment partners, and service providers may have their own responsibilities and terms.",
        ],
      }),
      section("restricted-conduct", "Restricted Conduct", {
        bullets: [
          "Do not harass, threaten, exploit, scam, impersonate, spam, or coordinate fake activity.",
          "Do not upload illegal content, child sexual abuse material, non-consensual intimate content, or content that creates a serious safety risk.",
          "Do not attack the app, scrape private data, reverse engineer protected systems, or interfere with security controls.",
          "Do not use KunThai to sell illegal goods, arrange violence, launder money, or evade lawful enforcement.",
        ],
      }),
      section("changes-liability", "Service Changes, Disclaimers, And Liability", {
        paragraphs: [
          "KunThai may add, change, suspend, or remove features to improve safety, reliability, legal compliance, or product quality.",
          "Services are provided with reasonable care, but availability, recommendations, maps, routes, moderation, search results, and emergency tools may be incomplete or delayed.",
        ],
        callouts: [
          "Governing law, dispute venue, limitation of liability, and indemnity wording require final legal review before launch.",
        ],
      }),
      section("contact", "Legal Contact", {
        paragraphs: [
          "Official business name, registered address, governing law, dispute jurisdiction, and legal contact details are pending confirmation in the legal configuration.",
        ],
      }),
    ],
    relatedPolicies: ["privacy", "community-standards", "urmall-marketplace", "transport-terms", "payments-notice"],
  }),
  policy({
    id: "privacy",
    slug: "privacy",
    title: "Privacy Policy",
    shortTitle: "Privacy",
    category: "account-privacy",
    summary: "How KunThai collects, uses, shares, protects, and retains information across its services.",
    keywords: ["privacy", "data", "messages", "location", "deletion", "retention", "cookies", "reports"],
    audience: "People who use KunThai accounts, public pages, Explore, messages, UrMall, Transport, support, reporting, or verification tools.",
    sections: [
      section("information-collected", "Information We Collect", {
        paragraphs: [
          "KunThai collects information you provide, information created by your activity, and technical information needed to run the service.",
        ],
        bullets: [
          "Account and profile details, contact information, verification status, preferences, language, and appearance choices.",
          "Posts, comments, reactions, shares, Swip videos, voice notes, uploaded images or videos, direct messages, reports, appeals, and support requests.",
          "Marketplace listings, seller registrations, business documents, orders, customer messages, reviews, and dispute details.",
          "Transport booking details, pickup and destination information, route records, driver or vehicle details, support cases, and safety incident reports.",
          "Device, browser, network, log, security, cookie, local storage, and approximate or precise location information where permission is granted.",
        ],
      }),
      section("use", "How We Use Information", {
        bullets: [
          "Operate accounts, profiles, feeds, search, messaging, marketplace, transport, notifications, and support.",
          "Personalize Explore, recommendations, topics, saved content, and service shortcuts.",
          "Detect fraud, abuse, spam, suspicious logins, unsafe transport activity, and policy violations.",
          "Moderate content, review reports, process appeals, and protect users from serious harm.",
          "Improve reliability, diagnose errors, develop features, and meet legal obligations.",
        ],
      }),
      section("sharing", "When Information May Be Shared", {
        paragraphs: [
          "KunThai shares information only where needed for the service, safety, support, legal compliance, or user-directed activity.",
        ],
        bullets: [
          "With other users when you post publicly, message them, submit a seller profile, review a product, or join a transport booking.",
          "With sellers, businesses, drivers, transport operators, or support teams when needed to complete a request or investigate a problem.",
          "With service providers such as hosting, authentication, moderation, analytics, storage, communication, verification, map, or payment partners where applicable.",
          "With government or law-enforcement authorities only when a request is lawful, urgent, or otherwise required by applicable law.",
        ],
      }),
      section("retention", "Retention And Deletion", {
        paragraphs: [
          "KunThai keeps information for as long as needed to provide services, maintain records, investigate safety issues, prevent fraud, resolve disputes, and comply with law.",
          "Account deletion does not always mean every record disappears immediately. Shared messages, support cases, transaction records, fraud signals, legal holds, backups, and safety incident records may remain where necessary.",
        ],
      }),
      section("rights", "Your Choices And Rights", {
        bullets: [
          "Review and update profile information from account settings where available.",
          "Use privacy settings to manage audiences, mentions, message controls, blocks, and content filters.",
          "Request access, correction, deletion, objection, or support through the Help Center or privacy contact once confirmed.",
          "Clear local cache from device controls where available, understanding that this may sign you out or reset preferences.",
        ],
      }),
      section("children", "Children's Privacy", {
        paragraphs: [
          `KunThai is not intended for children below the minimum age of ${legalConfig.minimumAge}, unless a specific child-safe service is later launched with appropriate protections.`,
          "Reports involving child safety receive serious review and may be escalated to appropriate authorities where legally required.",
        ],
      }),
    ],
    supportActions: ["Request your data", "Delete account", "Report a privacy concern"],
    relatedPolicies: ["account-deletion-retention", "storage-cache", "messaging", "government-requests"],
  }),
  policy({
    id: "community-standards",
    slug: "community-standards",
    title: "Community Standards",
    shortTitle: "Community",
    category: "community-content",
    summary: "The behavior expected across posts, comments, Swip videos, messages, profiles, listings, transport, and support.",
    keywords: ["community", "harassment", "hate", "spam", "scams", "violence", "misinformation", "doxxing"],
    sections: [
      section("respect", "Respect And Personal Safety", {
        paragraphs: [
          "People should be able to use KunThai without being targeted, intimidated, exploited, or shamed.",
        ],
        prohibited: [
          "Harassment, bullying, threats, stalking, doxxing, blackmail, extortion, and calls for violence.",
          "Hate or discriminatory abuse targeting protected characteristics or vulnerable communities.",
          "Non-consensual intimate content, sexual exploitation, grooming, sextortion, or sexualized content involving minors.",
        ],
        allowed: [
          "Good-faith criticism, disagreement, satire, counterspeech, and safety warnings that do not become targeted abuse.",
        ],
      }),
      section("dangerous-content", "Dangerous Or Illegal Content", {
        prohibited: [
          "Child sexual abuse material, terrorism support, dangerous organization recruitment, severe graphic violence without context, and instructions that enable real-world harm.",
          "Illegal goods, weapons trafficking, drug sales, human trafficking, fraud, phishing, and scams.",
          "Dangerous challenges or instructions that create a serious risk of injury.",
        ],
        callouts: [
          "Educational, documentary, news, or public-interest content may be allowed when it is clearly contextualized and does not encourage harm.",
        ],
      }),
      section("authenticity", "Authenticity And Platform Integrity", {
        prohibited: [
          "Impersonation, fake accounts, coordinated inauthentic behavior, fake engagement, spam, phishing, and deceptive links.",
          "Manipulating reviews, seller ratings, transport availability, trip records, reports, or moderation systems.",
        ],
      }),
      section("misinformation", "Harmful Misinformation", {
        paragraphs: [
          "KunThai may limit or remove misinformation when it creates a serious risk of physical harm, election interference, public panic, financial exploitation, or unsafe medical behavior.",
        ],
        examples: [
          "False emergency warnings intended to cause panic.",
          "Fake medical or transport instructions that could put people in danger.",
          "Scams pretending to be official KunThai, bank, government, or emergency-service notices.",
        ],
      }),
      section("enforcement", "What Happens If Standards Are Broken", {
        bullets: [
          "Content may be labeled, reduced, hidden, removed, or sent for review.",
          "Accounts may receive warnings, feature limits, recommendation restrictions, temporary suspension, or permanent termination.",
          "Serious safety risks may be escalated to support, trusted partners, or lawful authorities where appropriate.",
        ],
      }),
    ],
    relatedPolicies: ["explore-content", "messaging", "reporting-appeals", "child-safety"],
  }),
  policy({
    id: "explore-content",
    slug: "explore",
    title: "Explore Content Policy",
    shortTitle: "Explore",
    category: "community-content",
    summary: "How posts, comments, reactions, shares, Swip videos, voice notes, hashtags, and recommendations are handled.",
    keywords: ["Explore", "Swip", "feed", "comments", "hashtags", "recommendations", "reduced distribution"],
    sections: [
      section("surfaces", "Content Surfaces", {
        paragraphs: [
          "This policy covers Explore feed posts, comments, reactions, shares, Swip videos, voice notes, images, hashtags, topics, public profile content, and promoted or sponsored content where available.",
        ],
      }),
      section("allowed", "Content That Can Stay Online", {
        allowed: [
          "Original posts, commentary, humor, local updates, marketplace discussion, transport feedback, education, culture, and public-interest debate.",
          "Sensitive discussion that is clearly contextualized and does not promote abuse, exploitation, or real-world harm.",
        ],
      }),
      section("reduced-distribution", "Content That May Be Reduced", {
        paragraphs: [
          "Some content may remain visible but lose recommendation eligibility or receive reduced distribution when it is low quality, repetitive, borderline unsafe, engagement bait, misleading, or repeatedly reported.",
        ],
        bullets: [
          "Accounts with repeated violations may appear less in recommendations.",
          "Sensitive media may require warnings or limited visibility.",
          "Promoted content may face stricter quality and safety review.",
        ],
      }),
      section("removed", "Content That Must Be Removed", {
        prohibited: [
          "Child exploitation, non-consensual intimate content, credible threats, hate abuse, scams, phishing, illegal trade, severe exploitation, and content that directly helps serious harm.",
        ],
      }),
      section("recommendations", "Recommendation Eligibility", {
        paragraphs: [
          "Recommendation systems may consider content quality, user interests, freshness, safety signals, user reports, account history, and engagement patterns. Recommendations are not a guarantee of reach.",
        ],
      }),
    ],
    relatedPolicies: ["community-standards", "moderation-ai", "reporting-appeals"],
  }),
  policy({
    id: "messaging",
    slug: "messaging",
    title: "Messaging And Communication Policy",
    shortTitle: "Messaging",
    category: "community-content",
    summary: "Rules for direct messages, message requests, voice notes, attachments, blocking, reporting, and safety review.",
    keywords: ["messages", "DM", "voice notes", "attachments", "blocking", "message requests"],
    sections: [
      section("private-communication", "Direct Messages And Requests", {
        paragraphs: [
          "KunThai messaging helps users communicate about social activity, marketplace questions, transport coordination, support, and account matters.",
          "Messages are private to participants, but they are not described as end-to-end encrypted unless that protection is specifically implemented and announced.",
        ],
      }),
      section("rules", "Message Rules", {
        prohibited: [
          "Spam, phishing, scams, malware links, harassment, threats, unwanted sexual content, impersonation, and attempts to move people into unsafe off-platform activity.",
          "Using voice notes, images, videos, or files to evade content rules.",
        ],
      }),
      section("blocking-reporting", "Blocking And Reporting", {
        paragraphs: [
          "Users can block accounts and report conversations where tools are available. A report may include message content, attachments, account details, timestamps, and related metadata so safety teams can review the issue.",
        ],
      }),
      section("retention", "Message Retention And Deletion Limits", {
        paragraphs: [
          "Deleting a message or conversation from your view may not delete it for other participants, from backups, from support records, or from records needed for safety, fraud, or lawful requests.",
        ],
      }),
    ],
    relatedPolicies: ["privacy", "community-standards", "reporting-appeals"],
  }),
  policy({
    id: "safety-center",
    slug: "safety-center",
    title: "Safety Center",
    shortTitle: "Safety",
    category: "transport-safety",
    summary: "Practical safety guidance for reports, blocks, marketplace transactions, transport bookings, and urgent concerns.",
    keywords: ["safety", "block", "report", "urgent", "support", "trusted transactions"],
    sections: [
      section("principles", "Safety Principles", {
        bullets: [
          "Use in-app tools where possible so records remain visible to support.",
          "Move to a public place and contact official emergency services when there is immediate danger.",
          "Do not enter a vehicle if the operator, plate, or fleet details do not match the app.",
          "Keep order, trip, message, and payment references when reporting a problem.",
        ],
      }),
      section("tools", "Available Safety Tools", {
        bullets: [
          "Block and report options for accounts, messages, content, sellers, and transport concerns.",
          "Transport verification details, live trip actions, support tickets, and Area View emergency information.",
          "Privacy controls for message permissions, audience choices, mentions, and sensitive-content filtering.",
        ],
      }),
      section("limitations", "Real-World Limits", {
        paragraphs: [
          "KunThai can provide records, guidance, alerts, reports, and support workflows. It cannot physically prevent crime, accidents, unsafe driving, product defects, or misconduct in the real world.",
        ],
      }),
    ],
    relatedPolicies: ["emergency-assistance", "passenger-safety", "driver-vehicle-standards", "reporting-appeals"],
  }),
  policy({
    id: "child-safety",
    slug: "child-safety",
    title: "Child Safety Standards",
    shortTitle: "Child Safety",
    category: "transport-safety",
    summary: "Strict rules against child exploitation, grooming, unsafe contact, and abuse involving minors.",
    keywords: ["child safety", "minors", "grooming", "exploitation", "sextortion"],
    audience: "All users, moderators, sellers, businesses, transport operators, and support reviewers.",
    sections: [
      section("age", "Minimum Age", {
        paragraphs: [
          `Users must meet the minimum age requirement of ${legalConfig.minimumAge}, or a higher local requirement where applicable.`,
        ],
      }),
      section("zero-tolerance", "Zero Tolerance Rules", {
        prohibited: [
          "Child sexual abuse material or any attempt to request, trade, create, possess, or share it.",
          "Grooming, sextortion, trafficking, sexualization of minors, dangerous contact, or attempts to move minors to unsafe channels.",
          "Threats, coercion, or blackmail involving a minor or a minor's images, identity, location, school, or family.",
        ],
      }),
      section("reporting", "Reporting And Escalation", {
        paragraphs: [
          "Users should report urgent child-safety concerns immediately. KunThai may preserve evidence and report to appropriate authorities where legally required.",
        ],
        callouts: [
          "If a child is in immediate danger, contact official emergency services first.",
        ],
      }),
      section("guardian-support", "Guardian And Teen Support", {
        bullets: [
          "Guardians can ask support for help with account, privacy, or safety concerns involving a minor.",
          "Teen privacy protections may be expanded as age-appropriate product features become available.",
        ],
      }),
    ],
    relatedPolicies: ["community-standards", "messaging", "reporting-appeals", "government-requests"],
  }),
  policy({
    id: "moderation-ai",
    slug: "moderation",
    title: "Content Moderation And AI Policy",
    shortTitle: "Moderation And AI",
    category: "community-content",
    summary: "How automated systems, human review, reports, restrictions, and appeals may be used.",
    keywords: ["moderation", "AI", "automated systems", "human review", "appeals", "content review"],
    sections: [
      section("systems", "Automated And Human Review", {
        paragraphs: [
          "KunThai may use automated systems and human reviewers to detect spam, abuse, unsafe content, fraud, suspicious activity, and policy violations.",
        ],
        bullets: [
          "Signals may include text, images, video, audio, metadata, account history, reports, location context, and service activity.",
          "Content may be held, limited, labeled, removed, or escalated while review is pending.",
        ],
      }),
      section("limits", "Moderation Limits", {
        paragraphs: [
          "Automated systems and human reviewers can make mistakes. Moderation does not guarantee that every harmful item will be found or that every decision will be perfect.",
        ],
      }),
      section("providers", "External Review Providers", {
        paragraphs: [
          "Where applicable, external moderation or safety providers may process content or metadata under appropriate restrictions to help KunThai operate safely.",
        ],
      }),
      section("appeals", "Appeals And System Improvement", {
        bullets: [
          "Eligible decisions may be appealed through support or in-app appeal tools when available.",
          "Appeal outcomes, user feedback, and quality checks may be used to improve moderation systems.",
          "Serious safety risks may receive expedited action before a full appeal is complete.",
        ],
      }),
    ],
    relatedPolicies: ["reporting-appeals", "community-standards", "explore-content"],
  }),
  policy({
    id: "reporting-appeals",
    slug: "reporting-appeals",
    title: "Reporting, Enforcement And Appeals Policy",
    shortTitle: "Reports And Appeals",
    category: "community-content",
    summary: "How reports are submitted, reviewed, enforced, escalated, and appealed.",
    keywords: ["report", "appeal", "enforcement", "warning", "suspension", "false reporting"],
    sections: [
      section("reporting", "What You Can Report", {
        bullets: [
          "Posts, comments, Swip videos, profiles, messages, marketplace listings, seller behavior, transport operators, trip concerns, impersonation, scams, and serious safety risks.",
          "Reports should include what happened, who was involved, where it happened in the app, and any supporting details.",
        ],
      }),
      section("review", "Investigation Process", {
        paragraphs: [
          "KunThai may review the reported content, account history, service records, metadata, related messages, trip or order records, and previous enforcement history.",
          "Reporter confidentiality is respected where possible, but complete anonymity cannot be guaranteed in every investigation or legal process.",
        ],
      }),
      section("enforcement", "Possible Enforcement Actions", {
        bullets: [
          "No action, warning, content removal, reduced distribution, feature restriction, temporary suspension, permanent termination, re-verification, or device/account-level restriction where lawful.",
          "Emergency escalation may happen when there is credible risk of imminent harm.",
        ],
      }),
      section("appeals", "Appeals", {
        paragraphs: [
          "Users may appeal eligible decisions by explaining why the decision was wrong and providing helpful context. Repeated abusive appeals or false reports may lead to restrictions.",
        ],
        callouts: [
          "Submitting a report does not guarantee a specific result.",
        ],
      }),
    ],
    supportActions: ["Report a problem", "Appeal a decision"],
    relatedPolicies: ["moderation-ai", "account-suspension-termination", "community-standards"],
  }),
  policy({
    id: "urmall-marketplace",
    slug: "urmall",
    title: "UrMall Marketplace Policy",
    shortTitle: "UrMall",
    category: "marketplace",
    summary: "Responsibilities for buyers, sellers, listings, orders, reviews, prohibited products, and disputes.",
    keywords: ["UrMall", "marketplace", "buyer", "seller", "products", "orders", "prohibited products"],
    audience: "Buyers, sellers, business accounts, marketplace visitors, and support reviewers.",
    sections: [
      section("role", "KunThai's Marketplace Role", {
        paragraphs: [
          "UrMall helps buyers and sellers discover, communicate, list, order, and request support. Unless separately confirmed, KunThai is not the direct seller of third-party goods or services.",
        ],
      }),
      section("responsibilities", "Buyer And Seller Responsibilities", {
        bullets: [
          "Sellers must provide accurate listings, pricing, product condition, availability, delivery details, business identity, and customer support.",
          "Buyers must provide accurate order details, communicate respectfully, and avoid false claims, abusive messages, or payment manipulation.",
          "Both sides should keep messages, order references, images, delivery records, and payment references for support review.",
        ],
      }),
      section("prohibited-products", "Prohibited And Restricted Products", {
        bullets: productGroupBullets(),
      }),
      section("reviews-disputes", "Reviews, Listing Removal, And Disputes", {
        bullets: [
          "Fake reviews, review manipulation, misleading advertising, counterfeit goods, and fraudulent listings may be removed.",
          "Seller accounts may be suspended or re-verified after repeated disputes, unsafe listings, or suspicious activity.",
          "Local consumer-law obligations may apply to sellers and businesses even when KunThai provides only the platform tools.",
        ],
      }),
    ],
    relatedPolicies: ["seller-business-standards", "refunds-disputes-chargebacks", "payments-notice", "acceptable-use"],
  }),
  policy({
    id: "seller-business-standards",
    slug: "seller-standards",
    title: "Seller And Business Standards",
    shortTitle: "Seller Standards",
    category: "marketplace",
    summary: "Standards for business identity, product authenticity, customer care, orders, refunds, and verification.",
    keywords: ["seller", "business", "verification", "authenticity", "orders", "refunds", "reviews"],
    sections: [
      section("identity", "Business Identity", {
        bullets: [
          "Provide accurate business name, owner or representative details, location, contact information, business category, and documents where requested.",
          "Do not create duplicate businesses to avoid reviews, restrictions, fees, verification, or customer complaints.",
        ],
      }),
      section("operations", "Product And Order Standards", {
        bullets: [
          "List authentic products with accurate prices, images, stock, condition, delivery terms, and refund expectations.",
          "Fulfil confirmed orders promptly and communicate delays or substitutions clearly.",
          "Do not mislead buyers with fake scarcity, fake discounts, hidden fees, or unavailable items.",
        ],
      }),
      section("care", "Customer Communication", {
        paragraphs: [
          "Sellers should respond professionally, keep records inside KunThai where possible, handle complaints fairly, and avoid harassment or pressure.",
        ],
      }),
      section("verification", "Suspension And Re-Verification", {
        paragraphs: [
          "KunThai may request document renewal, pause listings, restrict seller features, or require re-verification when documents expire, complaints increase, or suspicious activity appears.",
        ],
      }),
    ],
    relatedPolicies: ["urmall-marketplace", "business-identity-verification", "refunds-disputes-chargebacks"],
  }),
  policy({
    id: "transport-terms",
    slug: "transport",
    title: "Transport Terms",
    shortTitle: "Transport",
    category: "transport-safety",
    summary: "Terms for passenger bookings, operator acceptance, route records, cancellations, safety incidents, and support.",
    keywords: ["transport", "UrRide", "booking", "driver", "operator", "route", "fare", "cancellation"],
    audience: "Passengers, operators, fleet owners, transport companies, and support reviewers.",
    sections: [
      section("role", "KunThai's Transport Role", {
        paragraphs: [
          "KunThai provides technology for discovery, booking requests, fleet profiles, trip records, route guidance, support, and safety information. Unless separately confirmed, KunThai is not the physical transport operator, driver, insurer, police service, or ambulance service.",
        ],
      }),
      section("bookings", "Bookings, Pricing, And Availability", {
        bullets: [
          "Bookings may require operator or transport-company acceptance.",
          "Estimated arrival times, prices, distance, and route information can change because of traffic, location accuracy, network conditions, or operator availability.",
          "Cancellation rules, waiting time, and support outcomes may depend on the trip status and local rules.",
        ],
      }),
      section("conduct", "Passenger And Operator Conduct", {
        bullets: [
          "Passengers must provide accurate pickup and destination details and behave respectfully.",
          "Operators must use accurate fleet details, avoid dangerous driving, and accept only trips they can complete safely.",
          "Lost property, incidents, unsafe conduct, and payment pressure should be reported with trip records.",
        ],
      }),
      section("verification-limits", "Verification And Safety Limits", {
        paragraphs: [
          "KunThai may request or review documents, but verification does not guarantee a person, vehicle, company, or business will remain safe, lawful, insured, or suitable.",
          "Insurance, licensing, and inspection responsibilities require local legal confirmation and may rest with operators, companies, or third parties.",
        ],
      }),
    ],
    relatedPolicies: ["driver-vehicle-standards", "passenger-safety", "emergency-assistance", "business-identity-verification"],
  }),
  policy({
    id: "driver-vehicle-standards",
    slug: "driver-standards",
    title: "Driver And Vehicle Standards",
    shortTitle: "Driver Standards",
    category: "transport-safety",
    summary: "Standards for operator identity, licences, vehicle details, roadworthiness, conduct, documents, and incident reporting.",
    keywords: ["driver", "vehicle", "operator", "licence", "insurance", "roadworthiness", "documents"],
    audience: "Drivers, operators, fleet owners, transport companies, and reviewers.",
    sections: [
      section("documents", "Documents And Vehicle Information", {
        bullets: [
          "Keep licence, registration, insurance where required, vehicle type, plate, operator identity, and business information accurate.",
          "Renew expired or suspicious documents promptly when KunThai requests review.",
          "Do not share operator accounts or complete trips under another person's identity.",
        ],
      }),
      section("conduct", "Driving And Service Conduct", {
        prohibited: [
          "Dangerous driving, intoxicated driving, harassment, discrimination, threats, unsafe passenger numbers, fare manipulation, false trip completion, and privacy violations.",
        ],
      }),
      section("privacy", "Passenger Privacy", {
        paragraphs: [
          "Operators must not misuse passenger names, phone numbers, locations, trip records, photos, messages, or route details outside the purpose of the trip or support case.",
        ],
      }),
      section("incidents", "Incident Reporting And Restrictions", {
        paragraphs: [
          "Accidents, safety concerns, document problems, police stops, serious complaints, or suspicious activity should be reported. KunThai may restrict accounts or fleets pending review.",
        ],
      }),
    ],
    relatedPolicies: ["transport-terms", "passenger-safety", "business-identity-verification"],
  }),
  policy({
    id: "passenger-safety",
    slug: "passenger-safety",
    title: "Passenger Safety Standards",
    shortTitle: "Passenger Safety",
    category: "transport-safety",
    summary: "Passenger responsibilities for safe pickups, respectful conduct, personal property, emergency tools, and reporting.",
    keywords: ["passenger", "safety", "pickup", "destination", "children", "emergency", "report"],
    sections: [
      section("trip-details", "Accurate Trip Details", {
        bullets: [
          "Use accurate pickup, destination, contact, passenger-count, and package details.",
          "Check the operator, vehicle, plate, and fleet details before entering.",
          "Do not request unsafe passenger numbers or ask the operator to break road rules.",
        ],
      }),
      section("conduct", "Passenger Conduct", {
        prohibited: [
          "Violence, threats, harassment, discrimination, property damage, illegal activity, unsafe weapons, and misuse of operator privacy.",
        ],
      }),
      section("children-property", "Children And Personal Property", {
        paragraphs: [
          "Passengers are responsible for supervising children and keeping personal property secure unless local law or a specific transport agreement says otherwise.",
        ],
      }),
      section("concerns", "Emergency Assistance And Reporting", {
        bullets: [
          "Use official emergency services for immediate danger.",
          "Use KunThai trip actions, Area View, support, and reports to preserve trip context for review.",
        ],
      }),
    ],
    relatedPolicies: ["transport-terms", "emergency-assistance", "reporting-appeals"],
  }),
  policy({
    id: "emergency-assistance",
    slug: "emergency",
    title: "Emergency Assistance Policy",
    shortTitle: "Emergency",
    category: "transport-safety",
    summary: "How emergency information, SOS tools, Area View, trip context, and urgent reports should be used.",
    keywords: ["emergency", "SOS", "hospital", "police", "ambulance", "fire", "Area View"],
    sections: [
      section("not-authority", "KunThai Is Not An Emergency Authority", {
        paragraphs: [
          "KunThai is not a police service, ambulance service, fire service, emergency dispatcher, insurer, or physical security provider.",
          "Emergency buttons, numbers, nearby-place searches, trip reports, and support tickets do not replace official emergency services.",
        ],
      }),
      section("what-to-do", "What To Do In Immediate Danger", {
        bullets: [
          "Call official emergency services directly when possible.",
          "Move to a public or safer location if you can do so safely.",
          "Use Area View to find nearby hospitals, police stations, pharmacies, fire services, or safe landmarks.",
          "Use trip actions to contact the operator, share location, or send an urgent report when appropriate.",
        ],
      }),
      section("information-used", "Information Used During Emergency Requests", {
        paragraphs: [
          "KunThai may use trip, account, contact, location, device, operator, vehicle, route, report, and support information to help preserve context for an emergency request or safety review.",
        ],
        bullets: [
          "Information may be shared with support reviewers, emergency contacts, operators, transport companies, or lawful authorities where appropriate and legally permitted.",
        ],
      }),
      section("limitations", "Availability And Misuse", {
        bullets: [
          "Emergency numbers, map results, GPS, network connectivity, and third-party services may be unavailable, inaccurate, delayed, or different by country and region.",
          "KunThai cannot guarantee response time.",
          "Misuse of emergency tools may lead to restrictions or enforcement.",
        ],
      }),
    ],
    relatedPolicies: ["transport-terms", "passenger-safety", "privacy", "government-requests"],
  }),
  policy({
    id: "business-identity-verification",
    slug: "verification",
    title: "Business And Identity Verification Policy",
    shortTitle: "Verification",
    category: "transport-safety",
    summary: "Why verification is requested, what documents may be reviewed, how decisions work, and what verification cannot guarantee.",
    keywords: ["verification", "identity", "business", "documents", "driver", "vehicle", "manual review"],
    sections: [
      section("why", "Why Verification Is Requested", {
        paragraphs: [
          "KunThai may request verification to reduce fraud, keep records accurate, support marketplace trust, review transport safety, and meet legal or partner requirements.",
        ],
      }),
      section("documents", "Information That May Be Requested", {
        bullets: [
          "Identity documents, business registration, owner or representative details, address information, driver licence, vehicle registration, insurance where required, fleet photos, and supporting evidence.",
          "Beneficial-owner or authorization details may be requested for business accounts where required.",
        ],
      }),
      section("review", "Review And Failed Verification", {
        paragraphs: [
          "KunThai may use automated checks, manual review, or third-party verification providers where applicable. Users may be asked to resubmit unclear, expired, inconsistent, or suspicious documents.",
        ],
        bullets: [
          "Fraudulent documents may lead to rejection, suspension, termination, or lawful escalation.",
          "Verification can be limited, delayed, or unavailable in some areas.",
        ],
      }),
      section("limits", "Verification Limits And Privacy", {
        paragraphs: [
          "Verification does not guarantee that a person, business, vehicle, or document will remain safe, lawful, suitable, insured, or accurate after review.",
          "Verification records are retained only as needed for trust, safety, fraud prevention, support, legal obligations, or account administration.",
        ],
      }),
    ],
    relatedPolicies: ["privacy", "seller-business-standards", "driver-vehicle-standards", "transport-terms"],
  }),
  policy({
    id: "account-suspension-termination",
    slug: "account-suspension",
    title: "Account Suspension And Termination Policy",
    shortTitle: "Suspension",
    category: "account-privacy",
    summary: "When accounts, content, seller tools, transport tools, or features may be restricted, suspended, or terminated.",
    keywords: ["suspension", "termination", "restriction", "account", "feature limits"],
    sections: [
      section("reasons", "Reasons For Restrictions", {
        bullets: [
          "Serious or repeated policy violations, fraud, scams, unsafe transport behavior, illegal listings, abusive reporting, payment abuse, suspicious documents, or security risks.",
          "Legal obligations, government requests, chargebacks, account compromise, or activity that threatens the service.",
        ],
      }),
      section("types", "Types Of Actions", {
        bullets: [
          "Warnings, content removal, reduced distribution, feature limits, seller pauses, transport fleet pauses, verification holds, temporary suspension, permanent termination, or device/account-level restrictions where lawful.",
        ],
      }),
      section("notice", "Notice And Appeals", {
        paragraphs: [
          "KunThai may provide notice and appeal options when practical and safe. Some urgent or legally sensitive actions may happen before notice is given.",
        ],
      }),
      section("records", "Records After Termination", {
        paragraphs: [
          "Some records may remain after termination for fraud prevention, dispute handling, safety investigations, transaction records, legal compliance, backups, and enforcement history.",
        ],
      }),
    ],
    supportActions: ["Appeal a decision", "Contact support"],
    relatedPolicies: ["reporting-appeals", "account-deletion-retention", "community-standards"],
  }),
  policy({
    id: "account-deletion-retention",
    slug: "account-deletion",
    title: "Account Deletion And Data Retention Policy",
    shortTitle: "Account Deletion",
    category: "account-privacy",
    summary: "How deletion requests, deactivation, grace periods, shared records, backups, and legal retention may work.",
    keywords: ["delete account", "deactivation", "retention", "backup", "data request"],
    sections: [
      section("request", "Requesting Deletion", {
        paragraphs: [
          "Users may request account deletion through account controls or support when available. KunThai may require confirmation and security checks before processing a deletion request.",
        ],
      }),
      section("deactivation", "Deactivation Versus Deletion", {
        paragraphs: [
          "Deactivation may hide or pause an account while retaining data for possible return. Deletion is intended to remove or anonymize eligible personal data after required checks and retention periods.",
        ],
      }),
      section("limits", "Records That May Remain", {
        bullets: [
          "Shared messages, comments copied by others, reports, appeals, support tickets, fraud records, transaction records, marketplace disputes, transport incidents, legal holds, and backups.",
          "Anonymized or aggregated information may remain because it no longer identifies the user in ordinary use.",
        ],
      }),
      section("timeframe", "Processing Timeframe", {
        paragraphs: [
          `The final deletion processing timeframe is pending legal and operational confirmation: ${legalConfig.deletionProcessingTimeframe}.`,
          "KunThai will not promise immediate deletion of every record where safety, fraud, dispute, legal, or technical retention is required.",
        ],
      }),
    ],
    supportActions: ["Delete account", "Request your data"],
    relatedPolicies: ["privacy", "storage-cache", "account-suspension-termination"],
  }),
  policy({
    id: "storage-cache",
    slug: "storage",
    title: "Cookies, Device Storage And Local Cache Policy",
    shortTitle: "Storage",
    category: "account-privacy",
    summary: "How browser storage, local cache, preferences, drafts, session data, and device controls support KunThai.",
    keywords: ["cookies", "local storage", "cache", "drafts", "preferences", "analytics"],
    sections: [
      section("uses", "Storage KunThai May Use", {
        bullets: [
          "Authentication state, session refresh, security checks, language, appearance, notification preferences, privacy settings, drafts, recent searches, saved screen state, and temporary upload progress.",
          "Limited reliability or performance data may be used if the app has that capability enabled.",
        ],
      }),
      section("local", "Local Cache", {
        paragraphs: [
          "Some data may stay only on your device so the app can feel faster or continue showing recent state. Clearing local cache may remove drafts, searches, cached feed state, or temporary preferences.",
        ],
      }),
      section("choices", "Your Choices", {
        bullets: [
          "Use browser or device controls to clear storage.",
          "Use in-app cache controls where available.",
          "Disabling storage may sign you out, break navigation state, reset preferences, or stop some features from working.",
        ],
      }),
    ],
    relatedPolicies: ["privacy", "account-deletion-retention"],
  }),
  policy({
    id: "copyright-ip",
    slug: "copyright",
    title: "Copyright And Intellectual Property Policy",
    shortTitle: "Copyright",
    category: "community-content",
    summary: "Rules for user ownership, content licences, copyright complaints, counter-notices, trademarks, and repeat infringement.",
    keywords: ["copyright", "intellectual property", "trademark", "counter notice", "brand misuse"],
    sections: [
      section("ownership", "User Ownership And Licence", {
        paragraphs: [
          "You keep ownership of content you create. You give KunThai the licence needed to host, display, process, moderate, recommend, and operate the content within the service.",
        ],
      }),
      section("complaints", "Copyright Complaints", {
        bullets: [
          "A complaint should identify the protected work, the KunThai content involved, the reporter's authority, contact details, and a good-faith explanation.",
          "The official copyright contact is pending legal confirmation.",
        ],
      }),
      section("counter", "Counter-Notices And Repeat Infringers", {
        paragraphs: [
          "Users may be able to challenge eligible copyright actions by providing required information. Repeated or serious infringement may lead to content removal or account restrictions.",
        ],
      }),
      section("trademark", "Trademarks And Brand Misuse", {
        paragraphs: [
          "Do not impersonate brands, misuse logos, sell counterfeit goods, or make a business appear officially connected to another organization without permission.",
        ],
      }),
    ],
    supportActions: ["Report IP issue"],
    relatedPolicies: ["community-standards", "urmall-marketplace", "terms"],
  }),
  policy({
    id: "acceptable-use",
    slug: "acceptable-use",
    title: "Acceptable Use Policy",
    shortTitle: "Acceptable Use",
    category: "community-content",
    summary: "Technical and behavioral rules that protect KunThai systems, users, businesses, transport, and support workflows.",
    keywords: ["acceptable use", "abuse", "security", "scraping", "automation", "spam"],
    sections: [
      section("systems", "System Integrity", {
        prohibited: [
          "Unauthorized access, scraping private data, malware, denial-of-service activity, reverse engineering protected systems, bypassing rate limits, or interfering with security controls.",
        ],
      }),
      section("automation", "Automation And Data Use", {
        paragraphs: [
          "Do not use bots, scripts, crawlers, or automated tools to create accounts, spam, manipulate engagement, harvest data, or overload services unless KunThai has given written permission.",
        ],
      }),
      section("fraud", "Fraud And Evasion", {
        prohibited: [
          "Evading bans, creating deceptive accounts, laundering transactions, manipulating trips or orders, abusing promotions, fake reports, fake reviews, and impersonating support or authorities.",
        ],
      }),
      section("enforcement", "Enforcement", {
        paragraphs: [
          "Violations may lead to rate limits, blocked requests, feature restrictions, account suspension, legal review, or reports to appropriate authorities where required.",
        ],
      }),
    ],
    relatedPolicies: ["terms", "account-suspension-termination", "community-standards"],
  }),
  policy({
    id: "accessibility",
    slug: "accessibility",
    title: "Accessibility Statement",
    shortTitle: "Accessibility",
    category: "transparency",
    summary: "KunThai's accessibility goals for keyboard navigation, screen readers, contrast, reduced motion, captions, and feedback.",
    keywords: ["accessibility", "keyboard", "screen reader", "contrast", "reduced motion", "captions"],
    audience: "All users, including people who use assistive technology.",
    sections: [
      section("commitment", "Accessibility Commitment", {
        paragraphs: [
          "KunThai aims to build services that are usable by people with different devices, abilities, network conditions, languages, and access needs.",
        ],
      }),
      section("features", "Areas Of Focus", {
        bullets: [
          "Keyboard navigation, visible focus states, readable text, sufficient contrast, reduced-motion support, screen-reader-friendly labels, touch targets, captions or media alternatives where available, and clear error messages.",
        ],
      }),
      section("limits", "Continuous Improvement", {
        paragraphs: [
          "KunThai does not claim full compliance with a specific accessibility standard until a qualified audit confirms it. Some features may still need improvement.",
        ],
      }),
      section("feedback", "Reporting Accessibility Problems", {
        paragraphs: [
          "Users can report accessibility problems through Help Center. Include the device, browser, assistive technology, page, and what blocked you.",
        ],
      }),
    ],
    supportActions: ["Report accessibility issue"],
    relatedPolicies: ["privacy", "terms"],
  }),
  policy({
    id: "government-requests",
    slug: "government-requests",
    title: "Government And Law-Enforcement Requests",
    shortTitle: "Government Requests",
    category: "transparency",
    summary: "How KunThai reviews legal requests, emergency disclosures, preservation requests, and user notice where permitted.",
    keywords: ["law enforcement", "government", "legal request", "preservation", "emergency disclosure"],
    audience: "Users, public authorities, support reviewers, and legal reviewers.",
    sections: [
      section("requirements", "Legal Requirements", {
        paragraphs: [
          "Government and law-enforcement requests must follow applicable law, identify proper legal authority, describe the requested information, and be limited to a lawful purpose.",
        ],
      }),
      section("review", "Scope Review", {
        bullets: [
          "KunThai may reject invalid, informal, unlawful, or overly broad requests.",
          "KunThai may narrow requests, ask for clarification, or preserve records where lawful.",
          "User notice may be provided where legally permitted and safe.",
        ],
      }),
      section("emergency", "Emergency Disclosure Requests", {
        paragraphs: [
          "KunThai may disclose limited information when there is a credible emergency involving risk of death, serious physical injury, child safety, or other urgent harm, where legally permitted.",
        ],
      }),
      section("transparency", "Transparency", {
        paragraphs: [
          "Transparency reporting may be considered in the future. The official law-enforcement contact is pending legal confirmation.",
        ],
      }),
    ],
    relatedPolicies: ["privacy", "child-safety", "emergency-assistance"],
  }),
  policy({
    id: "payments-notice",
    slug: "payments",
    title: "Payments Notice",
    shortTitle: "Payments",
    category: "payments",
    status: "conditional",
    summary: "Conditional rules for checkout, payment partners, transaction limits, fraud checks, fees, reversals, and account restrictions.",
    keywords: ["payments", "checkout", "fees", "limits", "fraud", "failed transaction", "partner terms"],
    appliesWhen: "Applies only when payment, checkout, stored-value, payout, cash-in, cash-out, bank, or mobile-money features are enabled for your account and country.",
    sections: [
      section("availability", "Service Availability", {
        paragraphs: [
          "Payment-related features may be introduced gradually, may differ by country, and may depend on partner availability, identity verification, service limits, and local rules.",
          "KunThai should not be treated as a licensed bank or financial institution unless that status is legally confirmed and disclosed.",
        ],
      }),
      section("requirements", "Eligibility, Verification, And Limits", {
        bullets: [
          "Users may need identity, business, seller, driver, or account verification before using payment features.",
          "Transaction limits, fees, cash-in, cash-out, processing times, supported providers, and eligible countries may vary.",
          "Partner terms may apply in addition to KunThai policies.",
        ],
      }),
      section("transactions", "Failed Transactions, Reversals, And Fraud Checks", {
        bullets: [
          "Transactions may be delayed, declined, reversed, reviewed, or restricted because of fraud signals, partner issues, incorrect details, insufficient funds, chargebacks, disputes, legal obligations, or technical failure.",
          "Users should confirm recipient, amount, purpose, and provider before approving payment.",
        ],
      }),
      section("records", "Records And Restrictions", {
        paragraphs: [
          "Payment metadata and transaction records may be retained for support, dispute handling, fraud prevention, regulatory requirements, accounting, tax, chargebacks, and legal obligations.",
        ],
      }),
    ],
    relatedPolicies: ["privacy", "refunds-disputes-chargebacks", "business-identity-verification"],
  }),
  policy({
    id: "refunds-disputes-chargebacks",
    slug: "refunds-disputes",
    title: "Refunds, Disputes And Chargebacks Notice",
    shortTitle: "Refunds And Disputes",
    category: "marketplace",
    status: "conditional",
    summary: "How refunds, order disputes, payment disputes, chargebacks, failed transactions, and support evidence may be handled.",
    keywords: ["refund", "dispute", "chargeback", "order issue", "failed payment"],
    appliesWhen: "Applies where marketplace orders, transport bookings, checkout, payment, payout, or partner transaction features are enabled.",
    sections: [
      section("expectations", "Refund Expectations", {
        paragraphs: [
          "Refund eligibility may depend on the service, seller terms, product condition, delivery status, payment partner rules, consumer law, and evidence available to support.",
        ],
      }),
      section("evidence", "Dispute Evidence", {
        bullets: [
          "Keep order or trip references, product images, delivery proof, messages, payment references, timestamps, and a clear explanation.",
          "Support may ask both sides for information before deciding what action is available.",
        ],
      }),
      section("chargebacks", "Chargebacks And Payment Disputes", {
        paragraphs: [
          "Chargebacks or external payment disputes may be handled by payment partners under their own rules. KunThai may restrict accounts, pause payouts, or retain records while a dispute is reviewed.",
        ],
      }),
      section("limits", "No Guaranteed Outcome", {
        paragraphs: [
          "Submitting a dispute does not guarantee a refund, reversal, replacement, account action, or particular support result.",
        ],
      }),
    ],
    relatedPolicies: ["urmall-marketplace", "payments-notice", "seller-business-standards"],
  }),
  policy({
    id: "policy-changelog",
    slug: "changelog",
    title: "Policy Updates And Changelog",
    shortTitle: "Changelog",
    category: "transparency",
    summary: "Version history for the Policy Center and future policy changes.",
    keywords: ["policy updates", "changelog", "version", "effective date"],
    audience: "All users and internal reviewers.",
    sections: [
      section("how-updates-work", "How Policy Updates Work", {
        paragraphs: [
          "KunThai may update policies to reflect new services, legal requirements, safety practices, product changes, or clearer language.",
        ],
        bullets: [
          "Material updates should include a version, update date, affected policies, and effective date.",
          "Historical entries should not be fabricated. Add entries only when a real policy change is made.",
        ],
      }),
      section("current-version", "Current Changelog Entry", {
        bullets: policyChangelog.map((entry) => `${entry.version}: ${entry.summary}`),
      }),
    ],
    relatedPolicies: ["terms", "privacy", "accessibility"],
  }),
];

export const policiesById = new Map(policyDocuments.map((item) => [item.id, item]));
export const policiesBySlug = new Map(policyDocuments.map((item) => [item.slug, item]));

export function resolvePolicy(value) {
  const key = String(value || "").trim();
  if (!key) return null;
  return policiesById.get(key) || policiesBySlug.get(key) || null;
}
