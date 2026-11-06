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
