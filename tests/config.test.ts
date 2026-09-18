import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { loadConfig, renderMocks, renderMocksFromSourceText, resolveConfig } from "../src/index";
import {
  compileFixture,
  createFixtureProject,
  generateFixture,
} from "./helpers";

describe("config loading", () => {
  const cleanups: Array<() => Promise<void>> = [];

  afterEach(async () => {
    await Promise.all(cleanups.splice(0).map((cleanup) => cleanup()));
  });

  async function tempDir() {
    const dir = await mkdtemp(join(tmpdir(), "typemockr-config-"));
    cleanups.push(() => rm(dir, { recursive: true, force: true }));
    return dir;
  }

  test("finds typemockr.json when no config path is given", async () => {
    const fixture = await createFixtureProject("legacy-json");
    cleanups.push(fixture.cleanup);

    const config = await loadConfig(fixture.rootDir);
    expect(config.configFile).toBe(join(fixture.rootDir, "typemockr.json"));
  });

  test("loads an explicit config path relative to the project root", async () => {
    const fixture = await createFixtureProject("declarations");
    cleanups.push(fixture.cleanup);

    const config = await loadConfig(fixture.rootDir, "typemockr.api.json");
    expect(config.configFile).toBe(join(fixture.rootDir, "typemockr.api.json"));
    expect(config.mockName).toBe("MockApi{dir}{name}");
  });

  test("fails on unknown keys and names the config file", async () => {
    const dir = await tempDir();
    await writeFile(
      join(dir, "typemockr.json"),
      JSON.stringify({ include: ["src/**/*.ts"], outDir: "$mock", mappingProvidr: "x.js", prefix: "Api" }),
    );

    await expect(loadConfig(dir)).rejects.toThrow(
      /Invalid typemockr config .*typemockr\.json: Unknown config keys `mappingProvidr`, `prefix`\. Supported keys:/,
    );
  });

  test("reports missing required keys instead of a generic export error", async () => {
    const dir = await tempDir();
    await writeFile(join(dir, "typemockr.json"), JSON.stringify({ include: ["src/**/*.ts"] }));

    await expect(loadConfig(dir)).rejects.toThrow("`outDir` is required");
  });

  test("fails when an explicit config path does not exist", async () => {
    const dir = await tempDir();
    await expect(loadConfig(dir, "nope.json")).rejects.toThrow(/nope\.json does not exist/);
  });

  test("validates option types", () => {
    const base = { include: ["a.ts"], outDir: "out", projectRootDir: "/tmp" };
    expect(() => resolveConfig({ ...base, format: "mjs" as "ts" })).toThrow("`format`");
    expect(() => resolveConfig({ ...base, mappingProvider: 1 as unknown as string })).toThrow(
      "`mappingProvider` must be a path string",
    );
    expect(() => resolveConfig({ ...base, mockName: "Api" })).toThrow('containing "{name}"');
    expect(() => resolveConfig({ ...base, mappings: "x" as unknown as Record<string, string> })).toThrow(
      "`mappings` must be an object or an array of mapping entries",
    );
    // The array form is the type-scoped shape, so it must not be rejected as a config value.
    expect(resolveConfig({ ...base, mappings: [{ path: "*.id", value: "1" }] }).mappings).toEqual([
      { path: "*.id", value: "1" },
    ]);
    expect(resolveConfig({ ...base, $schema: "x" } as typeof base).include).toEqual(["a.ts"]);
  });
});

describe("mappingProvider and mappings", () => {
  const cleanups: Array<() => Promise<void>> = [];

  afterEach(async () => {
    await Promise.all(cleanups.splice(0).map((cleanup) => cleanup()));
  });

  test("applies the provider first, then inline mappings of either shape, and the output compiles", async () => {
    const fixture = await createFixtureProject("legacy-mappings");
    cleanups.push(fixture.cleanup);

    const result = await generateFixture(fixture.rootDir);
    const code = result.files[0]?.code ?? "";

    expect(code).toContain('"id": (faker.string.uuid()) as Person["id"],');
    expect(code).toContain('"email": (faker.internet.email()) as Person["email"],');
    // The provider receives { sourceFile, entityName }.
    expect(code).toContain('"$type": ("Acme.Person") as Person["$type"],');
    // { expression: [patterns] } and { pattern: expression } shapes.
    expect(code).toContain('"age": (faker.number.int({ min: 18, max: 99 })) as Person["age"],');
    expect(code).toContain('"nickname": (faker.person.firstName()) as Person["nickname"],');
    // Unmapped values keep the defaults.
    expect(code).toContain('"birthday": faker.date.recent(),');

    await compileFixture(fixture.rootDir);
  });

  test("a registry wins over mappingProvider for the same path", async () => {
    const fixture = await createFixtureProject("legacy-mappings");
    cleanups.push(fixture.cleanup);
    await writeFile(
      join(fixture.rootDir, "registry.js"),
      'export default { values: { "Person.id": \'"fixed-id"\' } };',
    );

    const config = await loadConfig(fixture.rootDir);
    const result = await renderMocks({ ...config, registryFile: join(fixture.rootDir, "registry.js") });
    const code = result.files[0]?.code ?? "";

    expect(code).toContain('"id": ("fixed-id") as Person["id"],');
    expect(code).toContain('"email": (faker.internet.email()) as Person["email"],');
  });

  test("passes the scalar type and only calls the provider for scalar leaves", async () => {
    const calls: Array<[string, string]> = [];
    const file = await renderMocksFromSourceText(
      [
        "export enum Kind { A = 'a' }",
        "export interface Item { name: string; count: number; kind: Kind; list: string[]; nested: { flag: boolean } }",
      ].join("\n"),
      {
        registry: (await import("../src/core/registry")).createLegacyRegistry({
          mappingProvider: (type, path) => {
            calls.push([type, path]);
            return undefined;
          },
        }),
      },
    );

    expect(file.code).toContain("export function MockItem");
    expect(calls).toEqual([
      ["string", "Item.name"],
      ["number", "Item.count"],
      ["string", "Item.list[]"],
      ["boolean", "Item.nested.flag"],
    ]);
  });

  test("array mappings only apply to entries whose `type` matches the scalar", async () => {
    const { createLegacyRegistry } = await import("../src/core/registry");
    const file = await renderMocksFromSourceText(
      [
        "export interface Item {",
        "  cost: number;",
        "  label: string;",
        "  itemValue: string;",
        "  amountValue: number;",
        "}",
      ].join("\n"),
      {
        registry: createLegacyRegistry({
          mappings: [
            // The same `*value` pattern resolves differently per scalar type.
            { path: "*value", type: "string", value: "faker.commerce.productName()" },
            { path: "*value", type: "number", value: "faker.number.float()" },
            { path: "*.cost", type: "string", value: "NEVER_MATCHES" },
          ],
        }),
      },
    );

    expect(file.code).toContain('"itemValue": (faker.commerce.productName()) as Item["itemValue"],');
    expect(file.code).toContain('"amountValue": (faker.number.float()) as Item["amountValue"],');
    // A string-only entry must not claim a number field...
    expect(file.code).toContain('"cost": faker.number.int(),');
    // ...and an unmatched field keeps the built-in default for its scalar.
    expect(file.code).toContain('"label": faker.lorem.words(),');
  });

  test("a `type` entry with no `path` is a per-type fallback, and `type` accepts a list", async () => {
    const { createLegacyRegistry } = await import("../src/core/registry");
    const file = await renderMocksFromSourceText(
      "export interface Item { createdAt: Date; loose: any; vague: unknown; name: string }",
      {
        registry: createLegacyRegistry({
          mappings: [
            { path: "*.name", value: "faker.person.fullName()" },
            { type: "date", value: "faker.date.anytime()" },
            { type: ["any", "unknown"], value: "faker.lorem.words()" },
          ],
        }),
      },
    );

    expect(file.code).toContain('"createdAt": (faker.date.anytime()) as Item["createdAt"],');
    expect(file.code).toContain('"loose": (faker.lorem.words()) as Item["loose"],');
    expect(file.code).toContain('"vague": (faker.lorem.words()) as Item["vague"],');
    // An entry with no `type` still matches any scalar, as the object form does.
    expect(file.code).toContain('"name": (faker.person.fullName()) as Item["name"],');
  });

  test("rejects malformed array mapping entries and names the index", async () => {
    const { createLegacyRegistry } = await import("../src/core/registry");
    const compile = (mappings: unknown) =>
      createLegacyRegistry({ mappings: mappings as never });

    expect(() => compile([{ path: "*.id" }])).toThrow(
      "`mappings[0]`.value must be a non-empty expression string",
    );
    expect(() => compile([{ value: "x" }, { path: 1, value: "y" }])).toThrow(
      "`mappings[1]`.path must be a path pattern string",
    );
    expect(() => compile([{ type: "datetime", value: "x" }])).toThrow(
      "`mappings[0]`.type must be one or more of string, number, bigint, boolean, date, any, unknown",
    );
    expect(() => compile(["*.id"])).toThrow(
      "`mappings[0]` must be an object with a `value` expression",
    );
  });

  test("fails loudly when the provider file is missing or exports no function", async () => {
    const fixture = await createFixtureProject("legacy-mappings");
    cleanups.push(fixture.cleanup);
    const config = await loadConfig(fixture.rootDir);

    await expect(
      renderMocks({ ...config, mappingProviderFile: join(fixture.rootDir, "missing.js") }),
    ).rejects.toThrow(/missing\.js does not exist/);

    await writeFile(join(fixture.rootDir, "empty.js"), "export const mappings = [];");
    await expect(
      renderMocks({ ...config, mappingProviderFile: join(fixture.rootDir, "empty.js") }),
    ).rejects.toThrow(/must export a `mappingProvider\(type, path, context\)` function/);
  });

  test("fails loudly when the registry module has no registry", async () => {
    const fixture = await createFixtureProject("legacy-json");
    cleanups.push(fixture.cleanup);
    await writeFile(join(fixture.rootDir, "registry.js"), "export const nothing = 1;");
    const config = await loadConfig(fixture.rootDir);

    await expect(
      renderMocks({ ...config, registryFile: join(fixture.rootDir, "registry.js") }),
    ).rejects.toThrow(/must export a registry/);
  });
});
