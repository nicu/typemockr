import { faker } from "@faker-js/faker";
import { MockPerson, MockProduct } from "./models.mock.js";

/**
 * @param {Partial<import("../src/order").Order>} [overrides={}]
 * @param {{ depth?: number, maxDepth?: number }} [__options={}]
 * @returns {import("../src/order").Order}
 */
export function MockOrder(overrides = {}, __options = {}) {
  const { depth = 0, maxDepth = 2 } = __options;

  const result = {
    "person": MockPerson(),
    "product": MockProduct(),
    "children": depth >= maxDepth ? [] : faker.helpers.multiple(() => MockOrder({}, { depth: depth + 1, maxDepth })),
  };
  return { ...result, ...overrides };
}
