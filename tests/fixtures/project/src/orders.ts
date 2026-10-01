import type { Customer, PaymentStatus } from "./customers";
import type { Bundle, Product, Settings } from "./products";

export interface Order {
  id: string;
  customer: Customer;
  product: Product;
  giftBundle: Bundle<Product>;
  catalog: Record<string, Product>;
  status: PaymentStatus | "draft";
  note?: string;
  settings: Settings;
}
