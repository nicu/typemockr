import { faker } from "@faker-js/faker";

/**
 * @template T
 * @param {() => T} [mockT=() => ({})]
 * @param {Partial<import("../src/input").ApiResponse<T>>} [overrides={}]
 * @returns {import("../src/input").ApiResponse<T>}
 */
export function MockApiResponse(mockT = () => ({}), overrides = {}) {
  const result = {
    "payload": mockT(),
    "items": faker.helpers.multiple(() => mockT()),
  };
  return { ...result, ...overrides };
}

/**
 * @param {Partial<import("../src/input").Author>} [overrides={}]
 * @returns {import("../src/input").Author}
 */
export function MockAuthor(overrides = {}) {
  const result = {
    "id": faker.lorem.words(),
  };
  return { ...result, ...overrides };
}

/**
 * @param {Partial<import("../src/input").AuthorResponse>} [overrides={}]
 * @returns {import("../src/input").AuthorResponse}
 */
export function MockAuthorResponse(overrides = {}) {
  const result = {
    "box": MockBox(() => MockAuthor()),
    "payload": MockAuthor(),
    "items": faker.helpers.multiple(() => MockAuthor()),
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
