export interface Leaf {
  name: string;
}

export interface Branch {
  leaves: Leaf[];
  labels: string[];
  children?: Branch[];
}
