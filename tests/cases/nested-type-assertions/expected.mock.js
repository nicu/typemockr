import { faker } from "@faker-js/faker";

/**
 * @param {Partial<import("../src/input").Listing>} [overrides={}]
 * @returns {import("../src/input").Listing}
 */
export function MockListing(overrides = {}) {
  const result = {
    "required": {
      "primary": faker.lorem.words(),
      "secondary": faker.lorem.words(),
    },
    "optional": faker.helpers.maybe(() => ({
      "primary": faker.lorem.words(),
      "secondary": faker.lorem.words(),
    })),
    "items": faker.helpers.multiple(() => ({
      "label": faker.lorem.words(),
    })),
    "optionalItems": faker.helpers.maybe(() => faker.helpers.multiple(() => ({
      "label": faker.lorem.words(),
    }))),
    "groups": faker.helpers.maybe(() => faker.helpers.multiple(() => ({
      "entries": faker.helpers.multiple(() => ({
      "code": faker.lorem.words(),
    })),
    }))),
    "deep": faker.helpers.maybe(() => ({
      "inner": {
      "note": faker.lorem.words(),
    },
    })),
    "wrapped": MockWrapper(() => ({
      "title": faker.lorem.words(),
    })),
  };
  return { ...result, ...overrides };
}

/**
 * @param {import("../src/input").Slot} [overrides]
 * @returns {import("../src/input").Slot}
 */
export function MockSlot(overrides) {
  const result = faker.helpers.arrayElement(["primary", "secondary"]);
  return overrides ?? result;
}

/**
 * @template T
 * @param {() => T} [mockT=() => ({})]
 * @param {Partial<import("../src/input").Wrapper<T>>} [overrides={}]
 * @returns {import("../src/input").Wrapper<T>}
 */
export function MockWrapper(mockT = () => ({}), overrides = {}) {
  const result = {
    "value": mockT(),
  };
  return { ...result, ...overrides };
}
