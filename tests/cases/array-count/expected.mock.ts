import { faker } from "@faker-js/faker";
import type { Branch, Leaf } from "../src/input";

export function MockBranch(overrides: Partial<Branch> = {}, __options: { depth?: number; maxDepth?: number } = {}): Branch {
  const { depth = 0, maxDepth = 1 } = __options;

  const result = {
    "leaves": faker.helpers.multiple(() => MockLeaf(), { count: { min: 1, max: 2 } }),
    "labels": faker.helpers.multiple(() => faker.lorem.words(), { count: { min: 1, max: 2 } }),
    "children": depth >= maxDepth ? ([] as NonNullable<Branch["children"]>) : faker.helpers.multiple(() => MockBranch({}, { depth: depth + 1, maxDepth }), { count: { min: 1, max: 2 } }),
  };
  return { ...result, ...overrides };
}

export function MockLeaf(overrides: Partial<Leaf> = {}): Leaf {
  const result = {
    "name": faker.lorem.words(),
  };
  return { ...result, ...overrides };
}
