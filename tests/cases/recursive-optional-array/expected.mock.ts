import { faker } from "@faker-js/faker";
import type { DepartmentListItem } from "../src/input";

export function MockDepartmentListItem(overrides: Partial<DepartmentListItem> = {}, __options: { depth?: number; maxDepth?: number } = {}): DepartmentListItem {
  const { depth = 0, maxDepth = 2 } = __options;

  const result = {
    "id": faker.lorem.words(),
    "subdepartments": faker.helpers.maybe(() => depth >= maxDepth ? ([] as NonNullable<DepartmentListItem["subdepartments"]>) : faker.helpers.multiple(() => MockDepartmentListItem({}, { depth: depth + 1, maxDepth }))),
  };
  return { ...result, ...overrides };
}
