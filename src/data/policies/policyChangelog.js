import { legalConfig } from "../../config/legalConfig";

export const policyChangelog = [
  {
    id: "child-safety-v2",
    date: "August 7, 2026",
    version: "2.0",
    effectiveDate: "August 7, 2026",
    policiesAffected: ["Child Safety Standards"],
    summary: "Published KunThai-specific CSAE and CSAM standards with in-app and public reporting paths, enforcement steps, authority reporting commitments, and child-safety contacts.",
  },
  {
    id: "global-privacy-terms-v2",
    date: "August 7, 2026",
    version: "2.0",
    effectiveDate: legalConfig.effectiveDate,
    policiesAffected: ["Privacy Policy", "Terms Of Service"],
    summary: "Expanded the Privacy Policy and Terms Of Service for KunThai's worldwide service, including regional rights, international transfers, device permissions, automated systems, marketplace, transport, advertising, account security, enforcement, and local-law protections.",
  },
  {
    id: "policy-center-v1",
    date: "August 7, 2026",
    version: "1.0",
    effectiveDate: "August 7, 2026",
    policiesAffected: ["All Policy Center documents"],
    summary: "Initial structured Policy Center for Explore, UrMall, Transport, safety, privacy, reporting, verification, payments, accessibility, and transparency.",
  },
];
