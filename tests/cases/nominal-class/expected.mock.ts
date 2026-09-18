import { faker } from "@faker-js/faker";
import type { Account, Admin, Plain } from "../src/input";

export function MockAccount(overrides: Partial<Account> = {}): Account {
  const result = {
    "id": faker.lorem.words(),
  };
  return { ...result, ...overrides } as Account;
}

export function MockAdmin(overrides: Partial<Admin> = {}): Admin {
  const result = {
    "level": faker.number.int(),
    "id": faker.lorem.words(),
  };
  return { ...result, ...overrides } as Admin;
}

export function MockPlain(overrides: Partial<Plain> = {}): Plain {
  const result = {
    "name": faker.lorem.words(),
  };
  return { ...result, ...overrides };
}
