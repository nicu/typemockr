import { faker } from "@faker-js/faker";

/**
 * @param {Partial<import("../src/input").User>} [overrides={}]
 * @returns {import("../src/input").User}
 */
export function MockUser(overrides = {}) {
  const result = {
    "name": faker.lorem.words(),
  };
  return { ...result, ...overrides };
}
