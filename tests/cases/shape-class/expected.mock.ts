import { faker } from "@faker-js/faker";
import type { User } from "../src/input";

export function MockUser(overrides: Partial<User> = {}): User {
  const result = {
    "name": faker.lorem.words(),
  };
  return { ...result, ...overrides };
}
