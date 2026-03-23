export type MetadataKey = "name" | "link";

export interface Product {
  metadata: Record<MetadataKey, string>;
}
