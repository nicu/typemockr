import { faker } from "@faker-js/faker";
import type { Customer, CustomerOmit, CustomerPartial, CustomerPick, CustomerReadonly, CustomerRecord, CustomerRequired } from "../src/input";

export function MockCustomer(overrides: Partial<Customer> = {}): Customer {
  const result = {
    "id": faker.lorem.words(),
    "name": faker.lorem.words(),
    "email": faker.helpers.maybe(() => faker.lorem.words()),
  };
  return { ...result, ...overrides };
}

export function MockCustomerOmit(overrides: Partial<CustomerOmit> = {}): CustomerOmit {
  const result = {
    "id": faker.lorem.words(),
    "name": faker.lorem.words(),
  };
  return { ...result, ...overrides };
}

export function MockCustomerPartial(overrides: Partial<CustomerPartial> = {}): CustomerPartial {
  const result = {
    "id": faker.helpers.maybe(() => faker.lorem.words()),
    "name": faker.helpers.maybe(() => faker.lorem.words()),
    "email": faker.helpers.maybe(() => faker.lorem.words()),
  };
  return { ...result, ...overrides };
}

export function MockCustomerPick(overrides: Partial<CustomerPick> = {}): CustomerPick {
  const result = {
    "id": faker.lorem.words(),
    "name": faker.lorem.words(),
  };
  return { ...result, ...overrides };
}

export function MockCustomerReadonly(overrides: Partial<CustomerReadonly> = {}): CustomerReadonly {
  const result = {
    "id": faker.lorem.words(),
    "name": faker.lorem.words(),
    "email": faker.helpers.maybe(() => faker.lorem.words()),
  };
  return { ...result, ...overrides };
}

export function MockCustomerRecord(overrides: Partial<CustomerRecord> = {}): CustomerRecord {
  const result = {};
  return { ...result, ...overrides };
}

export function MockCustomerRequired(overrides: Partial<CustomerRequired> = {}): CustomerRequired {
  const result = {
    "id": faker.lorem.words(),
    "name": faker.lorem.words(),
    "email": faker.lorem.words(),
  };
  return { ...result, ...overrides };
}
