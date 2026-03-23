export interface CategoryListItem {
  id: string;
  subcategories?: Array<CategoryListItem> | null;
}
