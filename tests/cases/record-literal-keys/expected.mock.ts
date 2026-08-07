import { faker } from "@faker-js/faker";
import type { MetadataKey, Product } from "../src/input";

export function MockMetadataKey(overrides?: MetadataKey): MetadataKey {
  const result: MetadataKey = faker.helpers.arrayElement(["name" as const, "link" as const]) as MetadataKey;
  return overrides ?? result;
}

export function MockProduct(overrides: Partial<Product> = {}): Product {
  const result = {
    "metadata": {
      "name": faker.lorem.words(),
      "link": faker.lorem.words(),
    },
  };
  return { ...result, ...overrides };
}
