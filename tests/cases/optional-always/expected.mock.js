import { faker } from "@faker-js/faker";

/**
 * @param {Partial<import("../src/input").Booking>} [overrides={}]
 * @returns {import("../src/input").Booking}
 */
export function MockBooking(overrides = {}) {
  const result = {
    "id": faker.lorem.words(),
    "reference": faker.lorem.words(),
    "seatCount": faker.number.int(),
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

/**
 * @param {Partial<import("../src/input").Contact>} [overrides={}]
 * @returns {import("../src/input").Contact}
 */
export function MockContact(overrides = {}) {
  const result = {
    "phone": faker.lorem.words(),
    "email": faker.lorem.words(),
  };
  return { ...result, ...overrides };
}
