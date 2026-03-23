import { faker } from "@faker-js/faker";
import type { Person, Product } from "../src/models";

export function MockPerson(overrides: Partial<Person> = {}): Person {
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
