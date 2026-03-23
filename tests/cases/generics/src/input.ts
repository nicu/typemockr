export interface Box<T> {
  value: T;
}

export class SomeUseCase {
  id!: string;
}

export class BaseTest<T> {
  payload!: T;
  items!: Array<T>;
}

export interface Wrapper<T> {
  item: T;
  box: Box<T>;
}

export class Test extends BaseTest<SomeUseCase> {
  box!: Box<SomeUseCase>;
}
