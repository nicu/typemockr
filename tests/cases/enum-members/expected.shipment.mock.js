import { faker } from "@faker-js/faker";
import { MockOrderStatus, MockPriority } from "./status.mock.js";

/**
 * @param {Partial<import("../src/shipment").Shipment>} [overrides={}]
 * @returns {import("../src/shipment").Shipment}
 */
export function MockShipment(overrides = {}) {
  const result = {
    "status": MockOrderStatus(),
    "optionalStatus": faker.helpers.maybe(() => MockOrderStatus()),
    "nullableStatus": faker.helpers.arrayElement([null, MockOrderStatus()]),
    "statuses": faker.helpers.maybe(() => faker.helpers.multiple(() => MockOrderStatus())),
    "openStatus": faker.helpers.arrayElement(["Shipped", "Pending"]),
    "fixedStatus": faker.helpers.arrayElement(["Shipped"]),
    "anyNotShipped": faker.helpers.arrayElement(["Pending", "on-hold"]),
    "optionalPriority": faker.helpers.maybe(() => MockPriority()),
    "lowPriority": faker.helpers.arrayElement([0]),
    "warehouse": faker.helpers.maybe(() => faker.helpers.arrayElement(["north", "south"])),
  };
  return { ...result, ...overrides };
}
