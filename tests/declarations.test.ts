import { cp, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { generateMocks, loadConfig, renderMocks } from "../src/index";
import { compileFixture, createFixtureProject, type FixtureProject } from "./helpers";
import type { GeneratedFile } from "../src/core/types";

describe(".d.ts input from an installed package", () => {
  let fixture: FixtureProject;
  let apiFiles: GeneratedFile[];

  const file = (suffix: string) => {
    const match = apiFiles.find((entry) => entry.outputFile.endsWith(suffix));
    if (!match) {
      throw new Error(`No output ending with ${suffix}`);
    }
    return match.code;
  };

  beforeAll(async () => {
    fixture = await createFixtureProject("declarations");
    // Fixture packages are stored outside node_modules so they are committed.
    await cp(join(fixture.rootDir, "packages"), join(fixture.rootDir, "node_modules"), {
      recursive: true,
    });

    await generateMocks(await loadConfig(fixture.rootDir));
    apiFiles = (await generateMocks(await loadConfig(fixture.rootDir, "typemockr.api.json"))).files;
  });

  afterAll(async () => {
    await fixture.cleanup();
  });

  test("generates one mock per declaration file, named without the .d suffix", () => {
    expect(apiFiles.map((entry) => entry.outputFile.slice(fixture.rootDir.length)).sort()).toEqual([
      "/$mock/api/Admin/GiftCard.mock.ts",
      "/$mock/api/Store/GiftCard.mock.ts",
      "/$mock/api/Store/CardStatus.mock.ts",
      "/$mock/api/index.mock.ts",
    ]);
  });

  test("imports types by package name", () => {
    expect(file("Store/GiftCard.mock.ts")).toContain(
      'import type { GiftCard, Origin } from "@acme/models/lib/Store/GiftCard";',
    );
    expect(file("Store/GiftCard.mock.ts")).toContain(
      'import type { CardStatus } from "@acme/models/lib/Store/CardStatus";',
    );
    // The package `types` entry is imported by the bare package name.
    expect(file("api/index.mock.ts")).toContain('import type { Money } from "@acme/models";');
  });

  test("applies the mockName template with {dir} to exports and cross-file imports", () => {
    const store = file("Store/GiftCard.mock.ts");
    expect(store).toContain("export function MockApiStoreGiftCard(");
    expect(store).toContain('import { MockApiMoney } from "../index.mock";');
    expect(store).toContain('import { MockApiStoreCardStatus } from "./CardStatus.mock";');
    expect(file("Admin/GiftCard.mock.ts")).toContain("export function MockApiAdminGiftCard(");
  });

  test("keeps enum typing for optional and partial enums", () => {
    const store = file("Store/GiftCard.mock.ts");
    expect(store).toContain('"status": MockApiStoreCardStatus(),');
    expect(store).toContain('"previousStatus": faker.helpers.maybe(() => MockApiStoreCardStatus()),');
    expect(store).toContain(
      '"openStatus": faker.helpers.arrayElement(["Active" as CardStatus.Active, "Suspended" as CardStatus.Suspended]),',
    );
    // Top-level declarations in a module .d.ts are implicitly exported, so they get mocks too.
    expect(store).toContain('"origin": faker.helpers.maybe(() => MockApiStoreOrigin()),');
    expect(store).not.toContain("$type");
  });

  test("casts classes with private members", () => {
    expect(file("Admin/GiftCard.mock.ts")).toContain(
      "return { ...result, ...overrides } as GiftCard;",
    );
  });

  test("both sources compile together in one project without name collisions", async () => {
    await compileFixture(fixture.rootDir);
  });

  test("fails when a .ts and a .d.ts file map to the same mock file", async () => {
    await writeFile(join(fixture.rootDir, "src", "models.d.ts"), "export interface Other { a: string }");
    const config = await loadConfig(fixture.rootDir);

    await expect(renderMocks({ ...config, include: ["src/models.ts", "src/models.d.ts"] })).rejects.toThrow(
      /would both generate .*models\.mock\.ts/,
    );
  });
});
