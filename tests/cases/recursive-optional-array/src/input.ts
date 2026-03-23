export interface DepartmentListItem {
  id: string;
  subdepartments?: Array<DepartmentListItem> | null;
}
