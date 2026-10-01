import { faker } from "@faker-js/faker";
import type { Shipment } from "../src/shipment";
import type { OrderStatus, Priority } from "../src/status";
import { MockOrderStatus, MockPriority } from "./status.mock";

export function MockShipment(overrides: Partial<Shipment> = {}): Shipment {
  const result = {
    "status": MockOrderStatus(),
    "optionalStatus": faker.helpers.maybe(() => MockOrderStatus()),
    "nullableStatus": faker.helpers.arrayElement([null, MockOrderStatus()]),
    "statuses": faker.helpers.maybe(() => faker.helpers.multiple(() => MockOrderStatus())),
    "openStatus": faker.helpers.arrayElement(["Shipped" as OrderStatus.Shipped, "Pending" as OrderStatus.Pending]),
    "fixedStatus": faker.helpers.arrayElement(["Shipped" as OrderStatus.Shipped]),
    "anyNotShipped": faker.helpers.arrayElement(["Pending" as OrderStatus.Pending, "on-hold" as (typeof OrderStatus)["on-hold"]]),
    "optionalPriority": faker.helpers.maybe(() => MockPriority()),
    "lowPriority": faker.helpers.arrayElement([0 as Priority.Low]),
    "warehouse": faker.helpers.maybe(() => faker.helpers.arrayElement(["north" as never, "south" as never])),
  };
  return { ...result, ...overrides };
}
