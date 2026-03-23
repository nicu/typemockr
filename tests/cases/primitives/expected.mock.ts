import { faker } from "@faker-js/faker";
import type { PrimitiveBag } from "../src/input";

export function MockPrimitiveBag(overrides: Partial<PrimitiveBag> = {}): PrimitiveBag {
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
