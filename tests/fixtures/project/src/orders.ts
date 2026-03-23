import type { Box, Person, Status } from "./people";
import type { Product, Settings } from "./products";

export interface Order {
  id: string;
  person: Person;
  product: Product;
  packaging: Box<Product>;
  catalog: Record<string, Product>;
  status: Status | "draft";
  color?: string;
  settings: Settings;
}
