import { faker } from "@faker-js/faker";

/**
 * @param {import("../src/input").MetadataKey} [overrides]
 * @returns {import("../src/input").MetadataKey}
 */
export function MockMetadataKey(overrides) {
  const result = faker.helpers.arrayElement(["name", "link"]);
  return overrides ?? result;
}

/**
 * @param {Partial<import("../src/input").Product>} [overrides={}]
 * @returns {import("../src/input").Product}
 */
export function MockProduct(overrides = {}) {
  const result = {
    "metadata": {
      "name": faker.lorem.words(),
      "link": faker.lorem.words(),
    },
  };
  return { ...result, ...overrides };
}
