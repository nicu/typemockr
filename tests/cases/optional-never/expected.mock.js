import { faker } from "@faker-js/faker";

/**
 * @param {Partial<import("../src/input").Booking>} [overrides={}]
 * @returns {import("../src/input").Booking}
 */
export function MockBooking(overrides = {}) {
  const result = {
    "id": faker.lorem.words(),
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
  };
  return { ...result, ...overrides };
}
