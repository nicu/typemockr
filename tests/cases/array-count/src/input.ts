export interface Book {
  title: string;
}

export interface Shelf {
  books: Book[];
  labels: string[];
  children?: Shelf[];
}
