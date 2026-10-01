import { faker } from "@faker-js/faker";
import type { Book, Shelf } from "../src/input";

export function MockBook(overrides: Partial<Book> = {}): Book {
  const result = {
    "title": faker.lorem.words(),
  };
  return { ...result, ...overrides };
}

export function MockShelf(overrides: Partial<Shelf> = {}, __options: { depth?: number; maxDepth?: number } = {}): Shelf {
  const { depth = 0, maxDepth = 1 } = __options;

  const result = {
    "books": faker.helpers.multiple(() => MockBook(), { count: { min: 1, max: 2 } }),
    "labels": faker.helpers.multiple(() => faker.lorem.words(), { count: { min: 1, max: 2 } }),
    "children": depth >= maxDepth ? ([] as NonNullable<Shelf["children"]>) : faker.helpers.multiple(() => MockShelf({}, { depth: depth + 1, maxDepth }), { count: { min: 1, max: 2 } }),
  };
  return { ...result, ...overrides };
}
