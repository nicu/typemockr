import { faker } from "@faker-js/faker";
import type { Order, Product } from "../src/input";

export function MockOrder(overrides: Partial<Order> = {}): Order {
  const result = {
    "status": faker.helpers.arrayElement([MockProduct(), "draft" as const]),
    "items": faker.helpers.multiple(() => MockProduct()),
    "moreItems": faker.helpers.multiple(() => MockProduct()),
    "metadata": {},
    "address": {
      "name": faker.lorem.words(),
      "number": faker.lorem.words(),
      "zip": faker.lorem.words(),
    },
  };
  return { ...result, ...overrides };
}

export function MockProduct(overrides: Partial<Product> = {}): Product {
  const result = {
    "id": faker.lorem.words(),
  };
  return { ...result, ...overrides };
}
