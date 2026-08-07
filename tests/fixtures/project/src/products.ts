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

export const ImportOperation = {
  BulkProductImport: 0,
} as const;
export type ImportOperation = (typeof ImportOperation)[keyof typeof ImportOperation];

export const Channel = {
  Email: 0,
  Sms: 1,
} as const;
export type Channel = (typeof Channel)[keyof typeof Channel];

export interface ImportRequest {
  supplierKey?: string | null;
  operation?: ImportOperation;
  channel?: Channel;
  kind: "import";
  version: 2;
}
