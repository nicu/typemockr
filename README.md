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

`.d.ts` files are regular input, so a package that ships only declarations can be mocked directly. Types from `node_modules` are imported by package name (`@acme/models/lib/Sales/Cart`). The package must allow that deep import, which is the case when it has no `exports` map.

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
- `"Mock{dir}{name}"` turns `Sales/Order/Cart.d.ts` into `MockSalesOrderCart`. `{dir}` is the PascalCase directory relative to `baseDir`.
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
const booking = MockBooking({ paymentToken: undefined });
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
    Booking: ["if (!result.paymentMethod) { delete result.paymentToken; }"],
  },
};
```

```ts
export function MockBooking(overrides: Partial<Booking> = {}): Booking {
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

Because TS output is type-checked, a mapping that returns the wrong type fails `tsc` — `faker.string.uuid()` on a numeric `id` is an error, not a bad value.

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
- The first matching entry wins, in array order — unlike the object form, which depends on key order.

You rarely need a catch-all entry. A path with no matching mapping falls through to the built-in
default for its scalar type (`faker.lorem.words()` for `string`, `faker.number.int()` for `number`,
`faker.datatype.boolean()` for `boolean`, and so on), which is already type-correct. A `{ path: "*" }`
entry suppresses those defaults for every type at once, which is almost never what you want.
