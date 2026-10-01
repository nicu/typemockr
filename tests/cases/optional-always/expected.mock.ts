import { faker } from "@faker-js/faker";
import type { Contact, Preorder } from "../src/input";

export function MockContact(overrides: Partial<Contact> = {}): Contact {
  const result = {
    "phone": faker.lorem.words(),
    "email": faker.lorem.words(),
  };
  return { ...result, ...overrides };
}

export function MockPreorder(overrides: Partial<Preorder> = {}): Preorder {
  const result = {
    "id": faker.lorem.words(),
    "reference": faker.lorem.words(),
    "quantity": faker.number.int(),
    "cancelledAt": faker.date.recent(),
    "contact": MockContact(),
    "inline": {
      "note": faker.lorem.words(),
      "kind": faker.lorem.words(),
    },
    "tags": faker.helpers.multiple(() => faker.lorem.words()),
  };
  return { ...result, ...overrides };
}
