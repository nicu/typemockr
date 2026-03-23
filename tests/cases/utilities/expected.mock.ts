import { faker } from "@faker-js/faker";
import type { User, UserOmit, UserPartial, UserPick, UserReadonly, UserRecord, UserRequired } from "../src/input";

export function MockUser(overrides: Partial<User> = {}): User {
  const result = {
    "id": faker.lorem.words(),
    "name": faker.lorem.words(),
    "email": faker.helpers.maybe(() => faker.lorem.words()),
  };
  return { ...result, ...overrides };
}

export function MockUserOmit(overrides: Partial<UserOmit> = {}): UserOmit {
  const result = {
    "id": faker.lorem.words(),
    "name": faker.lorem.words(),
  };
  return { ...result, ...overrides };
}

export function MockUserPartial(overrides: Partial<UserPartial> = {}): UserPartial {
  const result = {
    "id": faker.helpers.maybe(() => faker.lorem.words()),
    "name": faker.helpers.maybe(() => faker.lorem.words()),
    "email": faker.helpers.maybe(() => faker.lorem.words()),
  };
  return { ...result, ...overrides };
}

export function MockUserPick(overrides: Partial<UserPick> = {}): UserPick {
  const result = {
    "id": faker.lorem.words(),
    "name": faker.lorem.words(),
  };
  return { ...result, ...overrides };
}

export function MockUserReadonly(overrides: Partial<UserReadonly> = {}): UserReadonly {
  const result = {
    "id": faker.lorem.words(),
    "name": faker.lorem.words(),
    "email": faker.helpers.maybe(() => faker.lorem.words()),
  };
  return { ...result, ...overrides };
}

export function MockUserRecord(overrides: Partial<UserRecord> = {}): UserRecord {
  const result = {};
  return { ...result, ...overrides };
}

export function MockUserRequired(overrides: Partial<UserRequired> = {}): UserRequired {
  const result = {
    "id": faker.lorem.words(),
    "name": faker.lorem.words(),
    "email": faker.lorem.words(),
  };
  return { ...result, ...overrides };
}
