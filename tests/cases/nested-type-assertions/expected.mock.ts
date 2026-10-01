import { faker } from "@faker-js/faker";
import type { BookListing, CoverSide, Wrapper } from "../src/input";

export function MockBookListing(overrides: Partial<BookListing> = {}): BookListing {
  const result = {
    "required": {
      "front": (faker.lorem.words()) as NonNullable<BookListing["required"]>["front"],
      "back": faker.lorem.words(),
    },
    "optional": faker.helpers.maybe(() => ({
      "front": (faker.lorem.words()) as NonNullable<BookListing["optional"]>["front"],
      "back": faker.lorem.words(),
    })),
    "items": faker.helpers.multiple(() => ({
      "label": (faker.lorem.words()) as NonNullable<NonNullable<BookListing["items"]>[number]>["label"],
    })),
    "optionalItems": faker.helpers.maybe(() => faker.helpers.multiple(() => ({
      "label": (faker.lorem.words()) as NonNullable<NonNullable<BookListing["optionalItems"]>[number]>["label"],
    }))),
    "groups": faker.helpers.maybe(() => faker.helpers.multiple(() => ({
      "entries": faker.helpers.multiple(() => ({
      "code": (faker.lorem.words()) as NonNullable<NonNullable<NonNullable<NonNullable<BookListing["groups"]>[number]>["entries"]>[number]>["code"],
    })),
    }))),
    "deep": faker.helpers.maybe(() => ({
      "inner": {
      "note": (faker.lorem.words()) as NonNullable<NonNullable<BookListing["deep"]>["inner"]>["note"],
    },
    })),
    "wrapped": MockWrapper(() => ({
      "title": faker.lorem.words(),
    })),
  };
  return { ...result, ...overrides };
}

export function MockCoverSide(overrides?: CoverSide): CoverSide {
  const result: CoverSide = faker.helpers.arrayElement(["front" as const, "back" as const]) as CoverSide;
  return overrides ?? result;
}

export function MockWrapper<T = any>(mockT: () => T = () => ({} as T), overrides: Partial<Wrapper<T>> = {}): Wrapper<T> {
  const result = {
    "value": mockT(),
  };
  return { ...result, ...overrides };
}
