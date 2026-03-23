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
  let peopleModule: {
    MockPerson: (
      overrides?: Partial<{ name: string; email: string }>,
    ) => { name: string; email: string };
    MockBox: <T = unknown>(
      mockT?: () => T,
      overrides?: Partial<{ value: T }>,
    ) => { value: T };
    MockTree: (
      overrides?: unknown,
      options?: { depth?: number; maxDepth?: number },
    ) => { children: Array<{ children?: unknown }> };
  };
  let productsModule: {
    MockProduct: () => { name: string };
  };
  let ordersModule: {
    MockOrder: (overrides?: Partial<{
      color: string;
      person: { name: string; email: string };
    }>) => {
      color?: string;
      status: string;
      person: { name: string; email: string };
      product: unknown;
    };
  };

  beforeAll(async () => {
    fixture = await createFixtureProject();
    await generateFixture(fixture.rootDir);
    await compileFixture(fixture.rootDir);

    peopleModule = await importBuiltModule(fixture.rootDir, "$mock/people.mock.js");
    productsModule = await importBuiltModule(fixture.rootDir, "$mock/products.mock.js");
    ordersModule = await importBuiltModule(fixture.rootDir, "$mock/orders.mock.js");
  });

  afterAll(async () => {
    await fixture.cleanup();
  });

  test("uses the custom compile-time registry value before the default generator", () => {
    expect(peopleModule.MockPerson().name).toBe("Ada Lovelace");
    expect(productsModule.MockProduct().name).not.toBe("Ada Lovelace");
  });

  test("applies cross-field rules in the generated function body", () => {
    const order = ordersModule.MockOrder();
    expect(order.status).toBe("error");
    expect(order.color).toBe("red");
  });

  test("lets explicit caller overrides win over rules", () => {
    const order = ordersModule.MockOrder({ color: "green" });
    expect(order.color).toBe("green");
  });

  test("supports nested overrides by passing nested mock builders", () => {
    const order = ordersModule.MockOrder({
      person: peopleModule.MockPerson({
        name: "Grace Hopper",
      }),
    });

    expect(order.person.name).toBe("Grace Hopper");
    expect(order.person.email).toBeTruthy();
    expect(order.product).toBeTruthy();
  });

  test("supports the legacy positional generic mock callbacks", () => {
    const box = peopleModule.MockBox(() => 42);

    expect(box.value).toBe(42);
  });

  test("caps recursive expansion with maxDepth", () => {
    const tree = peopleModule.MockTree(undefined, { maxDepth: 1 });
    expect(Array.isArray(tree.children)).toBe(true);
    expect(tree.children[0]?.children).toEqual([]);
  });
});
