# TypeMockr

Generates Faker-based mock factories from TypeScript classes, interfaces, type aliases and enums.

```bash
npx typemockr                       # uses the first config found (see below)
npx typemockr typemockr.api.json    # explicit config path, relative to the current directory
```

## Configuration

Without an argument, the CLI looks for `typemockr.config.ts`, `typemockr.config.js`, `typemockr.config.cjs` and `typemockr.json`, in that order. Unknown keys are an error.

| Key | Description |
| --- | --- |
| `include` | **Required.** Globs or paths of input files. `.ts` and `.d.ts` files are both supported. Relative imports are followed. |
| `outDir` | **Required.** Output directory. Each source file produces `<outDir>/<path relative to baseDir>/<name>.mock.<format>`. |
| `baseDir` | Directories stripped from source paths when computing output paths. |
| `format` | `"ts"` (default) or `"js"` (with JSDoc types). |
| `optional` | How `prop?:` is generated: `"maybe"` (default), `"always"` or `"never"` (see [Optional properties](#optional-properties)). |
| `maxDepth` | Recursion cut-off for self-referencing types. Defaults to `2`. |
| `arrayCount` | Elements per generated array: a number or `{ min, max }`. Defaults to faker's own default of 3 (see [Mock size](#mock-size)). |
| `tsconfig` | tsconfig used to resolve types. Defaults to `./tsconfig.json` if present. |
| `registry` | Module exporting custom values (see [Registry](#registry)). |
| `mappingProvider` | Module exporting a 0.1.x-style `mappingProvider(type, path, context)` function (see [Legacy mappings](#legacy-mappings)). |
| `mappings` | Inline 0.1.x-style mappings. |
| `mockName` | Name of the generated factories: a template with `{name}` and `{dir}` tokens, or (in JS/TS configs) a function. Defaults to `"Mock{name}"`. |

```json
{
  "include": ["src/models/**/*.ts"],
  "baseDir": ["src/models"],
  "outDir": "src/mocks"
}
```

### Declaration files and installed packages

`.d.ts` files are regular input, so a package that ships only declarations can be mocked directly. Types from `node_modules` are imported by package name (`@acme/models/lib/Store/Cart`). The package must allow that deep import, which is the case when it has no `exports` map.

```json
{
  "include": ["node_modules/@acme/models/lib/**/*.d.ts"],
  "baseDir": ["node_modules/@acme/models/lib"],
  "outDir": "src/mocks/acme",
  "mockName": "MockAcme{name}"
}
```

If a `.ts` and a `.d.ts` file map to the same output file, generation fails. Exclude one of them.

### Avoiding name collisions

Every factory is exported from its own module, so identical type names in different files never clash at the module level. `mockName` also makes the names unique across sources and directories, which helps with barrels and auto-imports:

- `"MockApi{name}"` turns `Cart` into `MockApiCart`.
- `"Mock{dir}{name}"` turns `Store/Order/Cart.d.ts` into `MockStoreOrderCart`. `{dir}` is the PascalCase directory relative to `baseDir`.
- `({ name, dir, sourceFile }) => ...` gives full control, from a `typemockr.config.ts`.

Generating from two sources means two configs with different `outDir`s and `mockName`s. Run the CLI once per config.

### Registry

```ts
// typemockr.registry.ts
export default {
  values: { "Money.currency": '"USD"' },          // path -> expression
  provideValue: ({ kind, scalar, path, entityName, sourceFile }) =>
    kind === "scalar" && scalar === "string" && path.endsWith(".id")
      ? "faker.string.uuid()"
      : undefined,
  rules: { Order: ['if (result.status === "error") result.color = "red";'] },
};
```

Paths look like `Entity.prop`, `Entity.prop.nested`, and `Entity.list[]` for array elements. In TS output, registry values are asserted to the property type, so an expression of the wrong type fails `tsc`.

### Mock size

Two settings bound how large a generated mock gets.

`maxDepth` is the cut-off for types that reference themselves. Recursive builders take a second
argument, so it is also overridable per call:

```ts
MockTree({}, { maxDepth: 5 });
```

`arrayCount` is usually the bigger lever. Every array is emitted as `faker.helpers.multiple`, and
with no `count` faker produces 3 elements at every level — which compounds, so an array of 3 whose
element holds an array of 3 is 9, and so on down. Deep response types reach tens of thousands of
nodes this way without recursing at all:

```json
{ "arrayCount": { "min": 1, "max": 2 } }
```

```ts
"labels": faker.helpers.multiple(() => faker.lorem.words(), { count: { min: 1, max: 2 } }),
```

A number fixes the length exactly; `{ min, max }` keeps some variety. For a single path, set the
whole array through `registry.values` instead — that wins over the generated expression:

```js
values: { "Branch.leaves": "[MockLeaf()]" }
```

Note that depth is only bounded for recursive types. A non-recursive graph is as deep as the types
are, and there is deliberately no cut-off for it: stopping partway would mean inventing a value for
a required property, which produces a mock that type-checks but is not a real value of its type.
Bounding `arrayCount` is the effective control, since breadth rather than depth is what compounds.

### Optional properties

By default an optional property is wrapped in `faker.helpers.maybe()`, so it is present about half
the time. `optional` changes that for every optional property:

| Value | Output for `reference?: string` |
| --- | --- |
| `"maybe"` (default) | `"reference": faker.helpers.maybe(() => faker.lorem.words()),` |
| `"always"` | `"reference": faker.lorem.words(),` |
| `"never"` | *(the property is left out of the literal)* |

Use `"always"` when `?` carries no intent — models generated from a backend schema often mark every
field optional, and a mock that randomly drops half of them is noise rather than coverage. It also
makes the shape of a mock stable, so a test narrows from a complete object instead of repairing an
arbitrary one:

```ts
const order = MockOrder({ paymentToken: undefined });
```

Note that under `"maybe"`, a property whose value comes from `registry` or `mappings` is emitted
unwrapped, so whether a property is present depends on whether a mapping matched its path. `"always"`
and `"never"` apply uniformly and do not have that quirk.

#### Fields that depend on each other

No global setting can express "if `paymentMethod` is set then `paymentToken` is required, and
`refundReason` must be absent" — a schema that marks everything optional has already lost that
information. Use `rules` for the entities whose invariants you actually assert on; rule lines run
after `overrides` are applied and can adjust `result`:

```js
export default {
  rules: {
    Order: ["if (!result.paymentMethod) { delete result.paymentToken; }"],
  },
};
```

```ts
export function MockOrder(overrides: Partial<Order> = {}): Order {
  const base = { /* ... */ };
  const result = { ...base, ...overrides };
  if (!result.paymentMethod) { delete result.paymentToken; }
  return result;
}
```

### Legacy mappings

The 0.1.x options still work. They are applied after `registry`.

- `mappingProvider`: path to a module exporting `mappingProvider` (named or default). It is called as `mappingProvider(type, path, { sourceFile, entityName })` for scalar values only. `type` is one of `string`, `number`, `bigint`, `boolean`, `date`, `any` or `unknown`. The first non-empty string returned wins.
- `mappings`: either `{ "*.id": "faker.string.uuid()" }` or `{ "faker.string.uuid()": ["*.id"] }`. `*` is a wildcard, and matching ignores case.

Because TS output is type-checked, a mapping that returns the wrong type fails `tsc` — `faker.string.uuid()` on a numeric `id` is an error, not a bad value. The [drift report](#drift-report) catches the common cases before `tsc` does.

### Type-scoped mappings

A name pattern like `*.value` matches fields of every scalar type, so over a large model set it will
eventually land on one it does not fit. Write `mappings` as an **ordered array** to scope an entry to
the types it is valid for:

```js
mappings: [
  { path: "*.id", type: "string", value: "faker.string.uuid()" },

  // The same name, resolved per type.
  { path: "*.value", type: "number", value: "faker.number.float({ min: 100, max: 5000 })" },
  { path: "*.value", type: "string", value: "faker.commerce.productName()" },

  { path: "*.is*", type: "boolean", value: "faker.datatype.boolean()" },

  // No `path` matches every path, so this is a per-type fallback. Keep these last.
  { type: "date", value: "faker.date.anytime()" },
  { type: ["any", "unknown"], value: "faker.lorem.words()" },
]
```

- `path` is the same `*` glob as the object form, matched case-insensitively. Omit it to match every path.
- `type` is a scalar kind or a list of them (`string`, `number`, `bigint`, `boolean`, `date`, `any`, `unknown`). Omit it to match every scalar, as the object form does.
- `source` is a `*` glob over the declaring file's path relative to `baseDir`, without the extension (`Store/Order/PaymentPlan`). Omit it to match every file.
- The first matching entry wins, in array order — unlike the object form, which depends on key order.

You rarely need a catch-all entry. A path with no matching mapping falls through to the built-in
default for its scalar type (`faker.lorem.words()` for `string`, `faker.number.int()` for `number`,
`faker.datatype.boolean()` for `boolean`, and so on), which is already type-correct. A `{ path: "*" }`
entry suppresses those defaults for every type at once, which is almost never what you want.

### Values derived from the declaration

A `value` may use these tokens, all taken from the file the type is declared in:

| Token | For `src/Store/Order/PaymentPlan.ts` under `baseDir: ["src"]` |
| --- | --- |
| `{typeName}` | `PaymentPlan` |
| `{sourceDir}` | `Store/Order` (empty at the root of `baseDir`) |
| `{sourcePath}` | `Store/Order/PaymentPlan` |
| `{sourceNamespace}` | `Store.Order.PaymentPlan` |

This is how a discriminator is generated without listing every type. Models emitted from a backend
schema usually mirror the server namespace in their folder layout, so one entry covers all of them,
and `source` handles the folders that do not:

```js
mappings: [
  // `lib/Ai/*` is the `AI` namespace on the wire. Scoped entries go before the general one.
  { source: "Ai/*", path: "*.$type", type: "string", value: '"Acme.Api.Models.AI.{typeName}"' },
  { path: "*.$type", type: "string", value: '"Acme.Api.Models.{sourceNamespace}"' },
]
```

Any `$type` no entry matches falls through to `faker.lorem.words()` and is listed in the [drift
report](#drift-report), so a namespace the derivation does not cover is visible rather than silently
wrong.

### Values that deviate from the declared type

A response deserialized from JSON does not hold the types the models declare: a `Date` field is an
ISO string on the wire, and a fixture that mirrors the wire should say so. Set `cast: "unknown"` on
the entry to assert through `unknown`, which is the only assertion TypeScript allows between
unrelated types:

```js
mappings: [
  { type: "date", value: "faker.date.anytime().toISOString()", cast: "unknown" },
]
```

```ts
"recordedOn": (faker.date.anytime().toISOString()) as unknown as Trailer["recordedOn"],
```

One entry covers every `Date`-typed position, including the elements of a `Date[]`. Without `cast`,
the assertion stays direct (`as Trailer["recordedOn"]`) and `tsc` rejects the mismatch — which is the
right outcome for an expression that was meant to fit the declaration.

### Drift report

Every generation run reports on its own mappings, because mocks are regenerated whenever the models
change and that is the moment the mappings can be checked against them.

A **type/generator mismatch** fails the run: an entry whose expression produces a kind the field does
not declare — `faker.lorem.words()` landing on a `number` — is a bug in the mappings, and the mocks
would either not compile or compile through an assertion and lie.

```
1 mapping generates a value of the wrong type:
  PaymentPlan.balance is `number` but `faker.lorem.words()` generates `string` (src/Store/Order/PaymentPlan.ts)
Fix the mapping, or add `"cast": "unknown"` to it when the deviation is deliberate.
```

The kind is measured, not guessed: the expression is evaluated against faker, because nothing about
`faker.location.latitude()` (a number) or `faker.date.month()` (a string) says so from the outside.
An expression that throws — a reference to a generated mock, say — is left alone rather than failing
a build on a guess.

The rest is advisory, printed after the run:

```
typemockr drift report:
  3 `string` fields fell through to the type default:
    ErrorInfo.message
    SearchRequest.query
    Trailer.url
  1 mapping entries matched nothing:
    mappings[3] path "*.neverPresent" type "string" -> faker.lorem.word()
```

- **Fell through to the type default**, grouped by type — new fields that may want a mapping.
- **Matched nothing** — entries left behind by a field that was renamed or removed.

`generateMocks()` and `renderMocks()` return the same data as `result.report`
(`{ mismatches, defaults, deadMappings }`) for projects that want to act on it themselves.

## Walking real data

The walker checks a real JSON value — an API response, a fixture — against the type it should be,
using the same config, type resolution and mappings as generation. It reports every leaf with the
path a mapping would see, which mapping would generate it, and where the JSON and the model disagree.

```bash
npx typemockr walk  --model Store/Book/DetailsResponse response.json [--config typemockr.json] [--format json|text]
npx typemockr drift --model Store/Book/DetailsResponse response.json [--all] [--type content=Store/Magazine/MagazineContent]   # exit code 1 when there is drift
```

`drift` prints a block per kind of disagreement, under a heading that says what disagrees. Each row
is a model field, what the model or the JSON has there, in how many of the instances walked
(`N of M`, or `N×` when the total is unknown), and one JSON path. A note, when there is one, goes on
its own line under the row. `--all` prints one line per occurrence instead.

```
Required by the model, not in the JSON
  Chapter.summary             string     4 of 8  at product.chapters[0].summary
  MagazineContent.backIssues  Edition[]  1 of 1  at content.backIssues
      walked as MagazineContent by a type hint; the model declares ContentBase

In the JSON, not in the model
  Edition.weight  number  2 of 4  at editions[0].weight

3 fields differ, 7 occurrences
```

`--format json` prints `{ drift, groups, inferred }`: every occurrence, the groups as
`{ kind, modelPath, count, total?, example, heading, detail?, note?, message, type?, source? }`, and
the objects walked as a type the model did not declare (see [Polymorphism](#polymorphism)).
`heading`, `detail` and `note` are the pieces of the text output; `message` is the same in one line:
`Edition.weight: in the JSON (number), not in the model; 2 of 4, at editions[0].weight`.

`--model` is the declaring file relative to `baseDir`, without the extension; the type is the one
named like the file, or the only one in it. Use `path#TypeName` otherwise. Without `--config` the
config is discovered as for generation; with it, the config's relative paths resolve from the
config file's directory.

```
editions[0].name  Edition.name  string  "Hardcover"
editions[0].pages  Edition.pages  number  320  → faker.number.int({min: 50, max: 900}) (mappings[18] path *.pages)
product.status  BookProduct.status  enum:StockStatus  "InStock"
```

```ts
import { createWalker, formatDrift, groupDrift, walk } from "typemockr";

const { leaves, drift, seen, inferred } = await walk({ config: "typemockr.json", model: "Store/Cart", input });
groupDrift(drift, seen); // [{ kind, modelPath, count, total?, example, heading, detail?, note?, message }]
formatDrift(drift, { seen }); // the CLI's text; { all: true } for one line per occurrence

// Loads the project once, for many inputs.
const walker = await createWalker({ config: "typemockr.json" });
walker.walk("Store/Cart", input);
walker.walk("Store/Book/DetailsResponse", input, { types: { content: "Store/Magazine/MagazineContent" } });
```

Each leaf is `{ path, modelPath, source, kind, enumName?, value, mapping? }`:

- `path` is the JSON path (`product.editions[2].name`), `modelPath` the mapping path
  (`Edition.name`, `Entity.list[]`), and `source` the declaring file relative to `baseDir`.
- `kind` is `string`, `number`, `boolean`, `date`, `enum`, `null` or `unknown` (under `any`/`unknown`).
- `mapping` is `{ value, source?, path, index? }`: the registry value or mapping entry generation
  would use, found by the same lookup and with the same precedence, with tokens substituted.

### Polymorphism

An object with a `$type` (or `$Type`) string is walked as the type it names when that type extends
or implements the expected one. The value is matched to a declaration by its path:
`Acme.Api.Models.Store.Sku` finds `Store/Sku` (longest namespace suffix, case-insensitive,
assembly and generic suffixes ignored). Leaves are then reported under that type — inherited
properties included, as `BookProduct.name` rather than `ProductBase.name` — which is also the path its
own mock would be generated with.

Without a `$type` (or with an empty one), the JSON's own keys decide. The keys the declared type
lacks must all be declared by one subclass, which is then walked; when several subclasses declare
all of them the least derived wins, and unrelated ones are a tie, so the declared type is walked and
the drift `note` says so. Required fields the JSON lacks are never evidence — an object with no key
of its own is walked as declared, even when only one subclass could be meant.

For that case, `types` (`--type <jsonPath>=<path[#Type]>`, repeatable) names the type to walk a JSON
path as: `{ content: "Store/Magazine/MagazineContent", "payments[]": "Store/Payment/GiftCard" }`. Paths are drift
paths, `[]` matches every index, and `$` is the root. A hint wins over `$type` and over inference,
and must be assignable to the declared type. `createWalker({ types })` sets them for every walk;
`walker.walk(model, input, { types })` adds to or replaces them for one.

`inferred` lists each object walked as something other than its declared type without a `$type`
saying so: `{ path, declared, type, source, by: "keys" | "hint" }`.

### Drift kinds

Each entry is `{ path, kind, modelPath, expected?, actual?, note?, type?, source? }`. `seen` counts how many times
each model path was walked, present or not, which is what `groupDrift` reports counts against.

| Kind | Heading in the text output | Meaning |
| --- | --- | --- |
| `key-mismatch` | Keys differ from the model's | A mapped type over a finite key set (`Record<Enum, T>`, `{ [K in "a" \| "b"]: T }`) whose JSON keys are not exactly that set. One entry on the object, with the key set as `expected` and the JSON's keys as `actual`, instead of one per key; also when every JSON key is valid and some are absent (the type over-promises). |
| `missing-required` | Required by the model, not in the JSON | A required property absent from the JSON. `type` is its declared type as `{ kind, name?, source?, values?, element?, nullable? }` — `kind` one of `string`, `number`, `boolean`, `date`, `enum`, `array`, `object`, `null`, `union`, `unknown`; `name`/`source` the model type and its declaring file — and `source` the declaring file of the field's owner. |
| `unmodelled` | In the JSON, not in the model | A property in the JSON that the (resolved) type does not declare. `$type`/`$Type` are exempt. When the object has no `$type` and the expected type has subclasses, `note` names up to three that declare it, and says when the keys fit no single subclass. |
| `type-mismatch` | Another type than the model says | The JSON holds a different kind than declared, including `null` for a required non-nullable property. |
| `null-for-optional` | null where the model says optional | `null` where the type says `T \| undefined`. |
| `string-for-date` | The model says Date, the JSON has an ISO string | An ISO string where the type says `Date`. Reported once per `modelPath`, since it is systemic. |
| `enum-mismatch` | Not a value of the model's enum | A string on a numeric enum (or the reverse), or a value that is no member. |
| `unknown-discriminator` | $type the model does not know | A `$type` that names no declaration, or one not assignable to the expected type; the expected type is walked instead. An empty `$type` is reported too, and the type is then inferred from the keys. |
