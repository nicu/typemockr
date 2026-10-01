import { faker } from "@faker-js/faker";
import type { Coded, Entity, Genre, Publisher } from "../src/input";

export function MockCoded(overrides: Partial<Coded> = {}): Coded {
  const result = {
    "code": faker.lorem.words(),
  };
  return { ...result, ...overrides };
}

export function MockEntity(overrides: Partial<Entity> = {}): Entity {
  const result = {
    "id": faker.lorem.words(),
  };
  return { ...result, ...overrides };
}

export function MockGenre(overrides: Partial<Genre> = {}): Genre {
  const result = {
    "label": faker.lorem.words(),
    "code": faker.lorem.words(),
  };
  return { ...result, ...overrides };
}

export function MockPublisher(overrides: Partial<Publisher> = {}): Publisher {
  const result = {
    "name": faker.lorem.words(),
    "id": faker.lorem.words(),
  };
  return { ...result, ...overrides };
}
