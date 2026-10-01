import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import { beforeAll, describe, expect, test } from "vitest";
import { createWalker, formatDrift, groupDrift, walk } from "../src/index";
import type { Walker } from "../src/index";
import { ensurePackageBuilt, REPO_ROOT } from "./helpers";

const CONFIG = resolve(REPO_ROOT, "tests/fixtures/walk/typemockr.json");
const MODEL = "Store/Book/DetailsResponse";

function details(overrides: Record<string, unknown> = {}) {
  return {
    product: {
      $type: "Acme.Api.Models.Store.Book.BookProduct",
      name: "The Silent Orchard",
      price: 24,
      author: "Jane Doe",
      publishedOn: "2026-05-01T00:00:00",
      status: 1,
    },
    editions: [
      { $type: "Acme.Api.Models.Store.Book.Edition", name: "Hardcover 1st", kind: "Hardcover", pages: 320 },
      { $type: "Acme.Api.Models.Store.Book.Edition", name: "Paperback 2nd", kind: "Paperback", pages: 352 },
    ],
    alt: null,
    payload: { anything: [1, "two"] },
    updatedAt: "2026-01-02T03:04:05Z",
    history: ["2026-01-01", "2026-01-02"],
    ...overrides,
  };
}

describe("walk", () => {
  let walker: Walker;

  beforeAll(async () => {
    walker = await createWalker({ config: CONFIG });
  });

  const leafAt = (result: ReturnType<Walker["walk"]>, path: string) =>
    result.leaves.find((leaf) => leaf.path === path);

  test("a clean response has no drift apart from systemic string dates", () => {
    const result = walker.walk(MODEL, details());

    expect(result.drift).toEqual([
      { path: "product.publishedOn", kind: "string-for-date", modelPath: "BookProduct.publishedOn", expected: "Date", actual: "string" },
      { path: "updatedAt", kind: "string-for-date", modelPath: "DetailsResponse.updatedAt", expected: "Date", actual: "string" },
      { path: "history[0]", kind: "string-for-date", modelPath: "DetailsResponse.history[]", expected: "Date", actual: "string" },
    ]);
  });

  test("resolves `$type` to the declared subclass and reports inherited props under it", () => {
    const result = walker.walk(MODEL, details());

    expect(leafAt(result, "product.name")).toMatchObject({
      modelPath: "BookProduct.name",
      source: "Store/Book/BookProduct",
      kind: "string",
      value: "The Silent Orchard",
    });
    expect(leafAt(result, "product.author")?.modelPath).toBe("BookProduct.author");
  });

  test("falls back to the expected type for an unknown or unassignable `$type`", () => {
    const unknown = walker.walk(MODEL, details({ product: { $type: "Acme.Api.Models.Nope", name: "x", price: 1 } }));
    expect(unknown.drift).toContainEqual(
      expect.objectContaining({ kind: "unknown-discriminator", path: "product.$type", expected: "ProductBase", actual: "Acme.Api.Models.Nope" }),
    );
    expect(leafAt(unknown, "product.name")?.modelPath).toBe("ProductBase.name");

    const unrelated = walker.walk(MODEL, details({ product: { $type: "Acme.Api.Models.Other.Unrelated", name: "x", price: 1 } }));
    expect(unrelated.drift).toContainEqual(
      expect.objectContaining({ kind: "unknown-discriminator", actual: "Acme.Api.Models.Other.Unrelated (not assignable)" }),
    );
  });

  test("walks each array element with `[]` model paths", () => {
    const result = walker.walk(MODEL, details());

    expect(leafAt(result, "editions[1].pages")).toMatchObject({ modelPath: "Edition.pages", kind: "number", value: 352 });
    expect(leafAt(result, "history[1]")).toMatchObject({ modelPath: "DetailsResponse.history[]", kind: "date" });
  });

  test("enums: accepts members, reports numeric-vs-string and unknown members", () => {
    const ok = walker.walk(MODEL, details());
    expect(leafAt(ok, "product.status")).toMatchObject({ kind: "enum", enumName: "StockStatus", value: 1 });
    expect(leafAt(ok, "editions[0].kind")).toMatchObject({ kind: "enum", enumName: "EditionKind", value: "Hardcover" });

    const bad = walker.walk(MODEL, details({
      product: { ...details().product, status: "SoldOut" },
      editions: [{ name: "a", kind: "Scroll", pages: 1 }],
    }));
    const enumDrift = bad.drift.filter((entry) => entry.kind === "enum-mismatch");
    expect(enumDrift).toEqual([
      expect.objectContaining({ path: "product.status", expected: 'StockStatus (numeric; "SoldOut" is a member name)', actual: '"SoldOut"' }),
      expect.objectContaining({ path: "editions[0].kind", actual: '"Scroll"' }),
    ]);
  });

  test("optional, null, missing, mismatched and unmodelled properties", () => {
    const result = walker.walk(MODEL, details({
      note: null,
      alt: "text",
      editions: [{ name: "a", kind: "Hardcover", pages: "2", weight: 7 }],
      product: { $type: "Acme.Api.Models.Store.Book.BookProduct", name: "x", price: 1, author: "s", publishedOn: "2026-01-01", status: 0, tags: null },
      updatedAt: undefined,
    }));

    expect(result.drift).toEqual(expect.arrayContaining([
      { path: "note", kind: "null-for-optional", modelPath: "DetailsResponse.note", expected: "string", actual: "null" },
      { path: "product.tags", kind: "null-for-optional", modelPath: "BookProduct.tags", expected: "string[]", actual: "null" },
      { path: "editions[0].pages", kind: "type-mismatch", modelPath: "Edition.pages", expected: "number", actual: "string" },
      { path: "editions[0].weight", kind: "unmodelled", modelPath: "Edition.weight", actual: "number" },
      {
        path: "updatedAt",
        kind: "missing-required",
        modelPath: "DetailsResponse.updatedAt",
        expected: "Date",
        type: { kind: "date" },
        source: "Store/Book/DetailsResponse",
      },
    ]));
    expect(result.drift.some((entry) => entry.path === "alt")).toBe(false);
    expect(leafAt(result, "alt")).toMatchObject({ kind: "string", value: "text" });
    expect(walker.walk(MODEL, details()).leaves.find((leaf) => leaf.path === "alt")).toMatchObject({ kind: "null" });
  });

  test("`any` yields unknown leaves and no drift", () => {
    const result = walker.walk(MODEL, details());

    expect(leafAt(result, "payload.anything[1]")).toMatchObject({ kind: "unknown", value: "two", modelPath: "DetailsResponse.payload.anything[]" });
    expect(result.drift.some((entry) => entry.path.startsWith("payload"))).toBe(false);
  });

  test("names the mapping generation would use, with generation's precedence", () => {
    const result = walker.walk(MODEL, details({
      product: { $type: "Acme.Api.Models.Store.Magazine.MagazineProduct", name: "Quarterly Review", price: 1, issue: 12 },
    }));

    // `source` scoped entry wins for Store/Book/*; the general one covers the magazine.
    expect(leafAt(result, "editions[0].name")?.mapping).toEqual({
      value: '"edition name"', source: "Store/Book/*", path: "*.name", index: 0,
    });
    expect(leafAt(result, "product.name")).toMatchObject({
      modelPath: "MagazineProduct.name",
      mapping: { value: "faker.commerce.productName()", path: "*.name", index: 1 },
    });
    // Token interpolation comes from the same code as generation.
    expect(leafAt(result, "editions[0].$type")?.mapping?.value).toBe('"Acme.Api.Models.Store.Book.Edition"');
    expect(leafAt(result, "updatedAt")?.mapping).toMatchObject({ index: 3 });
    expect(leafAt(result, "editions[0].pages")?.mapping).toBeUndefined();
  });

  test("a mapped type over an enum reports its keys once", () => {
    const mismatched = walker.walk(MODEL, details({ policies: { "324": "a", "325": "b" } }));
    expect(mismatched.drift.filter((entry) => entry.path.startsWith("policies"))).toEqual([
      {
        path: "policies",
        kind: "key-mismatch",
        modelPath: "DetailsResponse.policies",
        expected: "keys of PolicyKind (3)",
        actual: '"324", "325"',
        note: "none declared",
      },
    ]);

    const partial = walker.walk(MODEL, details({ policies: { Payment: "p" }, flags: { a: true, c: 1 } }));
    expect(partial.drift.filter((entry) => entry.kind !== "string-for-date")).toEqual([
      {
        path: "policies",
        kind: "key-mismatch",
        modelPath: "DetailsResponse.policies",
        expected: "keys of PolicyKind (3)",
        actual: '"Payment"',
        note: "all valid, but only 1 of 3",
      },
      {
        path: "flags",
        kind: "key-mismatch",
        modelPath: "DetailsResponse.flags",
        expected: "2 declared keys",
        actual: '"a", "c"',
        note: "1 undeclared, 1 declared absent",
      },
    ]);
    expect(leafAt(partial, "policies.Payment")).toMatchObject({ kind: "string", value: "p" });
    expect(groupDrift(partial.drift, partial.seen).find((group) => group.example === "policies")?.message).toBe(
      'DetailsResponse.policies: keys differ from the model\'s (model keys of PolicyKind (3), JSON "Payment"); 1 of 1, at policies; all valid, but only 1 of 3',
    );

    const complete = walker.walk(MODEL, details({
      policies: { Returns: "c", Payment: "p", Shipping: "b" },
      partial: { name: "only" },
    }));
    expect(complete.drift.some((entry) => /^(policies|partial)/.test(entry.path))).toBe(false);
  });

  test("groups drift by kind and model path, with counts out of instances seen", () => {
    const result = walker.walk(MODEL, details({
      editions: [
        { $type: "c", name: "a", kind: "Hardcover", pages: 1, weight: 7 },
        { $type: "c", name: "b", kind: "Hardcover", weight: 8 },
        { $type: "c", name: "c", kind: "Hardcover", pages: "3" },
        { $type: "c", name: "d", kind: "Nope" },
      ],
      note: null,
    }));
    const groups = groupDrift(result.drift, result.seen);

    expect(groups.map((group) => [group.kind, group.modelPath, group.count, group.total, group.example])).toEqual([
      ["missing-required", "Edition.pages", 2, 4, "editions[1].pages"],
      ["unmodelled", "Edition.weight", 2, 4, "editions[0].weight"],
      ["type-mismatch", "Edition.pages", 1, 4, "editions[2].pages"],
      ["null-for-optional", "DetailsResponse.note", 1, 1, "note"],
      ["string-for-date", "BookProduct.publishedOn", 1, 1, "product.publishedOn"],
      ["string-for-date", "DetailsResponse.history[]", 1, 2, "history[0]"],
      ["string-for-date", "DetailsResponse.updatedAt", 1, 1, "updatedAt"],
      ["enum-mismatch", "Edition.kind", 1, 4, "editions[3].kind"],
      ["unknown-discriminator", "DetailsResponse.editions[]", 4, 4, "editions[0].$type"],
    ]);
    expect(groups.map((group) => group.message)).toEqual([
      "Edition.pages: required by the model (number), not in the JSON; 2 of 4, at editions[1].pages",
      "Edition.weight: in the JSON (number), not in the model; 2 of 4, at editions[0].weight",
      "Edition.pages: another type than the model says (model number, JSON string); 1 of 4, at editions[2].pages",
      "DetailsResponse.note: null where the model says optional (string); 1 of 1, at note",
      "BookProduct.publishedOn: the model says Date, the JSON has an ISO string; at product.publishedOn",
      "DetailsResponse.history[]: the model says Date, the JSON has an ISO string; at history[0]",
      "DetailsResponse.updatedAt: the model says Date, the JSON has an ISO string; at updatedAt",
      'Edition.kind: not a value of the model\'s enum (model EditionKind member ("Hardcover", "Paperback"), JSON "Nope"); 1 of 4, at editions[3].kind',
      "DetailsResponse.editions[]: $type c (no such model), expected Edition or a subclass; 4 of 4, at editions[0].$type",
    ]);
    expect(groups[0]).toMatchObject({ heading: "Required by the model, not in the JSON", detail: "number" });

    expect(formatDrift(result.drift, { seen: result.seen })).toBe(
      [
        "Required by the model, not in the JSON",
        "  Edition.pages  number  2 of 4  at editions[1].pages",
        "",
        "In the JSON, not in the model",
        "  Edition.weight  number  2 of 4  at editions[0].weight",
        "",
        "Another type than the model says",
        "  Edition.pages  model number, JSON string  1 of 4  at editions[2].pages",
        "",
        "null where the model says optional",
        "  DetailsResponse.note  string  1 of 1  at note",
        "",
        "The model says Date, the JSON has an ISO string",
        "  BookProduct.publishedOn    at product.publishedOn",
        "  DetailsResponse.history[]  at history[0]",
        "  DetailsResponse.updatedAt  at updatedAt",
        "",
        "Not a value of the model's enum",
        '  Edition.kind  model EditionKind member ("Hardcover", "Paperback"), JSON "Nope"  1 of 4  at editions[3].kind',
        "",
        "$type the model does not know",
        "  DetailsResponse.editions[]  $type c (no such model), expected Edition or a subclass  4 of 4  at editions[0].$type",
        "",
        "9 fields differ, 14 occurrences",
      ].join("\n"),
    );

    const all = formatDrift(result.drift, { all: true }).split("\n");
    expect(all).toHaveLength(result.drift.length + 2);
    expect(all).toContain("unmodelled  editions[1].weight  Edition.weight  got number");
    expect(all.at(-1)).toBe("9 fields differ, 14 occurrences");
    expect(groupDrift(result.drift)[0]!.message).toContain("not in the JSON; 2×, at");
    expect(formatDrift(result.drift.filter((entry) => entry.path === "editions[1].pages"))).toBe(
      "Required by the model, not in the JSON\n  Edition.pages  number  1×  at editions[1].pages\n\n1 field differs, 1 occurrence",
    );
    expect(formatDrift([])).toBe("");
  });

  test("an unmodelled field on an object without `$type` names the subclasses that declare it", () => {
    const none = walker.walk(MODEL, details({ product: { name: "x", price: 1, other: 1 } }));
    expect(none.drift.find((entry) => entry.kind === "unmodelled")?.note).toBe(
      "no $type; no subclass of ProductBase declares it either",
    );

    // `author` and `issue` point at different subclasses: neither is walked.
    const result = walker.walk(MODEL, details({ product: { name: "x", price: 1, author: "s", issue: 12, other: 1 } }));
    expect(result.inferred).toEqual([]);
    const notes = Object.fromEntries(
      result.drift.filter((entry) => entry.kind === "unmodelled").map((entry) => [entry.modelPath, entry.note]),
    );

    expect(notes).toEqual({
      "ProductBase.author": "no $type, and the keys fit no single subclass of ProductBase; BookProduct declares it",
      "ProductBase.issue": "no $type, and the keys fit no single subclass of ProductBase; MagazineProduct declares it",
      "ProductBase.other": "no $type; no subclass of ProductBase declares it either",
    });
    expect(groupDrift(result.drift, result.seen).find((group) => group.modelPath === "ProductBase.author")?.message).toBe(
      "ProductBase.author: in the JSON (string), not in the model; 1 of 1, at product.author; no $type, and the keys fit no single subclass of ProductBase; BookProduct declares it",
    );
    // With a `$type` the subclass is walked, and there is nothing to hint at.
    expect(walker.walk(MODEL, details({ extra: 1 })).drift.find((entry) => entry.kind === "unmodelled")).toEqual({
      path: "extra", kind: "unmodelled", modelPath: "DetailsResponse.extra", actual: "number",
    });
  });

  const giftCard = { displayName: "Gift", serialNumber: "A1", restrictions: { region: "EU" } };
  const paymentDrift = (result: ReturnType<Walker["walk"]>) =>
    result.drift.filter((entry) => entry.path.startsWith("payments"));

  test("without `$type`, walks the subclass whose fields the JSON's keys single out", () => {
    // Coupon declares `serialNumber` too, but not `restrictions`; PersonalizedGiftCard declares
    // both and nothing the JSON has beyond GiftCard, so the least derived wins.
    const result = walker.walk(MODEL, details({ payments: [giftCard, { displayName: "Bare" }] }));

    expect(paymentDrift(result)).toEqual([]);
    expect(result.inferred).toEqual([
      { path: "payments[0]", declared: "PaymentBase", type: "GiftCard", source: "Store/Payment/GiftCard", by: "keys" },
    ]);
    expect(leafAt(result, "payments[0].serialNumber")?.modelPath).toBe("GiftCard.serialNumber");
    expect(leafAt(result, "payments[1].displayName")?.modelPath).toBe("PaymentBase.displayName");

    const partial = walker.walk(MODEL, details({ payments: [{ displayName: "Gift", restrictions: {}, extra: 1 }] }));
    const note = "walked as GiftCard, inferred from its keys (no $type); the model declares PaymentBase";
    expect(paymentDrift(partial)).toEqual([
      {
        path: "payments[0].serialNumber",
        kind: "missing-required",
        modelPath: "GiftCard.serialNumber",
        expected: "string",
        note,
        type: { kind: "string" },
        source: "Store/Payment/GiftCard",
      },
      { path: "payments[0].extra", kind: "unmodelled", modelPath: "GiftCard.extra", actual: "number", note },
    ]);
    expect(groupDrift(partial.drift, partial.seen)[0]!.message).toBe(
      `GiftCard.serialNumber: required by the model (string), not in the JSON; 1 of 1, at payments[0].serialNumber; ${note}`,
    );
    // The note goes under its row, not on it.
    expect(formatDrift(paymentDrift(partial), { seen: partial.seen }).split("\n").slice(0, 3)).toEqual([
      "Required by the model, not in the JSON",
      "  GiftCard.serialNumber  string  1 of 1  at payments[0].serialNumber",
      `      ${note}`,
    ]);
  });

  test("an empty `$type` is reported, and the keys decide as if it were absent", () => {
    const result = walker.walk(MODEL, details({ payments: [{ $type: "", ...giftCard }] }));

    expect(paymentDrift(result)).toEqual([
      { path: "payments[0].$type", kind: "unknown-discriminator", modelPath: "DetailsResponse.payments[]", expected: "PaymentBase", actual: '""' },
    ]);
    expect(result.inferred.map((entry) => [entry.type, entry.by])).toEqual([["GiftCard", "keys"]]);
    expect(groupDrift(result.drift, result.seen).at(-1)!.message).toBe(
      'DetailsResponse.payments[]: $type "" (empty), expected PaymentBase or a subclass; 1 of 1, at payments[0].$type',
    );
  });

  test("keys that fit two unrelated subclasses equally stay on the declared type", () => {
    const result = walker.walk(MODEL, details({ payments: [{ displayName: "Gift", serialNumber: "A1" }] }));

    expect(result.inferred).toEqual([]);
    expect(paymentDrift(result)).toEqual([
      {
        path: "payments[0].serialNumber",
        kind: "unmodelled",
        modelPath: "PaymentBase.serialNumber",
        actual: "string",
        note: "no $type, and the keys fit no single subclass of PaymentBase; Coupon, GiftCard, PersonalizedGiftCard declare it",
      },
    ]);
  });

  test("absent required fields never select a subclass; a type hint does", () => {
    const input = details({ content: { descriptions: ["a"] }, payments: [giftCard] });
    const plain = walker.walk(MODEL, input);
    expect(plain.drift.some((entry) => entry.path.startsWith("content"))).toBe(false);
    expect(leafAt(plain, "content.descriptions[0]")?.modelPath).toBe("ContentBase.descriptions[]");

    const hinted = walker.walk(MODEL, input, { types: { content: "Store/Magazine/MagazineContent" } });
    expect(hinted.inferred).toContainEqual(
      { path: "content", declared: "ContentBase", type: "MagazineContent", source: "Store/Magazine/MagazineContent", by: "hint" },
    );
    const missing = groupDrift(hinted.drift, hinted.seen).filter((group) => group.kind === "missing-required");
    expect(missing.map((group) => [group.modelPath, group.type, group.source])).toEqual([
      ["MagazineContent.backIssues", { kind: "array", element: { kind: "object", name: "Edition", source: "Store/Book/Edition" } }, "Store/Magazine/MagazineContent"],
      ["MagazineContent.digital", { kind: "boolean" }, "Store/Magazine/MagazineContent"],
      ["MagazineContent.format", { kind: "enum", values: ["Hardcover", "Paperback"], name: "EditionKind", source: "Store/EditionKind" }, "Store/Magazine/MagazineContent"],
      ["MagazineContent.launchedOn", { kind: "date" }, "Store/Magazine/MagazineContent"],
      ["MagazineContent.rating", { kind: "number", nullable: true }, "Store/Magazine/MagazineContent"],
    ]);
    expect(missing[0]!.message).toBe(
      "MagazineContent.backIssues: required by the model (Edition[]), not in the JSON; 1 of 1, at content.backIssues; walked as MagazineContent by a type hint; the model declares ContentBase",
    );
    expect(hinted.drift.find((entry) => entry.path === "content.digital")?.type).toEqual({ kind: "boolean" });
  });

  test("a type hint overrides inference and `$type`, and must fit the declared type", async () => {
    // Walker-level hints apply to every walk; `[]` matches every index.
    const hinting = await createWalker({ config: CONFIG, types: { "payments[]": "Store/Payment/Coupon" } });
    const typed = { $type: "Acme.Api.Models.Store.Payment.GiftCard", ...giftCard };
    const result = hinting.walk(MODEL, details({ payments: [giftCard, typed] }));

    expect(result.inferred.map((entry) => [entry.path, entry.type, entry.by])).toEqual([
      ["payments[0]", "Coupon", "hint"],
      ["payments[1]", "Coupon", "hint"],
    ]);
    expect(paymentDrift(result).map((entry) => [entry.kind, entry.modelPath])).toEqual([
      ["missing-required", "Coupon.code"],
      ["unmodelled", "Coupon.restrictions"],
      ["missing-required", "Coupon.code"],
      ["unmodelled", "Coupon.restrictions"],
    ]);
    // A per-walk hint for the same path wins over the walker's.
    const pinned = hinting.walk(MODEL, details({ payments: [giftCard] }), {
      types: { "payments[]": "Store/Payment/PaymentBase" },
    });
    expect(pinned.inferred).toEqual([]);
    expect(paymentDrift(pinned).map((entry) => entry.modelPath)).toEqual(["PaymentBase.serialNumber", "PaymentBase.restrictions"]);

    expect(() => walker.walk(MODEL, details({ content: { descriptions: [] } }), { types: { content: "Store/Book/Edition" } })).toThrow(
      'Type hint for "content": Edition is not assignable to the declared ContentBase.',
    );
    expect(() => walker.walk(MODEL, details(), { types: { content: "Store/Nope" } })).toThrow(/No declarations/);
  });

  test("`walk()` accepts a config path and `path#Type` models", async () => {
    const result = await walk({ config: CONFIG, model: "Store/Book/Edition#Edition", input: { name: "a", kind: "Hardcover", pages: 1 } });

    expect(result.drift).toEqual([
      { path: "$type", kind: "missing-required", modelPath: "Edition.$type", expected: "string", type: { kind: "string" }, source: "Store/Book/Edition" },
    ]);
    await expect(walk({ config: CONFIG, model: "Store/Nope", input: {} })).rejects.toThrow(/No declarations/);
  });
});

describe("walk CLI", () => {
  const execFileAsync = promisify(execFile);
  const cli = join(REPO_ROOT, "dist/bin/typemockr");

  async function run(args: string[], overrides: Record<string, unknown> = { extra: true }) {
    await ensurePackageBuilt();
    const dir = await mkdtemp(join(tmpdir(), "typemockr-walk-"));
    try {
      const input = join(dir, "input.json");
      await writeFile(input, JSON.stringify(details(overrides)));
      return await execFileAsync(
        process.execPath,
        [cli, ...args.map((arg) => (arg === "INPUT" ? input : arg))],
        { cwd: REPO_ROOT },
      ).then(
        (out) => ({ code: 0, stdout: out.stdout }),
        (error: { code: number; stdout: string }) => ({ code: error.code, stdout: error.stdout }),
      );
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }

  test("walk prints one line per leaf; drift exits 1", async () => {
    const walked = await run(["walk", "--model", MODEL, "INPUT", "--config", CONFIG]);
    expect(walked.code).toBe(0);
    expect(walked.stdout).toContain('editions[0].name  Edition.name  string  "Hardcover 1st"  → "edition name" (mappings[0] source Store/Book/* path *.name)');

    const drifted = await run(["drift", "--model", MODEL, "INPUT", "--config", CONFIG]);
    expect(drifted.code).toBe(1);
    expect(drifted.stdout).toContain(
      "In the JSON, not in the model\n  DetailsResponse.extra  boolean  1 of 1  at extra\n",
    );
    expect(drifted.stdout.trimEnd().endsWith("4 fields differ, 4 occurrences")).toBe(true);
  });

  test("drift --all prints every occurrence; --format json carries entries and groups", async () => {
    const all = await run(["drift", "--all", "--model", MODEL, "INPUT", "--config", CONFIG]);
    expect(all.stdout).toContain("unmodelled  extra  DetailsResponse.extra  got boolean");

    const json = await run(["drift", "--model", MODEL, "INPUT", "--config", CONFIG, "--format", "json"]);
    const parsed = JSON.parse(json.stdout) as { drift: unknown[]; groups: Array<Record<string, unknown>> };
    expect(json.code).toBe(1);
    expect(parsed.drift).toContainEqual({ path: "extra", kind: "unmodelled", modelPath: "DetailsResponse.extra", actual: "boolean" });
    expect(parsed.groups[0]).toEqual({
      kind: "unmodelled",
      modelPath: "DetailsResponse.extra",
      count: 1,
      total: 1,
      example: "extra",
      heading: "In the JSON, not in the model",
      detail: "boolean",
      message: "DetailsResponse.extra: in the JSON (boolean), not in the model; 1 of 1, at extra",
    });
  });

  test("--type walks a path as the given model; json carries the field type and what was inferred", async () => {
    const args = ["drift", "--model", MODEL, "INPUT", "--config", CONFIG, "--format", "json"];
    const input = { content: { descriptions: [] } };

    expect(JSON.parse((await run(args, input)).stdout).groups.map((group: { kind: string }) => group.kind)).not.toContain("missing-required");

    const hinted = await run([...args, "--type=content=Store/Magazine/MagazineContent"], input);
    const parsed = JSON.parse(hinted.stdout) as { groups: Array<Record<string, unknown>>; inferred: unknown[] };
    expect(parsed.inferred).toEqual([
      { path: "content", declared: "ContentBase", type: "MagazineContent", source: "Store/Magazine/MagazineContent", by: "hint" },
    ]);
    expect(parsed.groups.find((group) => group.modelPath === "MagazineContent.digital")).toMatchObject({
      kind: "missing-required",
      modelPath: "MagazineContent.digital",
      type: { kind: "boolean" },
      source: "Store/Magazine/MagazineContent",
    });
    expect((await run([...args, "--type", "content"], input)).code).toBe(1);
  });
});
