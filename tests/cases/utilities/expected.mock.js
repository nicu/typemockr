import { faker } from "@faker-js/faker";

/**
 * @param {Partial<import("../src/input").User>} [overrides={}]
 * @returns {import("../src/input").User}
 */
export function MockUser(overrides = {}) {
  const result = {
    "id": faker.lorem.words(),
    "name": faker.lorem.words(),
    "email": faker.helpers.maybe(() => faker.lorem.words()),
  };
  return { ...result, ...overrides };
}

/**
 * @param {Partial<import("../src/input").UserOmit>} [overrides={}]
 * @returns {import("../src/input").UserOmit}
 */
export function MockUserOmit(overrides = {}) {
  const result = {
    "id": faker.lorem.words(),
    "name": faker.lorem.words(),
  };
  return { ...result, ...overrides };
}

/**
 * @param {Partial<import("../src/input").UserPartial>} [overrides={}]
 * @returns {import("../src/input").UserPartial}
 */
export function MockUserPartial(overrides = {}) {
  const result = {
    "id": faker.helpers.maybe(() => faker.lorem.words()),
    "name": faker.helpers.maybe(() => faker.lorem.words()),
    "email": faker.helpers.maybe(() => faker.lorem.words()),
  };
  return { ...result, ...overrides };
}

/**
 * @param {Partial<import("../src/input").UserPick>} [overrides={}]
 * @returns {import("../src/input").UserPick}
 */
export function MockUserPick(overrides = {}) {
  const result = {
    "id": faker.lorem.words(),
    "name": faker.lorem.words(),
  };
  return { ...result, ...overrides };
}

/**
 * @param {Partial<import("../src/input").UserReadonly>} [overrides={}]
 * @returns {import("../src/input").UserReadonly}
 */
export function MockUserReadonly(overrides = {}) {
  const result = {
    "id": faker.lorem.words(),
    "name": faker.lorem.words(),
    "email": faker.helpers.maybe(() => faker.lorem.words()),
  };
  return { ...result, ...overrides };
}

/**
 * @param {Partial<import("../src/input").UserRecord>} [overrides={}]
 * @returns {import("../src/input").UserRecord}
 */
export function MockUserRecord(overrides = {}) {
  const result = {};
  return { ...result, ...overrides };
}

/**
 * @param {Partial<import("../src/input").UserRequired>} [overrides={}]
 * @returns {import("../src/input").UserRequired}
 */
export function MockUserRequired(overrides = {}) {
  const result = {
    "id": faker.lorem.words(),
    "name": faker.lorem.words(),
    "email": faker.lorem.words(),
  };
  return { ...result, ...overrides };
}
