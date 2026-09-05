export const LATE_ROUTE_START_HOUR = 20;
export const LATE_ROUTE_END_HOUR = 5;

export function isLateRouteHour(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  const hour = date.getHours();

  return hour >= LATE_ROUTE_START_HOUR || hour < LATE_ROUTE_END_HOUR;
}
