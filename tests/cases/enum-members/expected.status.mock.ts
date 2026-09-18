import { faker } from "@faker-js/faker";
import type { Priority, Status } from "../src/status";

export function MockPriority(overrides?: Priority): Priority {
  const result: Priority = faker.helpers.arrayElement([0 as const, 1 as const]) as Priority;
  return overrides ?? result;
}

export function MockStatus(overrides?: Status): Status {
  const result: Status = faker.helpers.arrayElement(["Active" as const, "Pending" as const, "on-hold" as const]) as Status;
  return overrides ?? result;
}
