// Restaurant meal days and the Free plan's weekday limit (2026-10-10).
// Mirrors the database guard kunthai_guard_urmall_meal_days:
//   * a meal is served every weekday when available_everyday is on, otherwise
//     on its available_days, falling back to the legacy day_of_week;
//   * the days a restaurant uses are the union over ALL its meals (shown or
//     hidden);
//   * on a plan with a meal-day limit a meal may cover at most `limit` days
//     and the restaurant at most `limit` days in total. Days a meal or the
//     restaurant already had are never refused (existing sellers keep them).

export const ALL_WEEKDAYS = Object.freeze([0, 1, 2, 3, 4, 5, 6]);
export const FREE_MEAL_DAY_LIMIT = 5;

function sortedDays(days) {
  return Array.from(new Set(days.map(Number).filter((day) => Number.isInteger(day) && day >= 0 && day <= 6))).sort((a, b) => a - b);
}

export function mealServedDays(meal = {}) {
  if (!meal) return [];
  if (meal.available_everyday === true) return [...ALL_WEEKDAYS];
  const days = sortedDays(Array.isArray(meal.available_days) ? meal.available_days : []);
  if (days.length) return days;
  const legacy = Number(meal.day_of_week);
  return Number.isInteger(legacy) && legacy >= 0 && legacy <= 6 ? [legacy] : [];
}

// Days used by every meal of the restaurant except `excludeId` (the meal
// being edited).
export function restaurantMealDays(meals = [], excludeId = "") {
  return sortedDays((meals || []).filter((meal) => meal && (!excludeId || meal.id !== excludeId)).flatMap(mealServedDays));
}

const isSubset = (days, of) => days.every((day) => of.includes(day));

// limit: the plan's meal-day limit (null = all 7 days).
// newDays: the days the meal will have. oldDays: the days it has now ([] for a
// new meal). otherDays: restaurantMealDays(meals, mealId).
export function checkMealDays({ limit = null, newDays = [], oldDays = [], otherDays = [] } = {}) {
  const next = sortedDays(newDays);
  const previous = sortedDays(oldDays);
  const others = sortedDays(otherDays);
  const restaurantAfter = sortedDays([...others, ...next]);
  const result = { allowed: true, reason: "", mealDays: next.length, restaurantDays: restaurantAfter.length, limit };
  if (limit === null || limit === undefined || limit >= 7 || isSubset(next, previous)) return result;
  if (next.length > limit) return { ...result, allowed: false, reason: "meal" };
  if (restaurantAfter.length > limit && !isSubset(restaurantAfter, sortedDays([...others, ...previous]))) {
    return { ...result, allowed: false, reason: "restaurant" };
  }
  return result;
}

// The days a meal may still be given without going over the limit.
export function selectableMealDays({ limit = null, oldDays = [], otherDays = [], currentDays = [] } = {}) {
  return ALL_WEEKDAYS.filter((day) => checkMealDays({ limit, newDays: sortedDays([...currentDays, day]), oldDays, otherDays }).allowed);
}
