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
 * @param {Partial<import("../src/input").Genre>} [overrides={}]
 * @returns {import("../src/input").Genre}
 */
export function MockGenre(overrides = {}) {
  const result = {
    "name": faker.lorem.words(),
  };
  return { ...result, ...overrides };
}

/**
 * @param {Partial<import("../src/input").StaffAccount>} [overrides={}]
 * @returns {import("../src/input").StaffAccount}
 */
export function MockStaffAccount(overrides = {}) {
  const result = {
    "level": faker.number.int(),
    "id": faker.lorem.words(),
  };
  return { ...result, ...overrides };
}
