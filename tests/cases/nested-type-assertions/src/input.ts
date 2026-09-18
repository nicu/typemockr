export type Slot = "primary" | "secondary";

export interface Wrapper<T> {
  value: T;
}

export interface Listing {
  required: Record<Slot, string>;
  optional?: Record<Slot, string>;
  items: Array<{ label: string }>;
  optionalItems?: Array<{ label: string }>;
  groups?: Array<{ entries: Array<{ code: string }> }>;
  deep?: { inner: { note: string } };
  wrapped: Wrapper<{ title: string }>;
}
