import { faker } from "@faker-js/faker";

/**
 * @param {Partial<import("../src/input").BookListing>} [overrides={}]
 * @returns {import("../src/input").BookListing}
 */
export function MockBookListing(overrides = {}) {
  const result = {
    "required": {
      "front": faker.lorem.words(),
      "back": faker.lorem.words(),
    },
    "optional": faker.helpers.maybe(() => ({
      "front": faker.lorem.words(),
      "back": faker.lorem.words(),
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
 * @param {import("../src/input").CoverSide} [overrides]
 * @returns {import("../src/input").CoverSide}
 */
export function MockCoverSide(overrides) {
  const result = faker.helpers.arrayElement(["front", "back"]);
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
