// The priority a UrRide support ticket is saved with. The database accepts
// only low, normal, high and urgent; the Support form also offers "Safety
// critical", which was saved as "safety critical" and refused ("violates
// check constraint"). It is saved as urgent, the highest, and the message is
// marked so support can tell it from an ordinary urgent ticket.

const SAFETY_CRITICAL = new Set(["safety critical", "safety_critical", "safety-critical", "critical"]);
const ALLOWED = new Set(["low", "normal", "high", "urgent"]);

export function supportTicketPriority(value = "") {
  const priority = String(value || "").trim().toLowerCase();
  if (SAFETY_CRITICAL.has(priority)) return { priority: "urgent", safetyCritical: true };
  return { priority: ALLOWED.has(priority) ? priority : "normal", safetyCritical: false };
}
