# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Versions below cover the 0.2.x line, which began with the v0.2.0 rewrite of the generator core.

## [0.2.9] - 2026-10-01

### Changed

- Build: tsconfigs now compile under TypeScript 6 and 7. The base config uses `moduleResolution: "bundler"` and names `node` in `types` (no longer loaded implicitly on 6+); the CJS build uses `node16`, and both builds set `rootDir`. Emitted output is unchanged.

## [0.2.8] - 2026-10-01

### Added

- **JSON walker** — new `typemockr walk` command and programmatic `walk()` / `createWalker()` API that check a real JSON value (an API response, a fixture) against the type it should be, using the same config, type resolution, and mappings as generation. Each leaf is reported with its mapping path, the mapping that would generate it, and where the JSON and the model disagree.
- **Drift CLI** — new `typemockr drift` command (exit code 1 when there is drift) that prints a block per kind of disagreement: required-but-missing, present-but-unexpected, and type/value differences, with occurrence counts (`N of M`) and example JSON paths. Supports `--all`, `--format json|text`, and repeatable `--type <jsonPath>=<path[#Type]>` hints.
- **Polymorphism** — objects carrying a `$type`/`$Type` string are walked as the type they name (matched by namespace path); without one, the JSON's own keys infer the subclass; explicit `types` hints win over both. Inferred walks are surfaced in an `inferred` list.
- New public exports: `walk`, `createWalker`, `formatDrift`, `groupDrift`, `formatLeaves`, and their supporting types (`WalkResult`, `Walker`, `Leaf`, `Drift`, `DriftGroup`, etc.).

### Changed

- Test fixtures renamed to a bookstore theme.

## [0.2.7] - 2026-09-28

### Added

- **Mapping drift report** — every generation run now reports on its own mappings. A type/generator mismatch (an entry whose expression produces a kind the field does not declare) fails the run; unmatched fields that fell through to a type default and dead mappings are printed as an advisory report after the run. The produced kind is measured by evaluating the expression against faker, not guessed.
- **Values derived from the declaration** — mapping `value` strings may use tokens taken from the declaring file: `{typeName}`, `{sourceDir}`, `{sourcePath}`, and `{sourceNamespace}` (e.g. generating a discriminator without listing every type).
- **`source` scoping on mappings** — an entry may carry a `source` glob over the declaring file's path to scope it to particular files.
- **Deliberate type deviation** — set `cast: "unknown"` on a mapping entry to assert through `unknown`, for values that intentionally differ from the declared type (e.g. an ISO string where a `Date` is declared).

### Added (API)

- New public exports: `formatDriftReport`, `formatMappingMismatches`. `generateMocks()` and `renderMocks()` return the report data (`{ mismatches, defaults, deadMappings }`).

## [0.2.6] - 2026-09-18

### Added

- **`maxDepth`** — recursion cut-off for self-referencing types (default `2`), also overridable per call as a second argument to recursive builders (`MockTree({}, { maxDepth: 5 })`).
- **`arrayCount`** — elements per generated array, as a number or `{ min, max }`, bounding how large a mock gets (defaults to faker's own default of 3).

## [0.2.5] - 2026-09-18

### Added

- **`optional` config option** — controls how `prop?:` is generated: `"maybe"` (default, wrapped in `faker.helpers.maybe()`), `"always"` (always present), or `"never"` (property omitted from the literal). Documented the `rules` escape hatch for cross-field invariants.

## [0.2.4] - 2026-09-18

### Added

- **Type-scoped mappings** — `mappings` may now be an ordered array of `{ path, type, value }` entries so the same field name resolves differently per scalar type (e.g. `*.value` → uuid for strings, float for numbers). The first matching entry wins in array order; omitting `path` or `type` matches all.

## [0.2.3] - 2026-09-18

### Fixed

- Nested type assertions: indexed access into a property's type now wraps each step in `NonNullable<>` so optional properties and arrays are unwrapped correctly, and returns no assertion (rather than an unsound one) when the target is reached through a generic parameter. Added a `nested-type-assertions` test case.

## [0.2.2] - 2026-09-18

### Added

- **Enum member handling** — enums and their members are now resolved and mocked (new `enum-members` cases).
- **Nominal class support** — classes are treated as nominal types in the generated graph.
- **Declaration files & installed packages** — `.d.ts` files are regular input, so a package that ships only declarations can be mocked directly; types from `node_modules` are imported by package name.
- **New config options**: `format` (`"ts"` default or `"js"` with JSDoc types), `mockName` (a template with `{name}`/`{dir}` tokens, or a function in JS/TS configs; defaults to `"Mock{name}"`), and `tsconfig`.
- **Registry module** — a config may point at a module exporting custom values used for specific paths.

### Changed

- Config discovery now looks for `typemockr.config.ts`, `.js`, `.cjs`, then `typemockr.json`, in that order; unknown keys are an error.
- Substantial rework of the emit, load, normalize, and registry core to support the above.

## [0.2.1] - 2026-08-07

### Added

- **Literal types** — string/number literal unions (e.g. `"a" | "b"`) are now resolved and mocked (new `literal-types` case).
