import { faker } from "@faker-js/faker";
import type { Booking, Contact } from "../src/input";

export function MockBooking(overrides: Partial<Booking> = {}): Booking {
  const result = {
    "id": faker.lorem.words(),
  };
  return { ...result, ...overrides };
}

export function MockContact(overrides: Partial<Contact> = {}): Contact {
  const result = {
    "phone": faker.lorem.words(),
  };
  return { ...result, ...overrides };
}
