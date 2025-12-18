// Test file to verify array of reference types generation
export interface AdminV2CatalogRequestProductVariantsInner {
  id: string;
  name: string;
  price: number;
}

export interface ProductRequest {
  productId: string;
  variants: Array<AdminV2CatalogRequestProductVariantsInner>;
}
