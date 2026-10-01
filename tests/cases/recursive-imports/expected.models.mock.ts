import { faker } from "@faker-js/faker";
import type { Customer, Product } from "../src/models";

export function MockCustomer(overrides: Partial<Customer> = {}): Customer {
  const result = {
    "name": faker.lorem.words(),
  };
  return { ...result, ...overrides };
}

export function MockProduct(overrides: Partial<Product> = {}): Product {
  const result = {
    "title": faker.lorem.words(),
  };
  return { ...result, ...overrides };
}
