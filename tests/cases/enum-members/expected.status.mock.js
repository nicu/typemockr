import { faker } from "@faker-js/faker";

/**
 * @param {import("../src/status").OrderStatus} [overrides]
 * @returns {import("../src/status").OrderStatus}
 */
export function MockOrderStatus(overrides) {
  const result = faker.helpers.arrayElement(["Shipped", "Pending", "on-hold"]);
  return overrides ?? result;
}

/**
 * @param {import("../src/status").Priority} [overrides]
 * @returns {import("../src/status").Priority}
 */
export function MockPriority(overrides) {
  const result = faker.helpers.arrayElement([0, 1]);
  return overrides ?? result;
}
