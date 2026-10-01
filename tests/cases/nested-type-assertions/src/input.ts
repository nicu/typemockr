export type CoverSide = "front" | "back";

export interface Wrapper<T> {
  value: T;
}

export interface BookListing {
  required: Record<CoverSide, string>;
  optional?: Record<CoverSide, string>;
  items: Array<{ label: string }>;
  optionalItems?: Array<{ label: string }>;
  groups?: Array<{ entries: Array<{ code: string }> }>;
  deep?: { inner: { note: string } };
  wrapped: Wrapper<{ title: string }>;
}
