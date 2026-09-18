import { Priority, Status } from "./status";

enum Internal {
  A = "a",
  B = "b",
}

export interface Task {
  status: Status;
  optionalStatus?: Status;
  nullableStatus: Status | null;
  statuses?: Status[];
  openStatus: Status.Active | Status.Pending;
  fixedStatus: Status.Active;
  anyNonActive: Exclude<Status, Status.Active>;
  optionalPriority?: Priority;
  lowPriority: Priority.Low;
  internal?: Internal;
}
