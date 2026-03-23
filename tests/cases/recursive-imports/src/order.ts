import type { Person, Product } from "./models";

export interface Order {
  person: Person;
  product: Product;
  children: Order[];
}
