import { faker } from "@faker-js/faker";

/**
 * @param {Partial<import("../src/input").Account>} [overrides={}]
 * @returns {import("../src/input").Account}
 */
export function MockAccount(overrides = {}) {
  const result = {
    "id": faker.lorem.words(),
  };
  return { ...result, ...overrides };
}

/**
 * @param {Partial<import("../src/input").Admin>} [overrides={}]
 * @returns {import("../src/input").Admin}
 */
export function MockAdmin(overrides = {}) {
  const result = {
    "level": faker.number.int(),
    "id": faker.lorem.words(),
  };
  return { ...result, ...overrides };
}

/**
 * @param {Partial<import("../src/input").Plain>} [overrides={}]
 * @returns {import("../src/input").Plain}
 */
export function MockPlain(overrides = {}) {
  const result = {
    "name": faker.lorem.words(),
  };
  return { ...result, ...overrides };
}
