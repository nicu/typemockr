import { faker } from "@faker-js/faker";
import type { OrderStatus, Priority } from "../src/status";

export function MockOrderStatus(overrides?: OrderStatus): OrderStatus {
  const result: OrderStatus = faker.helpers.arrayElement(["Shipped" as const, "Pending" as const, "on-hold" as const]) as OrderStatus;
  return overrides ?? result;
}

export function MockPriority(overrides?: Priority): Priority {
  const result: Priority = faker.helpers.arrayElement([0 as const, 1 as const]) as Priority;
  return overrides ?? result;
}
