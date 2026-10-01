export class Account {
  private secret = "";
  protected token = "";
  #hidden = 0;
  id = "";
  constructor(private readonly apiKey: string) {}
}

export class StaffAccount extends Account {
  level = 0;
}

export class Genre {
  name = "";
}
