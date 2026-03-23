export interface FileNode {
  id: string;
  name: string;
  parent?: Folder;
}

export interface Folder {
  id: string;
  name: string;
  children: Array<FileNode | Folder>;
}
