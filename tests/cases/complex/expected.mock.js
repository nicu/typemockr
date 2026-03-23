import { faker } from "@faker-js/faker";

/**
 * @param {Partial<import("../src/input").Order>} [overrides={}]
 * @returns {import("../src/input").Order}
 */
export function MockOrder(overrides = {}) {
  const result = {
    "status": faker.helpers.arrayElement([MockProduct(), "draft"]),
    "items": faker.helpers.multiple(() => MockProduct()),
    "moreItems": faker.helpers.multiple(() => MockProduct()),
    "metadata": {},
    "address": {
      "name": faker.lorem.words(),
      "number": faker.lorem.words(),
      "zip": faker.lorem.words(),
    },
  };
  return { ...result, ...overrides };
}

/**
 * @param {Partial<import("../src/input").Product>} [overrides={}]
 * @returns {import("../src/input").Product}
 */
export function MockProduct(overrides = {}) {
  const result = {
    "id": faker.lorem.words(),
  };
  return { ...result, ...overrides };
}
