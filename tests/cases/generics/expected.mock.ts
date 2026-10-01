import { faker } from "@faker-js/faker";
import type { ApiResponse, Author, AuthorResponse, Box, Wrapper } from "../src/input";

export function MockApiResponse<T = any>(mockT: () => T = () => ({} as T), overrides: Partial<ApiResponse<T>> = {}): ApiResponse<T> {
  const result = {
    "payload": mockT(),
    "items": faker.helpers.multiple(() => mockT()),
  };
  return { ...result, ...overrides };
}

export function MockAuthor(overrides: Partial<Author> = {}): Author {
  const result = {
    "id": faker.lorem.words(),
  };
  return { ...result, ...overrides };
}

export function MockAuthorResponse(overrides: Partial<AuthorResponse> = {}): AuthorResponse {
  const result = {
    "box": MockBox(() => MockAuthor()),
    "payload": MockAuthor(),
    "items": faker.helpers.multiple(() => MockAuthor()),
  };
  return { ...result, ...overrides };
}

export function MockBox<T = any>(mockT: () => T = () => ({} as T), overrides: Partial<Box<T>> = {}): Box<T> {
  const result = {
    "value": mockT(),
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
