import { faker } from "@faker-js/faker";

/**
 * @param {Partial<import("../src/input").Coded>} [overrides={}]
 * @returns {import("../src/input").Coded}
 */
export function MockCoded(overrides = {}) {
  const result = {
    "code": faker.lorem.words(),
  };
  return { ...result, ...overrides };
}

/**
 * @param {Partial<import("../src/input").Entity>} [overrides={}]
 * @returns {import("../src/input").Entity}
 */
export function MockEntity(overrides = {}) {
  const result = {
    "id": faker.lorem.words(),
  };
  return { ...result, ...overrides };
}

/**
 * @param {Partial<import("../src/input").Genre>} [overrides={}]
 * @returns {import("../src/input").Genre}
 */
export function MockGenre(overrides = {}) {
  const result = {
    "label": faker.lorem.words(),
    "code": faker.lorem.words(),
  };
  return { ...result, ...overrides };
}

/**
 * @param {Partial<import("../src/input").Publisher>} [overrides={}]
 * @returns {import("../src/input").Publisher}
 */
export function MockPublisher(overrides = {}) {
  const result = {
    "name": faker.lorem.words(),
    "id": faker.lorem.words(),
  };
  return { ...result, ...overrides };
}
