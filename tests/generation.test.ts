import { afterEach, describe, expect, test } from "vitest";
import {
  createFixtureProject,
  generateFixture,
  loadFixtureConfig,
  renderFixture,
} from "./helpers";

describe("generateMocks", () => {
  const cleanups: Array<() => Promise<void>> = [];

  afterEach(async () => {
    await Promise.all(cleanups.splice(0).map((cleanup) => cleanup()));
  });

  test("loads the TS config and emits one mock file per source file", async () => {
    const fixture = await createFixtureProject();
    cleanups.push(fixture.cleanup);

    const config = await loadFixtureConfig(fixture.rootDir);
    expect(config.registryFile).toContain("typemockr.registry.ts");

    const result = await generateFixture(fixture.rootDir);
    expect(result.files).toHaveLength(4);

    const ordersFile = result.files.find((file) => file.outputFile.endsWith("orders.mock.ts"));
    expect(ordersFile?.code).toContain('import { faker } from "@faker-js/faker";');
    expect(ordersFile?.code).not.toContain("__typemockrRegistry");
    expect(ordersFile?.code).toContain("export function MockOrder");
    expect(ordersFile?.code).toContain("MockCustomer");
    expect(ordersFile?.code).toContain("MockProduct");
  });

  test("renders exact generated code in memory and supports legacy json config", async () => {
    const fixture = await createFixtureProject("legacy-json");
    cleanups.push(fixture.cleanup);

    const result = await renderFixture(fixture.rootDir);
    expect(result.files).toHaveLength(1);
    expect(result.files[0]?.outputFile.endsWith("customer.mock.ts")).toBe(true);
    expect(result.files[0]?.code.trim()).toBe(
      [
        'import { faker } from "@faker-js/faker";',
        'import type { Customer } from "../src/customer";',
        "",
        "export function MockCustomer(overrides: Partial<Customer> = {}): Customer {",
        "  const result = {",
        '    "name": faker.lorem.words(),',
        "  };",
        "  return { ...result, ...overrides };",
        "}",
      ].join("\n"),
    );
  });
});

describe("mockName", () => {
  test("supports a function and renames exports and references", async () => {
    const { renderMocksFromSourceText } = await import("../src/index");
    const file = await renderMocksFromSourceText(
      "export interface Author { name: string }\nexport interface Book { author: Author }",
      {
        sourceFilePath: "src/catalog/book-models/input.ts",
        mockName: ({ name, dir }) => `build${dir}${name}`,
      },
    );

    expect(file.code).toContain("export function buildCatalogBookModelsAuthor(");
    expect(file.code).toContain('"author": buildCatalogBookModelsAuthor(),');
  });

  test("rejects names that are not identifiers or not unique within a file", async () => {
    const { renderMocksFromSourceText } = await import("../src/index");
    await expect(
      renderMocksFromSourceText("export interface A { v: string }", { mockName: "Mock-{name}" }),
    ).rejects.toThrow(/not a valid identifier/);
    await expect(
      renderMocksFromSourceText("export interface A { v: string }\nexport interface B { v: string }", {
        mockName: () => "MockSame",
      }),
    ).rejects.toThrow(/more than one type/);
  });
});
