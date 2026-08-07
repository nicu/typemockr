import { faker } from "@faker-js/faker";
import type { BrandFeedOperationType, Channel, IngestRequest, Level } from "../src/input";

export function MockBrandFeedOperationType(overrides?: BrandFeedOperationType): BrandFeedOperationType {
  const result: BrandFeedOperationType = 0 as BrandFeedOperationType;
  return overrides ?? result;
}

export function MockChannel(overrides?: Channel): Channel {
  const result: Channel = faker.helpers.arrayElement([0 as const, 1 as const]) as Channel;
  return overrides ?? result;
}

export function MockIngestRequest(overrides: Partial<IngestRequest> = {}): IngestRequest {
  const result = {
    "partnerKey": faker.helpers.maybe(() => faker.lorem.words()),
    "operation": faker.helpers.maybe(() => 0 as const),
    "channel": faker.helpers.maybe(() => faker.helpers.arrayElement([0 as const, 1 as const])),
    "level": MockLevel(),
    "version": 2 as const,
    "enabled": true as const,
  };
  return { ...result, ...overrides };
}

export function MockLevel(overrides?: Level): Level {
  const result: Level = faker.helpers.arrayElement(["low" as const, "high" as const]) as Level;
  return overrides ?? result;
}
