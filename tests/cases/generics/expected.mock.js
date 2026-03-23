import { faker } from "@faker-js/faker";

/**
 * @template T
 * @param {() => T} [mockT=() => ({})]
 * @param {Partial<import("../src/input").BaseTest<T>>} [overrides={}]
 * @returns {import("../src/input").BaseTest<T>}
 */
export function MockBaseTest(mockT = () => ({}), overrides = {}) {
  const result = {
    "payload": mockT(),
    "items": faker.helpers.multiple(() => mockT()),
  };
  return { ...result, ...overrides };
}

/**
 * @template T
 * @param {() => T} [mockT=() => ({})]
 * @param {Partial<import("../src/input").Box<T>>} [overrides={}]
 * @returns {import("../src/input").Box<T>}
 */
export function MockBox(mockT = () => ({}), overrides = {}) {
  const result = {
    "value": mockT(),
  };
  return { ...result, ...overrides };
}

/**
 * @param {Partial<import("../src/input").SomeUseCase>} [overrides={}]
 * @returns {import("../src/input").SomeUseCase}
 */
export function MockSomeUseCase(overrides = {}) {
  const result = {
    "id": faker.lorem.words(),
  };
  return { ...result, ...overrides };
}

/**
 * @param {Partial<import("../src/input").Test>} [overrides={}]
 * @returns {import("../src/input").Test}
 */
export function MockTest(overrides = {}) {
  const result = {
    "box": MockBox(() => MockSomeUseCase()),
    "payload": MockSomeUseCase(),
    "items": faker.helpers.multiple(() => MockSomeUseCase()),
  };
  return { ...result, ...overrides };
}

/**
 * @template T
 * @param {() => T} [mockT=() => ({})]
 * @param {Partial<import("../src/input").Wrapper<T>>} [overrides={}]
 * @returns {import("../src/input").Wrapper<T>}
 */
export function MockWrapper(mockT = () => ({}), overrides = {}) {
  const result = {
    "item": mockT(),
    "box": MockBox(() => mockT()),
  };
  return { ...result, ...overrides };
}
