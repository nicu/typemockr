import { faker } from "@faker-js/faker";

/**
 * @param {Partial<import("../src/models").Person>} [overrides={}]
 * @returns {import("../src/models").Person}
 */
export function MockPerson(overrides = {}) {
  const result = {
    "name": faker.lorem.words(),
  };
  return { ...result, ...overrides };
}

/**
 * @param {Partial<import("../src/models").Product>} [overrides={}]
 * @returns {import("../src/models").Product}
 */
export function MockProduct(overrides = {}) {
  const result = {
    "title": faker.lorem.words(),
  };
  return { ...result, ...overrides };
}
