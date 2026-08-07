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
    summary: "The worldwide rules for accessing KunThai accounts, Explore, UrMall, Transport, support, and related services.",
    keywords: ["terms", "global", "account", "minimum age", "content licence", "transport", "marketplace", "payments", "disputes"],
    audience: "Everyone worldwide who visits KunThai, creates an account, posts, messages, buys, sells, books transport, provides services, or uses support tools.",
    appliesWhen: "These Terms apply wherever KunThai is offered, subject to local availability and any mandatory rights provided by the law where you live.",
    sections: [
      section("agreement-scope", "Agreement And Scope", {
        paragraphs: [
          `These Terms form an agreement between you and ${legalConfig.legalBusinessName} for your use of ${legalConfig.platformName}, its website, mobile application, public pages, and enabled services. By accessing or using KunThai, you agree to these Terms and the policies linked from the Policy Center.`,
          "If you use KunThai for a company, shop, transport operator, or other organization, you confirm that you are authorized to accept these Terms for that organization. If you do not agree, do not access or use the service.",
          "Service-specific rules also apply. Marketplace participants must follow UrMall policies, transport participants must follow transport and safety rules, and payment-related features are governed by the payment notice when those features are enabled.",
        ],
        callouts: [
          "Nothing in these Terms removes consumer, privacy, employment, transport, or other rights that cannot legally be waived in your country.",
        ],
      }),
      section("global-availability", "Global Availability And Local Law", {
        paragraphs: [
          "KunThai is designed for users in multiple countries, but features, languages, maps, products, transport options, verification methods, payment tools, and support channels may differ by location. A feature shown in the app is not a promise that it is legally or operationally available everywhere.",
          "You are responsible for following the laws that apply to your activity, including rules for online content, consumer protection, trade, taxes, licences, transport, employment, privacy, advertising, exports, sanctions, and restricted products.",
        ],
        bullets: [
          "Do not use KunThai where access is prohibited by applicable law.",
          "Do not misrepresent your country, identity, age, licence, business status, or eligibility to unlock a service.",
          "We may limit a feature by country, region, account type, age, verification status, or legal requirement.",
        ],
      }),
      section("eligibility", "Eligibility And Account Roles", {
        paragraphs: [
          `You must be at least ${legalConfig.minimumAge} years old and meet any higher minimum age required in your country. People below the age of legal majority may use KunThai only with any consent or supervision required by local law.`,
          "Seller, hotel, restaurant, property, driver, fleet, and transport-company accounts may require additional documents, licences, insurance, business authorization, or identity checks. Approval by KunThai does not replace any government licence or professional obligation.",
        ],
        callouts: [
          "Some services involve contracts, payments, driving, accommodation, regulated goods, or other activities that may require users to be adults or legally authorized businesses.",
        ],
      }),
      section("account-security", "Account Information And Security", {
        paragraphs: [
          "Provide accurate, current information and keep your phone number, email address, recovery methods, and profile details up to date. You are responsible for protecting your password, device, authentication codes, and linked sign-in accounts.",
          "You are generally responsible for activity performed through your account unless it results from a security failure outside your reasonable control. Tell support promptly if you suspect unauthorized access, fraud, identity misuse, or loss of a device connected to KunThai.",
        ],
        bullets: [
          "Do not sell, rent, share, or transfer account access without written permission from KunThai.",
          "Do not create accounts using another person's identity or contact details without lawful authorization.",
          "We may request verification or temporarily restrict access to protect an account or investigate suspicious activity.",
        ],
      }),
      section("user-content", "Your Content And Licence To KunThai", {
        paragraphs: [
          "You keep ownership of content you create and upload, such as posts, comments, images, videos, voice notes, listings, reviews, messages, and business profile details.",
          "When you upload or share content, you give KunThai a worldwide, non-exclusive, royalty-free licence to host, store, reproduce, technically adapt, display, distribute, moderate, translate, and make that content available only as needed to operate, secure, promote, and improve KunThai. This licence ends when the content is deleted from our active systems, except where copies must remain for other users, backups, safety, disputes, or legal obligations.",
          "You must have all rights and permissions needed for the content you provide, including rights relating to copyright, trademarks, privacy, publicity, music, images, locations, and information about other people.",
        ],
        bullets: [
          "Choose the correct audience and avoid posting confidential or sensitive information publicly.",
          "Do not imply that KunThai endorses your content, listing, business, product, route, or service.",
          "Feedback and product suggestions may be used without payment or confidentiality obligations unless we agree otherwise in writing.",
        ],
      }),
      section("social-communications", "Social Features And Communications", {
        paragraphs: [
          "Explore, Swip, Spaces, profiles, comments, reactions, follows, messages, and sharing tools help people communicate and discover content. You control what you choose to publish, but public content may be viewed, copied, reshared, indexed, or captured by others.",
          "Private messages are intended for their participants, but they are not described as end-to-end encrypted unless KunThai specifically says so. Reported communications may be reviewed when necessary for safety, support, fraud prevention, or legal compliance.",
        ],
      }),
      section("marketplace", "UrMall Marketplace", {
        paragraphs: [
          "UrMall provides tools for users and independent businesses to discover products and services, communicate, create listings, manage orders or bookings, review experiences, and resolve issues. Unless KunThai expressly identifies itself as the seller, the transaction is between the buyer and the independent seller or service provider.",
          "Sellers are responsible for accurate listings, lawful products, required licences, prices, taxes, stock, quality, warranties, delivery, refunds, and consumer obligations. Buyers are responsible for reviewing listing details, confirming the counterparty, using safe payment methods, and providing accurate delivery or booking information.",
        ],
        callouts: [
          "Verification badges and reviews are trust signals, not guarantees of identity, legality, quality, availability, safety, or future conduct.",
        ],
      }),
      section("transport", "Transport And Location Services", {
        paragraphs: [
          "KunThai may connect passengers with independent drivers, companies, fleets, or transport operators and may provide booking, route, fare, location, safety, and support tools. Unless a separate written agreement says otherwise, the transport provider—not KunThai—performs the physical transport service.",
          "Drivers and operators are responsible for lawful licensing, roadworthiness, insurance, safe driving, passenger limits, fares, taxes, and compliance with local transport rules. Passengers must provide accurate pickup information, behave safely, and verify vehicle and operator details before travel.",
          "Maps, routes, estimated arrival times, location results, emergency contacts, and fare estimates may be incomplete, delayed, or inaccurate. They must not replace road signs, professional judgment, official emergency services, or lawful directions from authorities.",
        ],
      }),
      section("payments-promotions", "Payments, Credits, Promotions, And Advertising", {
        paragraphs: [
          "Payment, payout, wallet, visibility-credit, subscription, or promotional features apply only when they are expressly enabled. Additional terms, fees, exchange rates, eligibility checks, refund rules, and third-party payment-provider terms may apply before a transaction is completed.",
          "Promoted listings, advertisements, recommendations, rankings, and visibility tools may affect where content appears. A promotion does not mean KunThai guarantees or endorses the advertiser, seller, product, service, or claim.",
        ],
        bullets: [
          "Do not use payment or promotion tools for fraud, laundering, prohibited trade, fake engagement, or misleading claims.",
          "Keep transaction records and review the final amount, currency, recipient, and terms before authorizing payment.",
          "Taxes, duties, refunds, chargebacks, and payout obligations may depend on the transaction and local law.",
        ],
      }),
      section("third-parties", "Third-Party Services And Links", {
        paragraphs: [
          "KunThai may depend on independent providers for sign-in, hosting, storage, maps, directions, content moderation, notifications, communications, analytics, verification, and payments. Their services may be governed by separate terms and privacy notices.",
          "Links, seller websites, map data, payment pages, and third-party content are provided for convenience. KunThai does not control every third-party service and is not responsible for its independent acts, content, availability, or security, subject to rights that cannot be excluded by law.",
        ],
      }),
      section("restricted-conduct", "Restricted Conduct", {
        bullets: [
          "Do not harass, threaten, exploit, discriminate, scam, impersonate, spam, manipulate reviews, or coordinate fake activity.",
          "Do not upload illegal content, child sexual abuse material, non-consensual intimate content, stolen material, malware, or content that creates a serious safety risk.",
          "Do not attack KunThai, probe non-public systems, scrape private data, evade access controls, reverse engineer protected components, or interfere with security or service availability.",
          "Do not use KunThai for unlawful trade, trafficking, violence, money laundering, sanctions evasion, regulated activity without authorization, or prohibited products.",
          "Do not collect, publish, sell, or misuse another person's personal information without a lawful basis and appropriate permission.",
        ],
      }),
      section("moderation-enforcement", "Moderation, Reports, And Enforcement", {
        paragraphs: [
          "KunThai may use automated tools and human review to detect abuse, moderate content, prioritize reports, verify accounts, reduce unsafe recommendations, and protect the service. Automated systems can make mistakes, and review or appeal tools may be available depending on the decision and local law.",
          "We may label, reduce, restrict, remove, preserve, or report content; limit features; pause transactions; require verification; suspend accounts; or terminate access when reasonably necessary for safety, policy enforcement, legal compliance, fraud prevention, or service integrity.",
          "When appropriate, we may notify you of an enforcement decision and provide a way to request review. We may withhold details if disclosure could expose another person, compromise an investigation, enable abuse, or violate law.",
        ],
      }),
      section("intellectual-property", "KunThai Intellectual Property", {
        paragraphs: [
          "KunThai's software, design, branding, logos, databases, documentation, and original service content are protected by intellectual-property laws. These Terms give you a limited, personal, revocable, non-exclusive, non-transferable right to use the service as intended; they do not transfer ownership of KunThai technology or branding.",
        ],
        bullets: [
          "Do not copy, sell, sublicense, or commercially exploit KunThai technology except as permitted by law or written authorization.",
          `Send copyright or trademark concerns to ${legalConfig.copyrightEmail} with the work, location, ownership basis, and requested action.`,
        ],
      }),
      section("availability-changes", "Availability, Changes, And Updates", {
        paragraphs: [
          "KunThai may add, change, test, suspend, or discontinue features to improve safety, reliability, legal compliance, or product quality. We may provide notice when a change materially affects users, but urgent security or legal changes may take effect immediately.",
          "You are responsible for maintaining a compatible device, internet connection, current app version, and any carrier or data plan needed to use the service.",
        ],
      }),
      section("disclaimers", "Safety And Service Disclaimers", {
        paragraphs: [
          "KunThai provides digital tools with reasonable care, but no online service can guarantee uninterrupted availability, perfect accuracy, complete security, successful transactions, safe conduct by every user, or error-free moderation and recommendations.",
          "Never rely only on KunThai during an emergency. Contact the official emergency services for your location and follow instructions from qualified authorities. KunThai is not a police, ambulance, fire, medical, insurance, banking, or physical security service.",
        ],
        callouts: [
          "Nothing in this section excludes warranties, remedies, or responsibilities that cannot lawfully be excluded in your country.",
        ],
      }),
      section("liability", "Responsibility And Limits Of Liability", {
        paragraphs: [
          "To the extent permitted by applicable law, each party is responsible for losses that are a reasonably foreseeable result of its breach, negligence, fraud, willful misconduct, or violation of law. KunThai is not responsible for independent sellers, buyers, drivers, transport operators, advertisers, or third-party providers merely because they use or appear in the service.",
          "To the extent permitted by law, KunThai is not liable for indirect, incidental, special, punitive, or consequential losses, lost opportunities, lost profits, lost data, or events outside reasonable control. These limits do not apply where liability cannot legally be limited, including certain consumer rights, fraud, willful misconduct, or personal injury caused by negligence where applicable.",
        ],
      }),
      section("termination", "Suspension, Termination, And Account Closure", {
        paragraphs: [
          "You may stop using KunThai at any time and may use available account controls to deactivate or request deletion. We may suspend or terminate access for serious or repeated violations, fraud, danger, legal requirements, prolonged inactivity, or risks to KunThai and its users.",
          "Terms that by their nature should continue after closure remain effective, including provisions about ownership, licences for content that lawfully remains, retained records, disputes, disclaimers, and liability.",
        ],
      }),
      section("disputes-law", "Questions, Complaints, And Applicable Law", {
        paragraphs: [
          `Please first contact ${legalConfig.supportEmail} with enough detail for us to understand and try to resolve the issue. Privacy matters may be sent to ${legalConfig.privacyEmail}.`,
          "These Terms are interpreted under applicable law. Mandatory consumer and privacy protections in your country continue to apply. If a dispute cannot be resolved informally, it may be brought before a court or authority that has jurisdiction under applicable law.",
          "Any future arbitration requirement, class-action waiver, or fixed governing-law clause will apply only if it is clearly presented, legally valid for you, and incorporated into these Terms.",
        ],
      }),
      section("changes-contact", "Changes To These Terms And Contact", {
        paragraphs: [
          "We may update these Terms when services, technology, risks, or laws change. The version and update date appear at the top. For material changes, we may provide additional notice in the app, by email, or through another appropriate channel before the changes take effect where required.",
          `KunThai's website is ${legalConfig.websiteUrl}. General questions may be sent to ${legalConfig.supportEmail}; legal or authority requests may be sent to ${legalConfig.lawEnforcementEmail}.`,
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
    summary: "How KunThai handles personal information worldwide across accounts, social, marketplace, transport, safety, and support services.",
    keywords: ["privacy", "global", "personal data", "messages", "location", "contacts", "deletion", "retention", "cookies", "rights", "transfers"],
    audience: "People worldwide who visit KunThai, create an account, use public pages, Explore, messaging, UrMall, Transport, safety, support, reporting, or verification tools.",
    appliesWhen: "This policy applies to KunThai services worldwide. Additional country or regional notices may apply where local law requires them.",
    sections: [
      section("scope-controller", "Scope And Who Is Responsible", {
        paragraphs: [
          `This Privacy Policy explains how ${legalConfig.legalBusinessName} ("KunThai", "we", "us", or "our") collects, uses, discloses, stores, and protects personal information when you use ${legalConfig.websiteUrl}, the KunThai application, public pages, and related services.`,
          "KunThai is generally responsible for personal information processed to operate the platform. Independent sellers, transport operators, payment providers, sign-in providers, and other organizations may separately control information they collect for their own services. Their privacy notices may also apply.",
          "This policy describes the main practices across KunThai. A feature-specific or regional notice may provide more detail and will apply together with this policy.",
        ],
      }),
      section("information-provided", "Information You Provide", {
        paragraphs: [
          "The information we receive depends on the services you choose, your role, your country, and the permissions you grant.",
        ],
        bullets: [
          "Account and identity information, such as name, username, date of birth or age range, phone number, email address, password credentials handled by our authentication provider, profile photo, language, country, and verification status.",
          "Content and communications, including posts, comments, reactions, shares, Swip videos, voice notes, photos, videos, messages, reports, appeals, surveys, and support requests.",
          "Marketplace and business information, including listings, seller profiles, business contacts, addresses, documents, products, prices, orders, bookings, reviews, customer messages, delivery details, and disputes.",
          "Transport information, including pickup and destination details, route and trip records, driver, company, fleet and vehicle information, licences or verification documents, safety reports, and support cases.",
          "Payment and promotion information when enabled, such as transaction references, payment status, credit balances, promotion activity, payout details, and records needed for refunds, disputes, fraud prevention, accounting, or tax compliance. Full payment credentials may be collected directly by a payment provider rather than KunThai.",
        ],
      }),
      section("automatic-information", "Information Collected Automatically", {
        paragraphs: [
          "When you use KunThai, we and our service providers may automatically receive technical and activity information needed to operate, protect, and improve the service.",
        ],
        bullets: [
          "Device, browser, operating-system, app-version, language, network, IP-address, diagnostic, crash, performance, security, and authentication information.",
          "Usage information such as pages and features used, searches, interactions, follows, saves, recommendations, notification activity, timestamps, referral information, and approximate session history.",
          "Cookie, local-storage, cache, device-token, and similar identifiers used for sessions, preferences, security, notifications, fraud prevention, and service performance.",
          "Approximate or precise location when a feature needs it and your device settings permit it, including map searches, nearby results, pickup and destination points, routes, live-trip activity, delivery locations, and safety tools.",
        ],
      }),
      section("sources-permissions", "Other Sources And Device Permissions", {
        paragraphs: [
          "We may receive information from other users, businesses, transport operators, public sources, identity or sign-in providers, payment partners, mapping providers, moderation services, and authorities where lawful.",
        ],
        bullets: [
          "If you sign in with Google, Apple, Facebook, or another provider, we receive the account details and tokens that provider authorizes, such as your provider identifier, name, email, or profile image.",
          "With your permission, KunThai may access location, camera, microphone, photos, files, contacts, and notification capabilities for the feature you request.",
          "For contact discovery, selected phone numbers may be normalized and checked for matching accounts. KunThai does not use your address book or precise location for advertising.",
          "You can withdraw device permissions in system settings, although the related feature may stop working.",
        ],
      }),
      section("use", "How And Why We Use Information", {
        paragraphs: [
          "We use personal information only for described purposes, compatible purposes, or other purposes disclosed with an appropriate legal basis.",
        ],
        bullets: [
          "Provide and perform the services you request, including authentication, profiles, feeds, search, messaging, marketplace, orders, bookings, transport, maps, notifications, exports, and support.",
          "Personalize content, language, topics, recommendations, nearby results, saved items, service shortcuts, and the order in which information is presented.",
          "Protect users and the platform by verifying accounts, moderating content, detecting spam and fraud, investigating reports, preventing unsafe transport activity, securing sessions, and enforcing policies.",
          "Communicate about accounts, transactions, trips, safety, support, policy changes, new features, and marketing where permitted. You can manage optional communications through available controls.",
          "Measure performance, diagnose errors, conduct research, improve accessibility, develop features, and understand how services are used.",
          "Comply with law, respond to lawful requests, maintain business and transaction records, establish or defend legal claims, and protect vital interests in emergencies.",
        ],
      }),
      section("legal-bases", "Legal Bases Where Required", {
        paragraphs: [
          "Depending on your country, KunThai may need a legal basis for each use of personal information. The basis depends on the context and may include performing a contract with you, your consent, compliance with law, protection of vital interests, or our legitimate interests and those of others.",
          "Legitimate interests may include providing a safe and useful service, preventing fraud, protecting accounts, improving KunThai, understanding service performance, and supporting users. We consider the effect on your rights before relying on those interests. You may withdraw consent at any time, but withdrawal does not make earlier lawful processing invalid.",
        ],
      }),
      section("visibility", "Public Information And Your Choices", {
        paragraphs: [
          "Some KunThai features are public by design. Profile details, posts, comments, reactions, follower relationships, Spaces, seller pages, listings, business contacts, reviews, transport-company profiles, and other content you publish may be visible to users or people outside KunThai, depending on the feature and your settings.",
          "Information you send in a message, order, booking, report, or transaction is shared with the people and organizations needed to carry out that action. Review the audience, recipient, and business details before submitting information.",
        ],
        callouts: [
          "Deleting public content may not remove copies already shared, quoted, downloaded, indexed, or retained by other users and lawful record-keeping systems.",
        ],
      }),
      section("sharing", "When We Disclose Information", {
        paragraphs: [
          "KunThai does not disclose personal information indiscriminately. We disclose it when needed to provide a requested service, follow your direction, operate safely, work with processors, complete a business change, or meet legal obligations.",
        ],
        bullets: [
          "Other users and the public, according to your actions, settings, and the design of the feature.",
          "Sellers, businesses, buyers, drivers, fleets, transport companies, or support participants when needed for a listing, order, booking, trip, delivery, dispute, review, or safety matter.",
          "Vendors that process data for hosting, authentication, databases, storage, content delivery, moderation, maps, geocoding, directions, notifications, communications, analytics, verification, customer support, security, and payments.",
          "Professional advisers, auditors, insurers, financing parties, and transaction participants under appropriate confidentiality and security obligations.",
          "Authorities, courts, emergency responders, or other parties when disclosure is required by law, necessary to respond to a valid legal process, or reasonably needed to prevent serious harm, fraud, abuse, or threats to rights and safety.",
        ],
        callouts: [
          "KunThai does not sell personal information for money. If a regional law treats certain advertising or analytics disclosures as a sale or sharing, we will provide any controls required by that law.",
        ],
      }),
      section("international-transfers", "International Data Transfers", {
        paragraphs: [
          "KunThai is a global service. Personal information may be stored or processed in countries other than the country where you live, including locations used by our hosting, authentication, storage, mapping, moderation, communication, and support providers.",
          "Where required, we use recognized transfer mechanisms, contractual protections, risk assessments, or other safeguards intended to protect transferred information. Local authorities in another country may have lawful access under that country's laws.",
        ],
      }),
      section("retention", "How Long We Keep Information", {
        paragraphs: [
          "We keep personal information only for as long as reasonably needed for the purposes described in this policy. The exact period depends on the type of information, the service, user expectations, safety risks, contractual obligations, limitation periods, and legal requirements.",
        ],
        bullets: [
          "Account and profile information is generally kept while the account is active and for a limited period after closure when needed for restoration, security, disputes, or legal compliance.",
          "Public content and messages are kept while needed to provide the feature. Copies may remain for recipients, reports, moderation, backups, or legal claims after you remove them from your own view.",
          "Marketplace, payment, promotion, booking, and transport records may be retained for accounting, tax, consumer protection, safety, fraud prevention, insurance, disputes, and legal obligations.",
          "Security logs, fraud signals, reports, and enforcement records may be retained long enough to protect users, prevent repeat abuse, and demonstrate compliance.",
          "Backups are deleted or overwritten on scheduled cycles unless preservation is required for security, disaster recovery, litigation, or law.",
        ],
      }),
      section("deletion", "Account Deletion", {
        paragraphs: [
          `You may delete your account through available in-app account controls. You can review the deletion instructions and retention details at ${legalConfig.deletionRequestUrl}. We may verify your identity before processing a request to protect the account from unauthorized deletion.`,
          `Verified deletion requests are normally processed ${legalConfig.deletionProcessingTimeframe}. Eligible account information is deleted or anonymized, while limited records may remain for legal obligations, fraud prevention, safety, disputes, transaction integrity, backups, and the rights of other users.`,
          "Deactivation is different from deletion: deactivation hides or pauses an account but retains information so the account can be restored. The deletion page explains the options and the categories of information that may remain.",
        ],
      }),
      section("security", "How We Protect Information", {
        paragraphs: [
          "We use administrative, technical, and organizational measures designed to protect personal information, including access controls, authentication, database permissions, encrypted network transport, monitoring, backups, moderation controls, and incident-response practices appropriate to the service.",
          "No storage or transmission system is completely secure. Protect your password and authentication codes, keep devices updated, review recipients before sharing, and contact support if you believe your account or information has been compromised.",
        ],
      }),
      section("automated-systems", "Recommendations, Moderation, And Automated Systems", {
        paragraphs: [
          "KunThai may use automated systems to rank content, recommend accounts or listings, identify spam, screen uploaded media, detect fraud, prioritize reports, protect logins, and support human review. These systems may consider content, activity, context, location relevance, reports, account history, and technical signals.",
          "Automated systems can make mistakes. Depending on the decision and applicable law, you may be able to request human review, appeal an enforcement action, change recommendation inputs, or object to certain processing.",
        ],
      }),
      section("rights", "Your Choices And Rights", {
        paragraphs: [
          "Privacy rights differ by country. Subject to applicable law and appropriate identity verification, you may have some or all of the following rights.",
        ],
        bullets: [
          "Access, confirm, or receive a portable copy of personal information associated with your account.",
          "Correct inaccurate information and complete information that is materially incomplete.",
          "Delete information or your account, subject to lawful retention exceptions.",
          "Object to or restrict certain processing, withdraw consent, or opt out of certain targeted advertising, sales, sharing, or profiling where those rights apply.",
          "Appeal certain privacy-request decisions and complain to the data-protection or consumer authority in your region.",
          "Use account and privacy settings to manage audiences, messages, mentions, blocks, recommendations, permissions, notifications, and optional communications.",
        ],
        callouts: [
          `Submit privacy requests through available account controls or email ${legalConfig.privacyEmail}. Describe the request, country, and account identifier, but never send your password or one-time authentication code. Authorized agents may be required to provide proof of authority.`,
        ],
      }),
      section("cookies-storage", "Cookies, Local Storage, And Similar Technology", {
        paragraphs: [
          "KunThai uses cookies, local storage, caches, session tokens, service workers, and similar technologies to keep you signed in, remember settings, save drafts, support notifications, prevent fraud, improve performance, and understand service reliability.",
          "Browser or device controls can remove or block some technologies, but doing so may sign you out, erase local preferences, interrupt uploads, disable notifications, or prevent parts of KunThai from working correctly.",
        ],
      }),
      section("children", "Children's Privacy", {
        paragraphs: [
          `KunThai is not directed to children below ${legalConfig.minimumAge}, and a higher minimum age may apply in some countries. We do not knowingly permit a child below the applicable minimum age to maintain a standard KunThai account.`,
          `If you believe a child has provided personal information in violation of this policy, contact ${legalConfig.privacyEmail}. We may request information needed to verify the report and will take appropriate steps, which may include restricting or deleting the account and associated information.`,
          "Child-safety reports are treated seriously and may be preserved or disclosed to appropriate authorities or child-protection organizations when required or permitted by law.",
        ],
      }),
      section("regional-rights", "Regional Privacy Protections", {
        paragraphs: [
          "Users in the European Economic Area, United Kingdom, Switzerland, Brazil, California and other jurisdictions may receive additional rights under local privacy law. These can include information about processing, access, correction, deletion, portability, objection, restriction, consent withdrawal, opt-out rights, and review of certain automated decisions.",
          "KunThai will apply mandatory regional protections based on the law governing the request. We may need to verify your identity, country, authority to act for another person, or relationship to an account before responding.",
        ],
      }),
      section("changes-contact", "Policy Changes And Contact", {
        paragraphs: [
          "We may update this policy when our services, technology, vendors, risks, or legal duties change. The current version, effective date, and last-updated date appear at the top. We may provide additional notice of material changes through KunThai, email, or another appropriate channel.",
          `Questions and privacy requests may be sent to ${legalConfig.privacyEmail}. General support is available at ${legalConfig.supportEmail}, and the official website is ${legalConfig.websiteUrl}.`,
          "You may also have the right to contact the privacy, data-protection, or consumer authority where you live. Contacting an authority does not prevent you from asking KunThai to address the concern first.",
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
    summary: "KunThai's zero-tolerance standards for child sexual abuse and exploitation across Explore, Swip, Spaces, messages, UrMall, UrRide, and support.",
    keywords: ["child safety", "CSAE", "CSAM", "minors", "grooming", "exploitation", "sextortion", "trafficking"],
    audience: "Everyone who uses KunThai, including people who post, comment, share Swip videos, create Spaces, send messages, list products or services, use UrRide, or contact support.",
    appliesWhen: "These standards apply worldwide to all KunThai accounts, content, communications, listings, transport activity, and conduct connected to the service, whether it occurs publicly, privately, or through a link or contact started on KunThai.",
    supportActions: ["Report child-safety concern", "Contact child-safety team"],
    sections: [
      section("commitment", "Our Zero-Tolerance Commitment", {
        paragraphs: [
          "KunThai prohibits child sexual abuse and exploitation (CSAE) and child sexual abuse material (CSAM). No user, seller, business, driver, transport operator, or other participant may use KunThai to create, upload, store, request, advertise, sell, exchange, distribute, facilitate, or promote CSAE or CSAM.",
          "These standards cover Explore posts, comments, profiles, Swip videos, Spaces, direct messages, voice notes, images, videos, marketplace listings, seller and business pages, UrRide activity, support submissions, and links or off-platform contact used to continue conduct that began on KunThai.",
          "For these standards, a child is any person under 18. KunThai's minimum account age does not reduce the protection owed to anyone under 18.",
        ],
        callouts: [
          "KunThai does not permit exceptions for claimed consent, humor, art, role-play, synthetic or computer-generated imagery, or content that has been edited to hide the age or identity of a child.",
        ],
      }),
      section("prohibited-conduct", "Prohibited Child Sexual Abuse And Exploitation", {
        prohibited: [
          "CSAM or other sexual content involving an actual or apparent child, including photos, videos, illustrations, altered media, or computer-generated imagery.",
          "Grooming a child for sexual activity, sexual conversation, sexual imagery, exploitation, trafficking, or an in-person meeting.",
          "Sextortion, coercion, blackmail, threats, or bribery involving a child, sexual content, intimate imagery, money, gifts, transport, accommodation, or access to services.",
          "Requesting, offering, buying, selling, trading, linking to, or directing anyone to CSAM or sexual services involving a child.",
          "Sexualizing a child or encouraging, praising, normalizing, or instructing others in the sexual abuse or exploitation of children.",
          "Using profiles, Spaces, messages, marketplace listings, business pages, or transport features to identify, recruit, advertise, arrange, or facilitate the sexual exploitation or trafficking of a child.",
          "Sharing a child's sexual or intimate information, location, school, identity, or contact details to enable abuse, stalking, coercion, or exploitation.",
        ],
      }),
      section("age", "Account Age Requirement", {
        paragraphs: [
          `A standard KunThai account requires a date of birth during account setup. A person younger than ${legalConfig.minimumAge} cannot complete KunThai onboarding, and a higher minimum age applies where local law requires it.`,
          "If KunThai learns that an account holder is below the applicable minimum age, we may restrict or remove the account and handle associated personal information under our Privacy Policy and applicable law.",
        ],
      }),
      section("in-app-reporting", "How To Report In KunThai", {
        bullets: [
          "For an Explore post, comment, profile, or Space, open the relevant menu and choose Report. You can also block the account or Space where the blocking control is available.",
          "For a message or other concern that does not show a dedicated Report option, open Help Center, choose Report a problem, select Privacy & Safety, and mark an urgent safety issue when appropriate.",
          "You can also open Your Voice, choose Safety, and send a private report with text and, when useful, an optional screenshot or voice note.",
          "Include the username or profile name, the affected feature, a post or Space link or identifier when available, the date and time, and a concise description of what happened.",
        ],
        callouts: [
          "Do not download, save, forward, email, or re-share suspected CSAM to document a report. Report the account, content, or location in KunThai and describe what you saw without attaching illegal material.",
        ],
      }),
      section("external-reporting", "Report Without The App Or Escalate Urgent Harm", {
        paragraphs: [
          `Anyone can report a child-safety concern without signing in by emailing ${legalConfig.supportEmail} with the subject "Child Safety Report." This is KunThai's public child-safety reporting channel.`,
          "If a child is in immediate danger, first contact the official emergency services or law-enforcement agency in the child's location. KunThai support is not an emergency service.",
          "A report to KunThai does not prevent you from reporting the matter directly to a national child-protection hotline, law-enforcement agency, or other competent authority.",
        ],
      }),
      section("review-enforcement", "Review, Removal, And Account Enforcement", {
        paragraphs: [
          "KunThai reviews child-safety reports using the information available in the report and relevant KunThai records. When KunThai obtains actual knowledge of CSAM on the service, we will disable access to or remove it and take action consistent with these standards and applicable law.",
          "To protect a child or preserve an investigation, KunThai may act before notifying the reported user and may limit the information provided about a review or enforcement decision.",
        ],
        bullets: [
          "Remove or restrict content, links, listings, profiles, Spaces, messages, or other material connected to the violation.",
          "Restrict features, suspend an account during review, or permanently terminate accounts involved in CSAE or CSAM.",
          "Preserve reports, account details, content identifiers, timestamps, and relevant technical records when necessary for safety, legal compliance, or an authority request.",
          "Review related accounts or activity and apply additional restrictions when needed to prevent continued harm or repeated violations.",
          "Reject or limit an appeal when immediate child safety, evidence preservation, or a legal obligation requires the action to remain in place.",
        ],
      }),
      section("authority-reporting", "Reporting To Child-Protection Authorities", {
        paragraphs: [
          "KunThai complies with applicable child-safety laws and lawful reporting duties. When required, KunThai reports confirmed CSAM to the National Center for Missing & Exploited Children (NCMEC) or to the relevant regional child-protection or law-enforcement authority.",
          "KunThai may preserve and disclose relevant account, content, report, and technical information to competent authorities when required by law, in response to valid legal process, or when legally permitted to address an emergency involving a credible risk of serious harm to a child.",
        ],
      }),
      section("contact", "Child Safety Point Of Contact", {
        paragraphs: [
          `Child-safety reports and questions: KunThai Child Safety Team at ${legalConfig.supportEmail}.`,
          `Law-enforcement, child-protection authority, and platform compliance notices: ${legalConfig.lawEnforcementEmail}.`,
          "These mailboxes are intended for child-safety reports and official compliance communications. Never send passwords, one-time authentication codes, or copies of suspected CSAM.",
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
          `Users can delete a signed-in account from the KunThai Privacy Center. If the app is unavailable, use the Delete account action on ${legalConfig.deletionRequestUrl} or email ${legalConfig.privacyEmail}. KunThai verifies ownership before acting on an external request. Never send a password or one-time authentication code.`,
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
          `KunThai aims to complete verified deletion requests ${legalConfig.deletionProcessingTimeframe}. We will contact the requester if verification or a lawful retention requirement affects that timing.`,
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
