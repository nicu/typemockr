import { faker } from "@faker-js/faker";
import type { BaseTest, Box, SomeUseCase, Test, Wrapper } from "../src/input";

export function MockBaseTest<T = any>(mockT: () => T = () => ({} as T), overrides: Partial<BaseTest<T>> = {}): BaseTest<T> {
  const result = {
    "payload": mockT(),
    "items": faker.helpers.multiple(() => mockT()),
  };
  return { ...result, ...overrides };
}

export function MockBox<T = any>(mockT: () => T = () => ({} as T), overrides: Partial<Box<T>> = {}): Box<T> {
  const result = {
    "value": mockT(),
  };
  return { ...result, ...overrides };
}

export function MockSomeUseCase(overrides: Partial<SomeUseCase> = {}): SomeUseCase {
  const result = {
    "id": faker.lorem.words(),
  };
  return { ...result, ...overrides };
}

export function MockTest(overrides: Partial<Test> = {}): Test {
  const result = {
    "box": MockBox(() => MockSomeUseCase()),
    "payload": MockSomeUseCase(),
    "items": faker.helpers.multiple(() => MockSomeUseCase()),
  };
  return { ...result, ...overrides };
}

export function MockWrapper<T = any>(mockT: () => T = () => ({} as T), overrides: Partial<Wrapper<T>> = {}): Wrapper<T> {
  const result = {
    "item": mockT(),
    "box": MockBox(() => mockT()),
  };
  return { ...result, ...overrides };
}
