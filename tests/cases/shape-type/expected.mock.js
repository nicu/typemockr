import { faker } from "@faker-js/faker";

/**
 * @param {Partial<import("../src/input").Customer>} [overrides={}]
 * @returns {import("../src/input").Customer}
 */
export function MockCustomer(overrides = {}) {
  const result = {
    "name": faker.lorem.words(),
  };
  return { ...result, ...overrides };
}
