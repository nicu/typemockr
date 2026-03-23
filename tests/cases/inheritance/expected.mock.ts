import { faker } from "@faker-js/faker";
import type { BaseClass, BaseInterface, ChildClass, ChildInterface } from "../src/input";

export function MockBaseClass(overrides: Partial<BaseClass> = {}): BaseClass {
  const result = {
    "id": faker.lorem.words(),
  };
  return { ...result, ...overrides };
}

export function MockBaseInterface(overrides: Partial<BaseInterface> = {}): BaseInterface {
  const result = {
    "code": faker.lorem.words(),
  };
  return { ...result, ...overrides };
}

export function MockChildClass(overrides: Partial<ChildClass> = {}): ChildClass {
  const result = {
    "name": faker.lorem.words(),
    "id": faker.lorem.words(),
  };
  return { ...result, ...overrides };
}

export function MockChildInterface(overrides: Partial<ChildInterface> = {}): ChildInterface {
  const result = {
    "label": faker.lorem.words(),
    "code": faker.lorem.words(),
  };
  return { ...result, ...overrides };
}
