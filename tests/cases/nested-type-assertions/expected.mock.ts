import { faker } from "@faker-js/faker";
import type { Listing, Slot, Wrapper } from "../src/input";

export function MockListing(overrides: Partial<Listing> = {}): Listing {
  const result = {
    "required": {
      "primary": (faker.lorem.words()) as NonNullable<Listing["required"]>["primary"],
      "secondary": faker.lorem.words(),
    },
    "optional": faker.helpers.maybe(() => ({
      "primary": (faker.lorem.words()) as NonNullable<Listing["optional"]>["primary"],
      "secondary": faker.lorem.words(),
    })),
    "items": faker.helpers.multiple(() => ({
      "label": (faker.lorem.words()) as NonNullable<NonNullable<Listing["items"]>[number]>["label"],
    })),
    "optionalItems": faker.helpers.maybe(() => faker.helpers.multiple(() => ({
      "label": (faker.lorem.words()) as NonNullable<NonNullable<Listing["optionalItems"]>[number]>["label"],
    }))),
    "groups": faker.helpers.maybe(() => faker.helpers.multiple(() => ({
      "entries": faker.helpers.multiple(() => ({
      "code": (faker.lorem.words()) as NonNullable<NonNullable<NonNullable<NonNullable<Listing["groups"]>[number]>["entries"]>[number]>["code"],
    })),
    }))),
    "deep": faker.helpers.maybe(() => ({
      "inner": {
      "note": (faker.lorem.words()) as NonNullable<NonNullable<Listing["deep"]>["inner"]>["note"],
    },
    })),
    "wrapped": MockWrapper(() => ({
      "title": faker.lorem.words(),
    })),
  };
  return { ...result, ...overrides };
}

export function MockSlot(overrides?: Slot): Slot {
  const result: Slot = faker.helpers.arrayElement(["primary" as const, "secondary" as const]) as Slot;
  return overrides ?? result;
}

export function MockWrapper<T = any>(mockT: () => T = () => ({} as T), overrides: Partial<Wrapper<T>> = {}): Wrapper<T> {
  const result = {
    "value": mockT(),
  };
  return { ...result, ...overrides };
}
