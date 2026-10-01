export enum PaymentStatus {
  Paid = "paid",
  Declined = "declined",
}

export interface Customer {
  id: string;
  name: string;
  email: string;
  paymentStatus: PaymentStatus;
  favoriteGenre?: string;
}

export type CustomerPreview = Pick<Customer, "id" | "name">;
