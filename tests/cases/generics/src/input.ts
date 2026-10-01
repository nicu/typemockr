export interface Box<T> {
  value: T;
}

export class Author {
  id!: string;
}

export class ApiResponse<T> {
  payload!: T;
  items!: Array<T>;
}

export interface Wrapper<T> {
  item: T;
  box: Box<T>;
}

export class AuthorResponse extends ApiResponse<Author> {
  box!: Box<Author>;
}
