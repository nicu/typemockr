import { faker } from "@faker-js/faker";

/**
 * @param {Partial<import("../src/input").BaseClass>} [overrides={}]
 * @returns {import("../src/input").BaseClass}
 */
export function MockBaseClass(overrides = {}) {
  const result = {
    "id": faker.lorem.words(),
  };
  return { ...result, ...overrides };
}

/**
 * @param {Partial<import("../src/input").BaseInterface>} [overrides={}]
 * @returns {import("../src/input").BaseInterface}
 */
export function MockBaseInterface(overrides = {}) {
  const result = {
    "code": faker.lorem.words(),
  };
  return { ...result, ...overrides };
}

/**
 * @param {Partial<import("../src/input").ChildClass>} [overrides={}]
 * @returns {import("../src/input").ChildClass}
 */
export function MockChildClass(overrides = {}) {
  const result = {
    "name": faker.lorem.words(),
    "id": faker.lorem.words(),
  };
  return { ...result, ...overrides };
}

/**
 * @param {Partial<import("../src/input").ChildInterface>} [overrides={}]
 * @returns {import("../src/input").ChildInterface}
 */
export function MockChildInterface(overrides = {}) {
  const result = {
    "label": faker.lorem.words(),
    "code": faker.lorem.words(),
  };
  return { ...result, ...overrides };
}
