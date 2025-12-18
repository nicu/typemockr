// Test file to verify array of reference types generation
export interface ProductVariant {
  id: string;
  name: string;
  price: number;
}

export interface ProductRequest {
  productId: string;
  variants: Array<ProductVariant>;
}
