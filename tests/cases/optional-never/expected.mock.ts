import { faker } from "@faker-js/faker";
import type { Contact, Preorder } from "../src/input";

export function MockContact(overrides: Partial<Contact> = {}): Contact {
  const result = {
    "phone": faker.lorem.words(),
  };
  return { ...result, ...overrides };
}

export function MockPreorder(overrides: Partial<Preorder> = {}): Preorder {
  const result = {
    "id": faker.lorem.words(),
  };
  return { ...result, ...overrides };
}
