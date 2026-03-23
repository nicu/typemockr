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
    expect(ordersFile?.code).toContain("MockPerson");
    expect(ordersFile?.code).toContain("MockProduct");
  });

  test("renders exact generated code in memory and supports legacy json config", async () => {
    const fixture = await createFixtureProject("legacy-json");
    cleanups.push(fixture.cleanup);

    const result = await renderFixture(fixture.rootDir);
    expect(result.files).toHaveLength(1);
    expect(result.files[0]?.outputFile.endsWith("person.mock.ts")).toBe(true);
    expect(result.files[0]?.code.trim()).toBe(
      [
        'import { faker } from "@faker-js/faker";',
        'import type { Person } from "../src/person";',
        "",
        "export function MockPerson(overrides: Partial<Person> = {}): Person {",
        "  const result = {",
        '    "name": faker.lorem.words(),',
        "  };",
        "  return { ...result, ...overrides };",
        "}",
      ].join("\n"),
    );
  });
});
