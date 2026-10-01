export interface Customer {
  id: string;
  name: string;
  email?: string;
}

export type CustomerPick = Pick<Customer, "id" | "name">;
export type CustomerOmit = Omit<Customer, "email">;
export type CustomerPartial = Partial<Customer>;
export type CustomerRequired = Required<Customer>;
export type CustomerReadonly = Readonly<Customer>;
export type CustomerRecord = Record<string, string>;
