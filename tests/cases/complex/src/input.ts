export interface Product {
  id: string;
}

export interface Order {
  status: Product | "draft";
  items: Product[];
  moreItems: Array<Product>;
  metadata: Record<string, Product>;
  address: {
    name: string;
    number: string;
    zip: string;
  };
}
