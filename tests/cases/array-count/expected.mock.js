import { faker } from "@faker-js/faker";

/**
 * @param {Partial<import("../src/input").Book>} [overrides={}]
 * @returns {import("../src/input").Book}
 */
export function MockBook(overrides = {}) {
  const result = {
    "title": faker.lorem.words(),
  };
  return { ...result, ...overrides };
}

/**
 * @param {Partial<import("../src/input").Shelf>} [overrides={}]
 * @param {{ depth?: number, maxDepth?: number }} [__options={}]
 * @returns {import("../src/input").Shelf}
 */
export function MockShelf(overrides = {}, __options = {}) {
  const { depth = 0, maxDepth = 1 } = __options;

  const result = {
    "books": faker.helpers.multiple(() => MockBook(), { count: { min: 1, max: 2 } }),
    "labels": faker.helpers.multiple(() => faker.lorem.words(), { count: { min: 1, max: 2 } }),
    "children": depth >= maxDepth ? [] : faker.helpers.multiple(() => MockShelf({}, { depth: depth + 1, maxDepth }), { count: { min: 1, max: 2 } }),
  };
  return { ...result, ...overrides };
}
