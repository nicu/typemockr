import { faker } from "@faker-js/faker";

/**
 * @param {Partial<import("../src/input").Branch>} [overrides={}]
 * @param {{ depth?: number, maxDepth?: number }} [__options={}]
 * @returns {import("../src/input").Branch}
 */
export function MockBranch(overrides = {}, __options = {}) {
  const { depth = 0, maxDepth = 1 } = __options;

  const result = {
    "leaves": faker.helpers.multiple(() => MockLeaf(), { count: { min: 1, max: 2 } }),
    "labels": faker.helpers.multiple(() => faker.lorem.words(), { count: { min: 1, max: 2 } }),
    "children": depth >= maxDepth ? [] : faker.helpers.multiple(() => MockBranch({}, { depth: depth + 1, maxDepth }), { count: { min: 1, max: 2 } }),
  };
  return { ...result, ...overrides };
}

/**
 * @param {Partial<import("../src/input").Leaf>} [overrides={}]
 * @returns {import("../src/input").Leaf}
 */
export function MockLeaf(overrides = {}) {
  const result = {
    "name": faker.lorem.words(),
  };
  return { ...result, ...overrides };
}
