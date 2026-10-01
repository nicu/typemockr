import { faker } from "@faker-js/faker";

/**
 * @param {Partial<import("../src/input").Customer>} [overrides={}]
 * @returns {import("../src/input").Customer}
 */
export function MockCustomer(overrides = {}) {
  const result = {
    "id": faker.lorem.words(),
    "name": faker.lorem.words(),
    "email": faker.helpers.maybe(() => faker.lorem.words()),
  };
  return { ...result, ...overrides };
}

/**
 * @param {Partial<import("../src/input").CustomerOmit>} [overrides={}]
 * @returns {import("../src/input").CustomerOmit}
 */
export function MockCustomerOmit(overrides = {}) {
  const result = {
    "id": faker.lorem.words(),
    "name": faker.lorem.words(),
  };
  return { ...result, ...overrides };
}

/**
 * @param {Partial<import("../src/input").CustomerPartial>} [overrides={}]
 * @returns {import("../src/input").CustomerPartial}
 */
export function MockCustomerPartial(overrides = {}) {
  const result = {
    "id": faker.helpers.maybe(() => faker.lorem.words()),
    "name": faker.helpers.maybe(() => faker.lorem.words()),
    "email": faker.helpers.maybe(() => faker.lorem.words()),
  };
  return { ...result, ...overrides };
}

/**
 * @param {Partial<import("../src/input").CustomerPick>} [overrides={}]
 * @returns {import("../src/input").CustomerPick}
 */
export function MockCustomerPick(overrides = {}) {
  const result = {
    "id": faker.lorem.words(),
    "name": faker.lorem.words(),
  };
  return { ...result, ...overrides };
}

/**
 * @param {Partial<import("../src/input").CustomerReadonly>} [overrides={}]
 * @returns {import("../src/input").CustomerReadonly}
 */
export function MockCustomerReadonly(overrides = {}) {
  const result = {
    "id": faker.lorem.words(),
    "name": faker.lorem.words(),
    "email": faker.helpers.maybe(() => faker.lorem.words()),
  };
  return { ...result, ...overrides };
}

/**
 * @param {Partial<import("../src/input").CustomerRecord>} [overrides={}]
 * @returns {import("../src/input").CustomerRecord}
 */
export function MockCustomerRecord(overrides = {}) {
  const result = {};
  return { ...result, ...overrides };
}

/**
 * @param {Partial<import("../src/input").CustomerRequired>} [overrides={}]
 * @returns {import("../src/input").CustomerRequired}
 */
export function MockCustomerRequired(overrides = {}) {
  const result = {
    "id": faker.lorem.words(),
    "name": faker.lorem.words(),
    "email": faker.lorem.words(),
  };
  return { ...result, ...overrides };
}
