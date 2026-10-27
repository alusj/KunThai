// Registration placeholders follow the fleet the operator picked, so a
// motorbike shows a TVS or Boxer, a keke a Bajaj RE, a taxi an Almera or
// Corolla, and a delivery van a Hiace. Solo "Car" fleets on the delivery
// service are vans; company fleets name their type ("Van", "Taxi").
export function fleetExampleKind(fleetType = "", category = "") {
  const type = String(fleetType).trim().toLowerCase();
  if (["motorcycle", "motorbike", "bike", "okada"].includes(type)) return "bike";
  if (["tricycle", "keke"].includes(type)) return "keke";
  if (type === "van") return "van";
  if (type === "car" && /^delivery/i.test(String(category).trim())) return "van";
  return "car";
}

// Translation key for one fleet field's example, read with t().
export function fleetExampleKey(field, fleetType, category) {
  return `registrationExamples.urride.${fleetExampleKind(fleetType, category)}.${field}`;
}
