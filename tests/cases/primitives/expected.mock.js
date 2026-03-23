import { faker } from "@faker-js/faker";

/**
 * @param {Partial<import("../src/input").PrimitiveBag>} [overrides={}]
 * @returns {import("../src/input").PrimitiveBag}
 */
export function MockPrimitiveBag(overrides = {}) {
  const result = {
    "text": faker.lorem.words(),
    "count": faker.number.int(),
    "enabled": faker.datatype.boolean(),
    "identifier": BigInt(faker.number.int()),
    "token": Symbol(faker.string.alphanumeric()),
    "createdAt": faker.date.recent(),
    "maybeNull": null,
    "maybeUndefined": undefined,
    "anything": {},
    "mystery": {},
  };
  return { ...result, ...overrides };
}
