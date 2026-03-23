import { faker } from "@faker-js/faker";

/**
 * @param {Partial<import("../src/input").DepartmentListItem>} [overrides={}]
 * @param {{ depth?: number, maxDepth?: number }} [__options={}]
 * @returns {import("../src/input").DepartmentListItem}
 */
export function MockDepartmentListItem(overrides = {}, __options = {}) {
  const { depth = 0, maxDepth = 2 } = __options;

  const result = {
    "id": faker.lorem.words(),
    "subdepartments": faker.helpers.maybe(() => depth >= maxDepth ? [] : faker.helpers.multiple(() => MockDepartmentListItem({}, { depth: depth + 1, maxDepth }))),
  };
  return { ...result, ...overrides };
}
