import type { Customer, Product } from "./models";

export interface Order {
  customer: Customer;
  product: Product;
  children: Order[];
}
