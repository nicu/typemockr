import { faker } from "@faker-js/faker";

/**
 * @param {import("../src/input").BrandFeedOperationType} [overrides]
 * @returns {import("../src/input").BrandFeedOperationType}
 */
export function MockBrandFeedOperationType(overrides) {
  const result = 0;
  return overrides ?? result;
}

/**
 * @param {import("../src/input").Channel} [overrides]
 * @returns {import("../src/input").Channel}
 */
export function MockChannel(overrides) {
  const result = faker.helpers.arrayElement([0, 1]);
  return overrides ?? result;
}

/**
 * @param {Partial<import("../src/input").IngestRequest>} [overrides={}]
 * @returns {import("../src/input").IngestRequest}
 */
export function MockIngestRequest(overrides = {}) {
  const result = {
    "partnerKey": faker.helpers.maybe(() => faker.lorem.words()),
    "operation": faker.helpers.maybe(() => 0),
    "channel": faker.helpers.maybe(() => faker.helpers.arrayElement([0, 1])),
    "level": MockLevel(),
    "version": 2,
    "enabled": true,
  };
  return { ...result, ...overrides };
}

/**
 * @param {import("../src/input").Level} [overrides]
 * @returns {import("../src/input").Level}
 */
export function MockLevel(overrides) {
  const result = faker.helpers.arrayElement(["low", "high"]);
  return overrides ?? result;
}
