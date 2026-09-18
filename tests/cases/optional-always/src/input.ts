export interface Contact {
  phone: string;
  email?: string;
}

export interface Preorder {
  id: string;
  reference?: string;
  quantity?: number;
  cancelledAt?: Date;
  contact?: Contact;
  inline?: { note?: string; kind: string };
  tags?: string[];
}
