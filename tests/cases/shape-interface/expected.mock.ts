import { faker } from "@faker-js/faker";
import type { Customer } from "../src/input";

export function MockCustomer(overrides: Partial<Customer> = {}): Customer {
  const result = {
    "name": faker.lorem.words(),
  };
  return { ...result, ...overrides };
}
