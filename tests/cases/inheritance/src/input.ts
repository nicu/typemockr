export class Entity {
  id!: string;
}

export class Publisher extends Entity {
  name!: string;
}

export interface Coded {
  code: string;
}

export interface Genre extends Coded {
  label: string;
}
