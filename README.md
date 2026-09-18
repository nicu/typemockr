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

### Legacy mappings

The 0.1.x options still work. They are applied after `registry`.

- `mappingProvider`: path to a module exporting `mappingProvider` (named or default). It is called as `mappingProvider(type, path, { sourceFile, entityName })` for scalar values only. `type` is one of `string`, `number`, `bigint`, `boolean`, `date`, `any` or `unknown`. The first non-empty string returned wins.
- `mappings`: either `{ "*.id": "faker.string.uuid()" }` or `{ "faker.string.uuid()": ["*.id"] }`. `*` is a wildcard, and matching ignores case.

Because TS output is type-checked, a provider should check `type` before returning, so it doesn't return `faker.string.uuid()` for a numeric `id`.
