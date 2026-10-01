export interface MenuItem {
  id: string;
  name: string;
  parent?: Menu;
}

export interface Menu {
  id: string;
  name: string;
  children: Array<MenuItem | Menu>;
}
