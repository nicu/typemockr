export interface Product {
  id: string;
  name: string;
  sku: string;
  price: number;
}

export type ProductSummary = Omit<Product, "sku">;

export type ProductNames = Record<"primary" | "secondary", string>;

export type Settings = Required<
  Readonly<{
    enabled?: boolean;
    title?: string;
  }>
>;
