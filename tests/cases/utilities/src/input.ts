export interface User {
  id: string;
  name: string;
  email?: string;
}

export type UserPick = Pick<User, "id" | "name">;
export type UserOmit = Omit<User, "email">;
export type UserPartial = Partial<User>;
export type UserRequired = Required<User>;
export type UserReadonly = Readonly<User>;
export type UserRecord = Record<string, string>;
