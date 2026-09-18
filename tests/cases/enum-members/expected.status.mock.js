import { faker } from "@faker-js/faker";

/**
 * @param {import("../src/status").Priority} [overrides]
 * @returns {import("../src/status").Priority}
 */
export function MockPriority(overrides) {
  const result = faker.helpers.arrayElement([0, 1]);
  return overrides ?? result;
}

/**
 * @param {import("../src/status").Status} [overrides]
 * @returns {import("../src/status").Status}
 */
export function MockStatus(overrides) {
  const result = faker.helpers.arrayElement(["Active", "Pending", "on-hold"]);
  return overrides ?? result;
}
