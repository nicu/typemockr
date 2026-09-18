export interface Person {
  id: string;
  age: number;
  email?: string;
  nickname: string;
  tags: string[];
  birthday: Date;
  $type: string;
}
