import { faker } from "@faker-js/faker";
import type { CategoryListItem } from "../src/input";

export function MockCategoryListItem(overrides: Partial<CategoryListItem> = {}, __options: { depth?: number; maxDepth?: number } = {}): CategoryListItem {
  const { depth = 0, maxDepth = 2 } = __options;

  const result = {
    "id": faker.lorem.words(),
    "subcategories": faker.helpers.maybe(() => depth >= maxDepth ? ([] as NonNullable<CategoryListItem["subcategories"]>) : faker.helpers.multiple(() => MockCategoryListItem({}, { depth: depth + 1, maxDepth }))),
  };
  return { ...result, ...overrides };
}
