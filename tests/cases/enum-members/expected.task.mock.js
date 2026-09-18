import { faker } from "@faker-js/faker";
import { MockPriority, MockStatus } from "./status.mock.js";

/**
 * @param {Partial<import("../src/task").Task>} [overrides={}]
 * @returns {import("../src/task").Task}
 */
export function MockTask(overrides = {}) {
  const result = {
    "status": MockStatus(),
    "optionalStatus": faker.helpers.maybe(() => MockStatus()),
    "nullableStatus": faker.helpers.arrayElement([null, MockStatus()]),
    "statuses": faker.helpers.maybe(() => faker.helpers.multiple(() => MockStatus())),
    "openStatus": faker.helpers.arrayElement(["Active", "Pending"]),
    "fixedStatus": faker.helpers.arrayElement(["Active"]),
    "anyNonActive": faker.helpers.arrayElement(["Pending", "on-hold"]),
    "optionalPriority": faker.helpers.maybe(() => MockPriority()),
    "lowPriority": faker.helpers.arrayElement([0]),
    "internal": faker.helpers.maybe(() => faker.helpers.arrayElement(["a", "b"])),
  };
  return { ...result, ...overrides };
}
