// Traffic signals for Area View. KunThai has no feed from road sensors or
// traffic authorities, so congestion is INFERRED from three sources, each with
// a confidence score:
//   1. Admin/system traffic snapshots (nearby_area_traffic_snapshots).
//   2. Road reports shared by the community (accident, road block, ...).
//   3. KunThai operators crawling together on the road.
// Area View also judges each route from its own travel time and busy hours.
// These are estimates; the Area View guide tells people not to rely on them.

const OPERATOR_FRESH_MS = 3 * 60 * 1000; // a speed reading older than this says nothing about now
const OPERATOR_MAX_ACCURACY_M = 60; // looser GPS fixes cannot place a slowdown on a road
const CRAWL_MAX_MPS = 3.8; // ~14 km/h
const PARKED_MAX_MPS = 0.5; // below this an available operator is waiting, not stuck
const CLUSTER_RADIUS_M = 180;
const MIN_CLUSTER = 3;

export function isFutureOrMissing(value, now = Date.now()) {
  if (!value) return true;
  const timestamp = new Date(value).getTime();
  return !Number.isFinite(timestamp) || timestamp > now;
}

export function distanceInMeters(a, b) {
  if (!a || !b) return Infinity;
  const toRad = (value) => (Number(value) * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371000 * Math.asin(Math.min(1, Math.sqrt(h)));
}

function uniqueById(items) {
  const seen = new Set();
  return items.filter((item) => {
    if (!item?.id || seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
}

function reportStatus(report) {
  const severity = String(report?.severity || "").toLowerCase();
  if (["critical", "high", "danger", "red"].includes(severity)) return "red";
  if (["medium", "moderate", "warning", "yellow"].includes(severity)) return "yellow";
  return report?.type === "traffic" ? "yellow" : "green";
}

function reportRadius(report) {
  if (report?.type === "accident" || report?.type === "road_block" || report?.type === "emergency") return 520;
  if (report?.type === "traffic" || report?.type === "flooding" || report?.type === "bad_road") return 420;
  return 320;
}

export function buildReportTrafficSignals(reports = [], now = Date.now()) {
  return reports
    .filter((report) => report?.lat != null && report?.lng != null && isFutureOrMissing(report.expiresAt, now))
    .map((report) => ({
      id: `report-traffic-${report.id}`,
      status: reportStatus(report),
      source: "report",
      roadName: report.roadName || report.areaName || "",
      areaName: report.areaName || "",
      message: report.title || report.description || "Road report",
      lat: report.lat,
      lng: report.lng,
      radiusMeters: reportRadius(report),
      confidenceScore: report.verified ? 0.86 : 0.62,
      expiresAt: report.expiresAt,
      linkedReportId: report.id,
    }))
    .filter((signal) => signal.status !== "green");
}

// An operator counts as "held up in traffic" only when the reading is fresh
// and precise, and they are crawling — or stopped while on a trip. An
// available operator standing still is waiting for passengers (a bike stand,
// a taxi rank), which is not congestion.
export function isSlowTrafficOperator(operator, now = Date.now()) {
  if (operator?.lat == null || operator?.lng == null) return false;
  const speed = Number(operator.speedMps);
  if (!Number.isFinite(speed) || speed < 0 || speed > CRAWL_MAX_MPS) return false;

  const seenAt = new Date(operator.lastSeenAt || 0).getTime();
  if (!Number.isFinite(seenAt) || now - seenAt > OPERATOR_FRESH_MS) return false;

  const accuracy = Number(operator.accuracyMeters);
  if (Number.isFinite(accuracy) && accuracy > OPERATOR_MAX_ACCURACY_M) return false;

  const onTrip = Boolean(operator.booked) || operator.status === "busy";
  return onTrip || speed >= PARKED_MAX_MPS;
}

export function buildOperatorTrafficSignals(operators = [], { now = Date.now(), message = (count) => `${count} nearby operators moving slowly` } = {}) {
  const slow = operators.filter((operator) => isSlowTrafficOperator(operator, now));
  const visited = new Set();
  const clusters = [];

  slow.forEach((operator) => {
    if (visited.has(operator.id)) return;
    const cluster = slow.filter((candidate) => !visited.has(candidate.id) && distanceInMeters(operator, candidate) <= CLUSTER_RADIUS_M);
    if (cluster.length < MIN_CLUSTER) return;
    cluster.forEach((item) => visited.add(item.id));

    const averageSpeed = cluster.reduce((sum, item) => sum + Math.max(0, Number(item.speedMps || 0)), 0) / cluster.length;
    const center = cluster.reduce(
      (sum, item) => ({ lat: sum.lat + item.lat / cluster.length, lng: sum.lng + item.lng / cluster.length }),
      { lat: 0, lng: 0 },
    );

    clusters.push({
      id: `operator-slow-${cluster.map((item) => item.id).sort().join("-")}`,
      status: cluster.length >= 5 || averageSpeed <= 1.8 ? "red" : "yellow",
      source: "operators",
      roadName: "",
      areaName: "Live operator movement",
      message: message(cluster.length),
      averageSpeedMps: averageSpeed,
      // Inferred from a few vehicles, so never as certain as a verified report.
      confidenceScore: Math.min(0.75, 0.45 + cluster.length * 0.06),
      lat: center.lat,
      lng: center.lng,
      radiusMeters: cluster.length >= 5 ? 620 : 460,
      expiresAt: new Date(now + 1000 * 60 * 8).toISOString(),
    });
  });

  return clusters.slice(0, 12);
}

export function buildTrafficIntelligence({ snapshots = [], reports = [], operators = [], now = Date.now(), slowOperatorsMessage } = {}) {
  return uniqueById([
    ...snapshots.filter((snapshot) => isFutureOrMissing(snapshot.expiresAt, now)),
    ...buildReportTrafficSignals(reports, now),
    ...buildOperatorTrafficSignals(operators, { now, ...(slowOperatorsMessage ? { message: slowOperatorsMessage } : {}) }),
  ]).slice(0, 120);
}
