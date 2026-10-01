import { faker } from "@faker-js/faker";
import type { Account, Genre, StaffAccount } from "../src/input";

export function MockAccount(overrides: Partial<Account> = {}): Account {
  const result = {
    "id": faker.lorem.words(),
  };
  return { ...result, ...overrides } as Account;
}

export function MockGenre(overrides: Partial<Genre> = {}): Genre {
  const result = {
    "name": faker.lorem.words(),
  };
  return { ...result, ...overrides };
}

export function MockStaffAccount(overrides: Partial<StaffAccount> = {}): StaffAccount {
  const result = {
    "level": faker.number.int(),
    "id": faker.lorem.words(),
  };
  return { ...result, ...overrides } as StaffAccount;
}
