export class BaseClass {
  id!: string;
}

export class ChildClass extends BaseClass {
  name!: string;
}

export interface BaseInterface {
  code: string;
}

export interface ChildInterface extends BaseInterface {
  label: string;
}
