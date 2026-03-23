import { faker } from "@faker-js/faker";
import type { Order } from "../src/order";
import { MockPerson, MockProduct } from "./models.mock";

export function MockOrder(overrides: Partial<Order> = {}, __options: { depth?: number; maxDepth?: number } = {}): Order {
  const { depth = 0, maxDepth = 2 } = __options;

  const result = {
    "person": MockPerson(),
    "product": MockProduct(),
    "children": depth >= maxDepth ? ([] as NonNullable<Order["children"]>) : faker.helpers.multiple(() => MockOrder({}, { depth: depth + 1, maxDepth })),
  };
  return { ...result, ...overrides };
}
