import { afterEach, describe, expect, test } from "vitest";
import {
  formatDriftReport,
  loadConfig,
  renderMocks,
  renderMocksFromSourceText,
} from "../src/index";
import type { GenerateMocksResult, ResolvedTypemockrConfig } from "../src/index";
import { createLegacyRegistry } from "../src/core/registry";
import { inferExpressionScalar } from "../src/core/report";
import { compileFixture, createFixtureProject, generateFixture } from "./helpers";

describe("mapping value tokens", () => {
  const cleanups: Array<() => Promise<void>> = [];

  afterEach(async () => {
    await Promise.all(cleanups.splice(0).map((cleanup) => cleanup()));
  });

  async function renderDriftFixture(
    overrides: Partial<ResolvedTypemockrConfig> = {},
  ): Promise<GenerateMocksResult> {
    const fixture = await createFixtureProject("drift");
    cleanups.push(fixture.cleanup);
    return renderMocks({ ...(await loadConfig(fixture.rootDir)), ...overrides });
  }

  function codeFor(result: GenerateMocksResult, suffix: string): string {
    const file = result.files.find((candidate) => candidate.outputFile.endsWith(suffix));
    if (!file) {
      throw new Error(`No generated file ending in ${suffix}.`);
    }
    return file.code;
  }

  test("derives a discriminator from the declaring file's own path", async () => {
    const result = await renderDriftFixture();

    // One `{sourceNamespace}` entry covers every declaration, at any nesting depth.
    expect(codeFor(result, "Store/Trailer.mock.ts")).toContain(
      '"$type": ("Acme.Api.Models.Store.Trailer") as Trailer["$type"],',
    );
    expect(codeFor(result, "Store/Order/PaymentPlan.mock.ts")).toContain(
      '"$type": ("Acme.Api.Models.Store.Order.PaymentPlan") as PaymentPlan["$type"],',
    );
    expect(codeFor(result, "ErrorInfo.mock.ts")).toContain(
      '"$type": ("Acme.Api.Models.ErrorInfo") as ErrorInfo["$type"],',
    );
  });

  test("a `source` glob scopes an entry to one part of the tree", async () => {
    const result = await renderDriftFixture();

    // `Ai/` is `AI` on the wire, so the earlier source-scoped entry wins over the derived one.
    expect(codeFor(result, "Ai/SearchRequest.mock.ts")).toContain(
      '"$type": ("Acme.Api.Models.AI.SearchRequest") as SearchRequest["$type"],',
    );
  });

  test("exposes the type name, directory and path of the declaration", async () => {
    const file = await renderMocksFromSourceText(
      "export interface Item { a: string; b: string; c: string; d: string }",
      {
        sourceFilePath: "src/Store/Order/Item.ts",
        baseDir: ["src"],
        registry: createLegacyRegistry({
          mappings: [
            { path: "*.a", value: '"{typeName}"' },
            { path: "*.b", value: '"{sourceDir}"' },
            { path: "*.c", value: '"{sourcePath}"' },
            { path: "*.d", value: '"{sourceNamespace}"' },
          ],
        }),
      },
    );

    expect(file.code).toContain('"a": ("Item") as Item["a"],');
    expect(file.code).toContain('"b": ("Store/Order") as Item["b"],');
    expect(file.code).toContain('"c": ("Store/Order/Item") as Item["c"],');
    expect(file.code).toContain('"d": ("Store.Order.Item") as Item["d"],');
  });

  test("a discriminator nothing resolves keeps the string default", async () => {
    const result = await renderDriftFixture({
      mappings: [{ type: "date", value: "faker.date.anytime()" }],
    });

    expect(codeFor(result, "ErrorInfo.mock.ts")).toContain('"$type": faker.lorem.words(),');
  });

  test("rejects a malformed `source` pattern and names the index", () => {
    expect(() =>
      createLegacyRegistry({ mappings: [{ source: 1, value: "x" }] as never }),
    ).toThrow("`mappings[0]`.source must be a source pattern string");
  });
});

describe("date values as ISO strings", () => {
  const cleanups: Array<() => Promise<void>> = [];

  afterEach(async () => {
    await Promise.all(cleanups.splice(0).map((cleanup) => cleanup()));
  });

  test("one type-level entry turns every Date field into an ISO string, and it compiles", async () => {
    const fixture = await createFixtureProject("drift");
    cleanups.push(fixture.cleanup);

    const result = await generateFixture(fixture.rootDir);
    const trailer = result.files.find((file) => file.outputFile.endsWith("Store/Trailer.mock.ts"));
    const plan = result.files.find((file) =>
      file.outputFile.endsWith("Store/Order/PaymentPlan.mock.ts"),
    );

    expect(trailer?.code).toContain(
      '"recordedOn": (faker.date.anytime().toISOString()) as unknown as Trailer["recordedOn"],',
    );
    // The element of a `Date[]` is a Date-typed position too, and gets the same treatment.
    expect(plan?.code).toContain(
      '(faker.date.anytime().toISOString()) as unknown as NonNullable<PaymentPlan["dueDates"]>[number]',
    );

    await compileFixture(fixture.rootDir);
  }, 120000);

  test("without `cast` the assertion stays direct, which is what a matching expression wants", async () => {
    const file = await renderMocksFromSourceText("export interface Item { at: Date }", {
      registry: createLegacyRegistry({
        mappings: [{ type: "date", value: "faker.date.anytime()" }],
      }),
    });

    expect(file.code).toContain('"at": (faker.date.anytime()) as Item["at"],');
  });

  test("rejects a `cast` value other than \"unknown\"", () => {
    expect(() =>
      createLegacyRegistry({ mappings: [{ value: "x", cast: "any" }] as never }),
    ).toThrow('`mappings[0]`.cast must be "unknown" when set');
  });
});

describe("drift report", () => {
  const cleanups: Array<() => Promise<void>> = [];

  afterEach(async () => {
    await Promise.all(cleanups.splice(0).map((cleanup) => cleanup()));
  });

  async function driftConfig(): Promise<ResolvedTypemockrConfig> {
    const fixture = await createFixtureProject("drift");
    cleanups.push(fixture.cleanup);
    return loadConfig(fixture.rootDir);
  }

  test("names mapping entries that matched nothing", async () => {
    const { report } = await renderMocks(await driftConfig());

    expect(report.deadMappings).toEqual([
      {
        index: 3,
        entry: { path: "*.neverPresent", type: "string", value: "faker.lorem.word()" },
      },
    ]);
    expect(formatDriftReport(report)).toContain(
      'mappings[3] path "*.neverPresent" type "string" -> faker.lorem.word()',
    );
  });

  test("groups fields that fell through to the type default by type", async () => {
    const { report } = await renderMocks(await driftConfig());

    expect(report.defaults).toEqual([
      { scalar: "number", paths: ["PaymentPlan.balance"] },
      { scalar: "string", paths: ["ErrorInfo.message", "SearchRequest.query", "Trailer.url"] },
    ]);
    expect(formatDriftReport(report)).toContain(
      "3 `string` fields fell through to the type default",
    );
  });

  test("a discriminator nothing resolves is reported as a fall-through", async () => {
    const { report } = await renderMocks({
      ...(await driftConfig()),
      mappings: [{ type: "date", value: "faker.date.anytime()" }],
    });

    expect(
      report.defaults.find((group) => group.scalar === "string")?.paths,
    ).toContain("ErrorInfo.$type");
  });

  test("a generator of the wrong type stops the run", async () => {
    await expect(
      renderMocks({
        ...(await driftConfig()),
        mappings: [{ path: "*.balance", type: "number", value: "faker.lorem.words()" }],
      }),
    ).rejects.toThrow(
      /PaymentPlan\.balance is `number` but `faker\.lorem\.words\(\)` generates `string`/,
    );
  });

  test('`cast: "unknown"` marks a deviation as deliberate instead of a mismatch', async () => {
    const { report } = await renderMocks({
      ...(await driftConfig()),
      mappings: [
        { path: "*.balance", type: "number", value: "faker.lorem.words()", cast: "unknown" },
      ],
    });

    expect(report.mismatches).toEqual([]);
  });

  test("measures what an expression produces rather than reading its name", () => {
    expect(inferExpressionScalar("faker.lorem.words()")).toBe("string");
    expect(inferExpressionScalar('"USD"')).toBe("string");
    expect(inferExpressionScalar("faker.date.anytime().toISOString()")).toBe("string");
    expect(inferExpressionScalar("faker.date.anytime()")).toBe("date");
    expect(inferExpressionScalar("faker.number.float({ min: 1 })")).toBe("number");
    expect(inferExpressionScalar("faker.datatype.boolean()")).toBe("boolean");

    // Neither the namespace nor the method name gives these away.
    expect(inferExpressionScalar("faker.location.latitude()")).toBe("number");
    expect(inferExpressionScalar("faker.date.month()")).toBe("string");
    expect(inferExpressionScalar("faker.commerce.price()")).toBe("string");

    // Anything we cannot measure must stay silent rather than fail a build.
    expect(inferExpressionScalar("MockMoney().amount")).toBeUndefined();
    expect(inferExpressionScalar("faker.helpers.multiple(() => 1)")).toBeUndefined();
    expect(inferExpressionScalar("faker.lorem.words(")).toBeUndefined();
  });
});
