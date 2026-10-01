import { afterAll, beforeAll, describe, expect, test } from "vitest";
import {
  compileFixture,
  createFixtureProject,
  generateFixture,
  importBuiltModule,
  type FixtureProject,
} from "./helpers";

describe("generated mocks", () => {
  let fixture: FixtureProject;
  let customersModule: {
    MockCustomer: (
      overrides?: Partial<{ name: string; email: string }>,
    ) => { name: string; email: string };
  };
  let productsModule: {
    MockProduct: () => { name: string };
    MockBundle: <T = unknown>(
      mockT?: () => T,
      overrides?: Partial<{ value: T }>,
    ) => { value: T };
    MockCategory: (
      overrides?: unknown,
      options?: { depth?: number; maxDepth?: number },
    ) => { children: Array<{ children?: unknown }> };
  };
  let ordersModule: {
    MockOrder: (overrides?: Partial<{
      note: string;
      customer: { name: string; email: string };
    }>) => {
      note?: string;
      status: string;
      customer: { name: string; email: string };
      product: unknown;
    };
  };

  beforeAll(async () => {
    fixture = await createFixtureProject();
    await generateFixture(fixture.rootDir);
    await compileFixture(fixture.rootDir);

    customersModule = await importBuiltModule(fixture.rootDir, "$mock/customers.mock.js");
    productsModule = await importBuiltModule(fixture.rootDir, "$mock/products.mock.js");
    ordersModule = await importBuiltModule(fixture.rootDir, "$mock/orders.mock.js");
  });

  afterAll(async () => {
    await fixture.cleanup();
  });

  test("uses the custom compile-time registry value before the default generator", () => {
    expect(customersModule.MockCustomer().name).toBe("Ada Lovelace");
    expect(productsModule.MockProduct().name).not.toBe("Ada Lovelace");
  });

  test("applies cross-field rules in the generated function body", () => {
    const order = ordersModule.MockOrder();
    expect(order.status).toBe("declined");
    expect(order.note).toBe("Payment declined");
  });

  test("lets explicit caller overrides win over rules", () => {
    const order = ordersModule.MockOrder({ note: "Ring the bell" });
    expect(order.note).toBe("Ring the bell");
  });

  test("supports nested overrides by passing nested mock builders", () => {
    const order = ordersModule.MockOrder({
      customer: customersModule.MockCustomer({
        name: "Grace Hopper",
      }),
    });

    expect(order.customer.name).toBe("Grace Hopper");
    expect(order.customer.email).toBeTruthy();
    expect(order.product).toBeTruthy();
  });

  test("supports the legacy positional generic mock callbacks", () => {
    const bundle = productsModule.MockBundle(() => 42);

    expect(bundle.value).toBe(42);
  });

  test("caps recursive expansion with maxDepth", () => {
    const category = productsModule.MockCategory(undefined, { maxDepth: 1 });
    expect(Array.isArray(category.children)).toBe(true);
    expect(category.children[0]?.children).toEqual([]);
  });
});
