// Invented data for the admin preview (dev only, ?preview=chief). Not real people.
const today = new Date().toISOString().slice(0, 10);
const daysAgo = (days) => new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);

const PRODUCTS = [
  ["explore", "Explore", "explore", 30, true],
  ["swip", "Swip", "explore", 30, true],
  ["urmall_buyer", "UrMall buyers", "marketplace", 60, true],
  ["urmall_seller", "UrMall sellers", "marketplace", 30, true],
  ["urride_passenger", "UrRide passengers", "transport", 60, true],
  ["urride_operator", "UrRide operators", "transport", 14, true],
  ["business_plan", "Business plans", "platform", 30, false],
  ["credits", "Visibility credits", "platform", 60, false],
];

export const previewChurnAccess = {
  scoredOn: today,
  canViewUsers: true,
  canManageAccess: true,
  allCountries: true,
  products: PRODUCTS.map(([product, label, sector, churnAfterDays, tracksOpens]) => ({ product, label, sector, churnAfterDays, tracksOpens })),
  countries: [
    { iso: "GH", name: "Ghana", currency: "GHS" },
    { iso: "NG", name: "Nigeria", currency: "NGN" },
    { iso: "SL", name: "Sierra Leone", currency: "SLE" },
  ],
};

const productRows = [
  { product: "explore", users: 1840, churned: 312, atRisk: 221, new: 190, dau: 610, wau: 1120, mau: 1480 },
  { product: "swip", users: 1210, churned: 240, atRisk: 160, new: 120, dau: 420, wau: 760, mau: 930 },
  { product: "urmall_buyer", users: 620, churned: 150, atRisk: 88, new: 40, dau: 90, wau: 260, mau: 410 },
  { product: "urmall_seller", users: 140, churned: 22, atRisk: 19, new: 12, dau: 60, wau: 98, mau: 116 },
  { product: "urride_passenger", users: 530, churned: 120, atRisk: 70, new: 35, dau: 140, wau: 300, mau: 380 },
  { product: "urride_operator", users: 96, churned: 14, atRisk: 11, new: 9, dau: 44, wau: 70, mau: 80 },
  { product: "business_plan", users: 64, churned: 6, atRisk: 7, new: 4, dau: 3, wau: 12, mau: 30 },
  { product: "credits", users: 210, churned: 70, atRisk: 25, new: 15, dau: 20, wau: 60, mau: 120 },
].map((row) => {
  const meta = PRODUCTS.find(([key]) => key === row.product);
  return { ...row, label: meta[1], sector: meta[2], churnAfterDays: meta[3], churnRate: row.churned / row.users, provisional: meta[4] };
});

export function previewChurnOverview(country = null, product = null) {
  const products = productRows.filter((row) => !product || row.product === product);
  const scale = country ? (country === "SL" ? 0.6 : 0.2) : 1;
  const users = Math.round(2050 * scale);
  return {
    scoredOn: today,
    comparedTo: daysAgo(7),
    country,
    product,
    kpis: {
      users, churned: Math.round(390 * scale), atRisk: Math.round(260 * scale), active: Math.round(1180 * scale), new: Math.round(220 * scale),
      churnRate: 0.19, previous: { users: Math.round(1990 * scale), churned: Math.round(362 * scale), atRisk: Math.round(240 * scale), churnRate: 0.182 },
    },
    revenueAtRisk: [{ currency: "SLE", amount: 18240 }, { currency: "USD", amount: 420 }, { currency: "NGN", amount: 96000 }],
    revenueLost: [{ currency: "SLE", amount: 6120 }, { currency: "USD", amount: 95 }],
    segments: { low: Math.round(1020 * scale), medium: Math.round(160 * scale), high: Math.round(260 * scale), churned: Math.round(390 * scale), new: Math.round(220 * scale) },
    inactivity: [
      { label: "0–6 days", users: Math.round(1110 * scale) }, { label: "7–13 days", users: Math.round(260 * scale) },
      { label: "14–29 days", users: Math.round(210 * scale) }, { label: "30–59 days", users: Math.round(190 * scale) },
      { label: "60–89 days", users: Math.round(120 * scale) }, { label: "90+ days", users: Math.round(160 * scale) },
    ],
    products,
    countries: [
      { iso: "SL", name: "Sierra Leone", users: 1230, churned: 250, atRisk: 150, churnRate: 0.203 },
      { iso: "NG", name: "Nigeria", users: 410, churned: 70, atRisk: 60, churnRate: 0.171 },
      { iso: "GH", name: "Ghana", users: 330, churned: 52, atRisk: 41, churnRate: 0.158 },
      { iso: "??", name: null, users: 80, churned: 18, atRisk: 9, churnRate: 0.225 },
    ].filter((row) => !country || row.iso === country),
    signals: [
      { key: "inactive", users: 210 }, { key: "usage_drop", users: 140 }, { key: "push_off", users: 120 },
      { key: "opens_only", users: 64 }, { key: "spend_drop", users: 51 }, { key: "unanswered_customers", users: 14 },
    ],
    actions: [
      { action: "explore_comeback", product: "explore", users: 180 }, { action: "urmall_cart_reminder", product: "urmall_buyer", users: 70 },
      { action: "urride_saved_places_reminder", product: "urride_passenger", users: 52 }, { action: "urmall_unanswered_nudge", product: "urmall_seller", users: 14 },
    ].filter((row) => !product || row.product === product),
    trend: Array.from({ length: 14 }, (_, index) => ({
      day: daysAgo(13 - index), users: users, churned: Math.round((360 + index * 2) * scale), atRisk: Math.round((230 + (index % 4) * 8) * scale),
    })),
  };
}

const PEOPLE = [
  ["Fatmata K.", "fatmata", "SL", ["explore", "swip", "urmall_buyer"], 28, 190, 21],
  ["Ibrahim S.", "ibrahim.s", "SL", ["urride_operator", "explore"], 27, 160, 25],
  ["Chiamaka O.", "chiamaka", "NG", ["urmall_seller", "explore", "swip"], 26, 240, 12],
  ["Kwame A.", "kwame", "GH", ["swip", "credits"], 24, 130, 9],
  ["Aminata B.", "aminata", "SL", ["urride_passenger", "explore"], 22, 80, 6],
];

export function previewChurnLeaders(country = null, product = null, days = 30) {
  const people = PEOPLE.filter(([, , iso, products]) => (!country || iso === country) && (!product || products.includes(product)));
  const toRow = ([name, username, iso, products, activeDays, actions, prior], index) => ({
    userId: `preview-${index}`, name, username, avatarUrl: null, country: iso, products, activeDays, actions, priorActiveDays: prior, gain: activeDays - prior,
  });
  return {
    from: daysAgo(days - 1),
    to: today,
    days,
    countries: [
      { iso: "SL", name: "Sierra Leone", activeUsers: 980, priorActiveUsers: 900, growth: 0.089, newUsers: 140, churnRate: 0.203, spend: [{ currency: "SLE", amount: 52400 }, { currency: "USD", amount: 820 }] },
      { iso: "NG", name: "Nigeria", activeUsers: 360, priorActiveUsers: 280, growth: 0.286, newUsers: 95, churnRate: 0.171, spend: [{ currency: "NGN", amount: 410000 }] },
      { iso: "GH", name: "Ghana", activeUsers: 290, priorActiveUsers: 300, growth: -0.033, newUsers: 40, churnRate: 0.158, spend: [{ currency: "GHS", amount: 3900 }] },
    ].filter((row) => !country || row.iso === country),
    sectors: productRows.filter((row) => !product || row.product === product).map((row) => ({
      product: row.product, label: row.label, activeUsers: row.mau, priorActiveUsers: Math.round(row.mau * 0.9), dau: row.dau, wau: row.wau,
      actionDays: row.mau * 4, actions: row.mau * 11, churnRate: row.churnRate, provisional: row.provisional,
    })),
    crossSector: {
      buckets: { one: 820, two: 540, threePlus: 270 },
      pairs: [
        { a: "explore", b: "swip", users: 610 }, { a: "explore", b: "urmall_buyer", users: 240 },
        { a: "swip", b: "urmall_buyer", users: 180 }, { a: "explore", b: "urride_passenger", users: 170 },
      ],
    },
    cohorts: [
      { month: daysAgo(150).slice(0, 7), users: 210, retained: 92, retention: 0.438 },
      { month: daysAgo(120).slice(0, 7), users: 260, retained: 130, retention: 0.5 },
      { month: daysAgo(90).slice(0, 7), users: 310, retained: 171, retention: 0.552 },
      { month: daysAgo(60).slice(0, 7), users: 340, retained: 218, retention: 0.641 },
      { month: daysAgo(30).slice(0, 7), users: 390, retained: 290, retention: 0.744 },
      { month: today.slice(0, 7), users: 120, retained: 118, retention: 0.983 },
    ],
    weekdays: [1, 2, 3, 4, 5, 6, 7].map((weekday) => ({ weekday, userDays: [620, 590, 640, 660, 810, 920, 700][weekday - 1] })),
    usersHidden: false,
    mostActive: people.map(toRow),
    rising: people.map(toRow).sort((a, b) => b.gain - a.gain).slice(0, 3),
  };
}

export function previewChurnWatchlist(country = null, product = null, status = "attention") {
  const rows = PEOPLE.map(([name, username, iso, products], index) => ({
    userId: `preview-${index}`, name, username, avatarUrl: null, product: products[0], country: iso,
    status: index % 3 === 2 ? "churned" : "at_risk", segment: index % 3 === 2 ? "churned" : "high", score: [82, 74, 100, 66, 61][index],
    signals: [
      { key: "inactive", points: 30, detail: `${20 + index * 6} days without activity` },
      { key: index % 2 ? "push_off" : "usage_drop", points: index % 2 ? 5 : 25, detail: "" },
    ],
    revenueAtRisk: index === 0 ? { SLE: 340 } : {}, action: ["explore_comeback", "urride_demand_alert", "urmall_unanswered_nudge", "swip_creator_boost", "urride_saved_places_reminder"][index],
    provisional: true, lastActiveDay: daysAgo(20 + index * 6), daysInactive: 20 + index * 6, activeDays30: 3, actions30: 9,
  })).filter((row) => (!country || row.country === country) && (!product || row.product === product)
    && (status === "all" || status === "attention" || row.status === status));
  return { scoredOn: today, total: rows.length, limit: 50, offset: 0, rows };
}

export const previewChurnAccessList = [
  { assignmentId: "team-1", userId: "preview-user", name: "Chief Operations", email: "chief@kunthai.test", roleKey: "chief_admin", roleName: "Chief Admin", sectors: ["all"], regions: ["all"], products: ["all"], canViewUsers: true },
  { assignmentId: "team-4", userId: "ride-user", name: "UrRide Desk", email: "ride@kunthai.test", roleKey: "transport_manager", roleName: "Transport Manager", sectors: ["transport"], regions: ["SL"], products: ["urride_operator"], canViewUsers: true },
  { assignmentId: "team-5", userId: "analyst-user", name: "Growth Analyst", email: "growth@kunthai.test", roleKey: "analyst", roleName: "Analyst", sectors: ["all"], regions: ["all"], products: ["explore", "swip"], canViewUsers: false },
];

// Phase 4 ------------------------------------------------------------------------

previewChurnAccess.canSendCampaigns = true;
previewChurnAccess.campaignProducts = PRODUCTS.map(([product]) => product);

export function previewChurnProductDetail(product = "explore", country = null) {
  const row = productRows.find((item) => item.product === product) || productRows[0];
  const scale = country ? 0.6 : 1;
  const n = (value) => Math.round(value * scale);
  return {
    scoredOn: today,
    baselineDay: daysAgo(14),
    product: row.product,
    label: row.label,
    sector: row.sector,
    churnAfterDays: row.churnAfterDays,
    tracksOpens: row.provisional,
    provisional: row.provisional,
    funnel: {
      customers: n(row.users), opened30: n(row.mau * 0.95), active30: n(row.mau), active7: n(row.wau), acted30: n(row.mau * 0.7),
      spent30: n(row.mau * 0.25), atRisk: n(row.atRisk), churned: n(row.churned), new: n(row.new), avgActiveDays30: 9.4, avgActions30: 31.2,
    },
    scoreBands: [
      { from: 0, to: 19, users: n(row.users * 0.42) }, { from: 20, to: 39, users: n(row.users * 0.2) },
      { from: 40, to: 59, users: n(row.users * 0.09) }, { from: 60, to: 79, users: n(row.atRisk * 0.7) }, { from: 80, to: 100, users: n(row.atRisk * 0.3) },
    ],
    signals: [
      { key: "inactive", users: n(row.atRisk * 0.8), share: 0.18, withChurnRate: 0.41, withoutChurnRate: 0.06, lift: 6.83 },
      { key: "usage_drop", users: n(row.atRisk * 0.5), share: 0.11, withChurnRate: 0.29, withoutChurnRate: 0.07, lift: 4.14 },
      { key: "push_off", users: n(row.users * 0.3), share: 0.3, withChurnRate: 0.15, withoutChurnRate: 0.08, lift: 1.88 },
      { key: "opens_only", users: n(row.atRisk * 0.2), share: 0.04, withChurnRate: null, withoutChurnRate: null, lift: null },
    ],
    spend30: product === "urmall_buyer" ? [{ currency: "SLE", amount: 48200 }, { currency: "NGN", amount: 210000 }] : [],
    revenueAtRisk: product === "urmall_buyer" ? [{ currency: "SLE", amount: 9100 }] : [],
    actions: [{ action: "explore_comeback", users: n(row.atRisk) }],
    countries: [
      { iso: "SL", name: "Sierra Leone", users: n(row.users * 0.6), churnRate: 0.2 },
      { iso: "NG", name: "Nigeria", users: n(row.users * 0.25), churnRate: 0.16 },
      { iso: "GH", name: "Ghana", users: n(row.users * 0.15), churnRate: 0.15 },
    ].filter((item) => !country || item.iso === country),
  };
}

const PREVIEW_REGIONS = {
  SL: [
    { id: "sl-w", name: "Western Area", typeLabel: "Area", users: 720, churned: 160, atRisk: 90, children: [
      { id: "sl-wu", name: "Western Area Urban", typeLabel: "District", users: 610, churned: 128, atRisk: 80 },
      { id: "sl-wr", name: "Western Area Rural", typeLabel: "District", users: 110, churned: 32, atRisk: 10 },
    ] },
    { id: "sl-n", name: "Northern", typeLabel: "Province", users: 210, churned: 40, atRisk: 30, children: [
      { id: "sl-bo", name: "Bombali", typeLabel: "District", users: 150, churned: 25, atRisk: 20 },
      { id: "sl-to", name: "Tonkolili", typeLabel: "District", users: 60, churned: 15, atRisk: 10 },
    ] },
    { id: "sl-e", name: "Eastern", typeLabel: "Province", users: 160, churned: 38, atRisk: 18, children: [] },
    { id: "sl-s", name: "Southern", typeLabel: "Province", users: 90, churned: 12, atRisk: 9, children: [] },
    { id: "sl-nw", name: "North Western", typeLabel: "Province", users: 50, churned: 11, atRisk: 3, children: [] },
  ],
};

export function previewChurnRegions(country = "SL", product = null, parent = null) {
  const top = PREVIEW_REGIONS[country] || [
    { id: `${country}-1`, name: "Capital region", typeLabel: "Region", users: 220, churned: 40, atRisk: 25, children: [] },
    { id: `${country}-2`, name: "North", typeLabel: "Region", users: 80, churned: 20, atRisk: 8, children: [] },
  ];
  const parentRow = parent ? top.find((item) => item.id === parent) : null;
  const list = parentRow ? parentRow.children : top;
  const shape = (item) => ({
    id: item.id, name: item.name, typeLabel: item.typeLabel, hasChildren: Boolean(item.children?.length),
    users: item.users, churned: item.churned, atRisk: item.atRisk, active: item.users - item.churned - item.atRisk, new: 0,
    active30: item.users - item.churned, churnRate: item.users ? item.churned / item.users : null,
  });
  return {
    scoredOn: today,
    country,
    countryName: previewChurnAccess.countries.find((item) => item.iso === country)?.name || country,
    subdivisionLabel: "Districts",
    parent: parentRow ? { id: parentRow.id, name: parentRow.name, typeLabel: parentRow.typeLabel, parentId: null, level: 1 } : null,
    breadcrumb: parentRow ? [{ id: parentRow.id, name: parentRow.name }] : [],
    people: list.reduce((sum, item) => sum + item.users, 0) + 12,
    unplaced: 12,
    regions: list.map(shape),
    product,
  };
}

// Phase 5 ------------------------------------------------------------------------

export function previewChurnCampaignAudience({ audience = "attention", holdoutPct = 10, country = null } = {}) {
  const base = { attention: 260, at_risk: 210, churned: 390, at_risk_churned: 600 }[audience] || 260;
  const matching = country && country !== "all" ? Math.round(base * 0.6) : base;
  const skipped = Math.round(matching * 0.1);
  const eligible = matching - skipped;
  const holdout = Math.round((eligible * holdoutPct) / 100);
  return {
    matching, recentlyContacted: skipped, eligible, holdoutPct, holdoutEstimate: holdout, targetEstimate: eligible - holdout,
    reachableByPush: Math.round(eligible * 0.55), cap: 5000,
    languages: [{ locale: "en", users: Math.round(eligible * 0.8) }, { locale: "fr", users: eligible - Math.round(eligible * 0.8) }],
    countries: [{ iso: "SL", name: "Sierra Leone", users: Math.round(eligible * 0.7) }, { iso: "NG", name: "Nigeria", users: eligible - Math.round(eligible * 0.7) }],
  };
}

const previewCampaignLog = [
  {
    id: "preview-c1", name: "Churn · UrMall buyers · urmall_cart_reminder", product: "urmall_buyer", country: "SL",
    audience: { status: "at_risk", signal: null, action: "urmall_cart_reminder" }, action: "urmall_cart_reminder", holdoutPct: 10, windowDays: 30,
    sentAt: new Date(Date.now() - 34 * 86400000).toISOString(), createdBy: "Chief Operations", daysSinceSend: 34, final: true,
    target: 180, holdout: 20, skippedRecent: 6, delivered: 180, pushed: 102, opened: 77, clicked: 31,
    targetRecovered: 63, holdoutRecovered: 4, targetRate: 0.35, holdoutRate: 0.2, liftPoints: 15,
  },
  {
    id: "preview-c2", name: "Churn · Explore · explore_comeback", product: "explore", country: null,
    audience: { status: "attention", signal: "inactive", action: null }, action: "explore_comeback", holdoutPct: 10, windowDays: 30,
    sentAt: new Date(Date.now() - 6 * 86400000).toISOString(), createdBy: "Growth Analyst", daysSinceSend: 6, final: false,
    target: 420, holdout: 47, skippedRecent: 0, delivered: 420, pushed: 260, opened: 140, clicked: 52,
    targetRecovered: 96, holdoutRecovered: 6, targetRate: 0.2286, holdoutRate: 0.1277, liftPoints: 10.1,
  },
];

export function previewChurnCampaignSend(input = {}) {
  const audience = previewChurnCampaignAudience(input);
  const row = {
    ...previewCampaignLog[1], id: `preview-${Date.now()}`, name: input.name || `Churn · ${input.product} · ${input.action || input.audience}`,
    product: input.product, country: input.country && input.country !== "all" ? input.country : null,
    audience: { status: input.audience, signal: input.signal || null, action: input.action || null }, action: input.action || null,
    sentAt: new Date().toISOString(), daysSinceSend: 0, final: false, target: audience.targetEstimate, holdout: audience.holdoutEstimate,
    delivered: audience.targetEstimate, pushed: 0, opened: 0, clicked: 0, targetRecovered: 0, holdoutRecovered: 0,
    targetRate: 0, holdoutRate: 0, liftPoints: 0, createdBy: "Chief Operations",
  };
  previewCampaignLog.unshift(row);
  return { campaignId: row.id, name: row.name, target: row.target, holdout: row.holdout, skippedRecent: audience.recentlyContacted, notificationsCreated: row.target };
}

export function previewChurnCampaignResults() {
  return previewCampaignLog;
}
