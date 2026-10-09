import assert from "node:assert/strict";
import test from "node:test";

import { checkMealDays, mealServedDays, restaurantMealDays, selectableMealDays } from "./restaurantMealDays.js";

test("a meal's days follow every-day, its selected days, then the legacy weekday", () => {
  assert.deepEqual(mealServedDays({ available_everyday: true, available_days: [1] }), [0, 1, 2, 3, 4, 5, 6]);
  assert.deepEqual(mealServedDays({ available_everyday: false, available_days: [5, 1, 1, 9] }), [1, 5]);
  assert.deepEqual(mealServedDays({ available_everyday: false, available_days: [], day_of_week: 3 }), [3]);
  assert.deepEqual(mealServedDays({ available_everyday: false, available_days: [] }), []);
});

test("restaurant days are the union over all meals except the one being edited", () => {
  const meals = [
    { id: "a", available_everyday: false, available_days: [1, 2] },
    { id: "b", available_everyday: false, available_days: [2, 4], available: false },
  ];
  assert.deepEqual(restaurantMealDays(meals), [1, 2, 4]);
  assert.deepEqual(restaurantMealDays(meals, "b"), [1, 2]);
});

test("Free: at most 5 days for a meal and for the restaurant", () => {
  assert.equal(checkMealDays({ limit: 5, newDays: [0, 1, 2, 3, 4, 5, 6] }).reason, "meal");
  assert.equal(checkMealDays({ limit: 5, newDays: [0, 1, 2, 3, 4, 5] }).reason, "meal");
  assert.equal(checkMealDays({ limit: 5, newDays: [1, 2, 3, 4, 5] }).allowed, true);
  assert.equal(checkMealDays({ limit: 5, newDays: [6], otherDays: [1, 2, 3, 4, 5] }).reason, "restaurant");
  assert.equal(checkMealDays({ limit: 5, newDays: [1, 5], otherDays: [1, 2, 3, 4, 5] }).allowed, true);
  assert.equal(checkMealDays({ limit: 5, newDays: [6], otherDays: [1, 2, 3, 4] }).restaurantDays, 5);
});

test("Pro and Premium (no limit) allow every day", () => {
  assert.equal(checkMealDays({ limit: null, newDays: [0, 1, 2, 3, 4, 5, 6] }).allowed, true);
  assert.equal(checkMealDays({ limit: 7, newDays: [0, 1, 2, 3, 4, 5, 6], otherDays: [0, 1, 2, 3, 4, 5, 6] }).allowed, true);
});

test("existing days are kept: unchanged or fewer days are always allowed", () => {
  const everyday = [0, 1, 2, 3, 4, 5, 6];
  assert.equal(checkMealDays({ limit: 5, newDays: everyday, oldDays: everyday, otherDays: [1] }).allowed, true);
  assert.equal(checkMealDays({ limit: 5, newDays: [0, 1, 2, 3, 4, 5], oldDays: everyday }).allowed, true);
  // A grandfathered six-day meal cannot swap in a day it did not have.
  assert.equal(checkMealDays({ limit: 5, newDays: [0, 1, 2, 3, 4, 6], oldDays: [0, 1, 2, 3, 4, 5] }).reason, "meal");
  // A seven-day restaurant may add a meal on days it already serves.
  assert.equal(checkMealDays({ limit: 5, newDays: [0, 6], otherDays: everyday }).allowed, true);
});

test("selectable days stop at the limit", () => {
  assert.deepEqual(selectableMealDays({ limit: 5, otherDays: [1, 2, 3, 4, 5], currentDays: [1] }), [1, 2, 3, 4, 5]);
  assert.deepEqual(selectableMealDays({ limit: 5, otherDays: [], currentDays: [0, 1, 2, 3, 4] }), [0, 1, 2, 3, 4]);
  assert.deepEqual(selectableMealDays({ limit: null, currentDays: [] }), [0, 1, 2, 3, 4, 5, 6]);
});
