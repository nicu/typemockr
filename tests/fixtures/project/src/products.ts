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

export const FeedOperation = {
  BulkEnrollment: 0,
} as const;
export type FeedOperation = (typeof FeedOperation)[keyof typeof FeedOperation];

export const Channel = {
  Email: 0,
  Sms: 1,
} as const;
export type Channel = (typeof Channel)[keyof typeof Channel];

export interface IngestRequest {
  partnerKey?: string | null;
  operation?: FeedOperation;
  channel?: Channel;
  kind: "ingest";
  version: 2;
}
