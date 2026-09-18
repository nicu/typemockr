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
    expect(() => resolveConfig({ ...base, mappings: [] as unknown as Record<string, string> })).toThrow(
      "`mappings` must be an object",
    );
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
