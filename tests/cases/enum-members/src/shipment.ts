import { OrderStatus, Priority } from "./status";

enum Warehouse {
  North = "north",
  South = "south",
}

export interface Shipment {
  status: OrderStatus;
  optionalStatus?: OrderStatus;
  nullableStatus: OrderStatus | null;
  statuses?: OrderStatus[];
  openStatus: OrderStatus.Shipped | OrderStatus.Pending;
  fixedStatus: OrderStatus.Shipped;
  anyNotShipped: Exclude<OrderStatus, OrderStatus.Shipped>;
  optionalPriority?: Priority;
  lowPriority: Priority.Low;
  warehouse?: Warehouse;
}
