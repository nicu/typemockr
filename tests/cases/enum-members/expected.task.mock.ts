import { faker } from "@faker-js/faker";
import type { Task } from "../src/task";
import type { Priority, Status } from "../src/status";
import { MockPriority, MockStatus } from "./status.mock";

export function MockTask(overrides: Partial<Task> = {}): Task {
  const result = {
    "status": MockStatus(),
    "optionalStatus": faker.helpers.maybe(() => MockStatus()),
    "nullableStatus": faker.helpers.arrayElement([null, MockStatus()]),
    "statuses": faker.helpers.maybe(() => faker.helpers.multiple(() => MockStatus())),
    "openStatus": faker.helpers.arrayElement(["Active" as Status.Active, "Pending" as Status.Pending]),
    "fixedStatus": faker.helpers.arrayElement(["Active" as Status.Active]),
    "anyNonActive": faker.helpers.arrayElement(["Pending" as Status.Pending, "on-hold" as (typeof Status)["on-hold"]]),
    "optionalPriority": faker.helpers.maybe(() => MockPriority()),
    "lowPriority": faker.helpers.arrayElement([0 as Priority.Low]),
    "internal": faker.helpers.maybe(() => faker.helpers.arrayElement(["a" as never, "b" as never])),
  };
  return { ...result, ...overrides };
}
