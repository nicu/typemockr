import { faker } from "@faker-js/faker";

/**
 * @param {Partial<import("../src/input").CategoryListItem>} [overrides={}]
 * @param {{ depth?: number, maxDepth?: number }} [__options={}]
 * @returns {import("../src/input").CategoryListItem}
 */
export function MockCategoryListItem(overrides = {}, __options = {}) {
  const { depth = 0, maxDepth = 2 } = __options;

  const result = {
    "id": faker.lorem.words(),
    "subcategories": faker.helpers.maybe(() => depth >= maxDepth ? [] : faker.helpers.multiple(() => MockCategoryListItem({}, { depth: depth + 1, maxDepth }))),
  };
  return { ...result, ...overrides };
}
