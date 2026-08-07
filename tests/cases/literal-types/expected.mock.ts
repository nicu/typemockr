import { faker } from "@faker-js/faker";
import type { ImportOperation, Channel, ImportRequest, Level } from "../src/input";

export function MockImportOperation(overrides?: ImportOperation): ImportOperation {
  const result: ImportOperation = 0 as ImportOperation;
  return overrides ?? result;
}

export function MockChannel(overrides?: Channel): Channel {
  const result: Channel = faker.helpers.arrayElement([0 as const, 1 as const]) as Channel;
  return overrides ?? result;
}

export function MockImportRequest(overrides: Partial<ImportRequest> = {}): ImportRequest {
  const result = {
    "supplierKey": faker.helpers.maybe(() => faker.lorem.words()),
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
