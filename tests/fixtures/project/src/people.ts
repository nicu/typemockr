export enum Status {
  Active = "active",
  Error = "error",
}

export interface Person {
  id: string;
  name: string;
  email: string;
  status: Status;
  favoriteColor?: string;
}

export type PersonPreview = Pick<Person, "id" | "name">;

export interface Box<T> {
  value: T;
  metadata?: Partial<Record<"label" | "slug", string>>;
}

export interface Tree {
  id: string;
  name: string;
  children: Tree[];
}
