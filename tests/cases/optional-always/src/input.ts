export interface Contact {
  phone: string;
  email?: string;
}

export interface Booking {
  id: string;
  reference?: string;
  seatCount?: number;
  cancelledAt?: Date;
  contact?: Contact;
  inline?: { note?: string; kind: string };
  tags?: string[];
}
