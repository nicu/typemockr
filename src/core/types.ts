export type PrimitiveLiteral = string | number | boolean | null;
export type TypemockrOutputFormat = "ts" | "js";

/**
 * How an optional (`prop?:`) property is generated.
 *
 * - `maybe` (default): wrap in `faker.helpers.maybe()`, so the property is present at random.
 * - `always`: treat optional as required and always emit a value. Use this when `?` carries no
 *   intent, as in models generated from a backend schema that marks everything optional.
 * - `never`: omit optional properties entirely.
 *
 * `always` and `never` apply to every optional property. `maybe` keeps the long-standing quirk
 * that a property whose value came from the registry is emitted unwrapped.
 */
export type TypemockrOptionalMode = "maybe" | "always" | "never";

/**
 * How many elements a generated array gets, as `faker.helpers.multiple`'s `count`. A number is an
 * exact length; `{ min, max }` picks per array. Left unset, faker's own default (3) applies at
 * every level, which compounds through nested arrays.
 */
export type TypemockrArrayCount = number | { min: number; max: number };

export type ScalarKind =
  | "string"
  | "number"
  | "bigint"
  | "boolean"
  | "symbol"
  | "null"
  | "undefined"
  | "unknown"
  | "any"
  | "date";

export type TypeNode =
  | ScalarNode
  | LiteralNode
  | EnumNode
  | ObjectNode
  | UnionNode
  | ArrayNode
  | TupleNode
  | ReferenceNode;

export interface ScalarNode {
  kind: "scalar";
  scalar: ScalarKind;
}

export interface LiteralNode {
  kind: "literal";
  value: PrimitiveLiteral;
}

export interface EnumNode {
  kind: "enum";
  values: Array<string | number>;
  /**
   * The TS enum these values belong to. Set when the values come from an enum that is not
   * referenced as a whole (a subset of its members, or an enum outside the generated project),
   * so TS output can cast each literal back to its enum member type.
   */
  source?: EnumSource;
}

export interface EnumSource {
  name: string;
  sourceFile: string;
  exported: boolean;
  /** Member names, parallel to `EnumNode.values`. */
  members: string[];
}

export interface ObjectNode {
  kind: "object";
  properties: PropertyNode[];
  indexSignature?: IndexSignatureNode;
  /**
   * Set when the properties come from a mapped type over a finite key set (`Record<Enum, T>`,
   * `{ [K in "a" | "b"]: T }`): the object is a dictionary, not a record of distinct fields.
   */
  keyed?: { name?: string };
  /**
   * True when the type has private, protected or `#private` members. Those make a class
   * nominal: no object literal can satisfy it, so TS output needs a type assertion.
   */
  nominal?: boolean;
}

export interface UnionNode {
  kind: "union";
  members: TypeNode[];
}

export interface ArrayNode {
  kind: "array";
  element: TypeNode;
}

export interface TupleNode {
  kind: "tuple";
  elements: TypeNode[];
}

export interface ReferenceNode {
  kind: "reference";
  name: string;
  sourceFile?: string;
  genericParameter: boolean;
  typeArguments: TypeNode[];
}

export interface IndexSignatureNode {
  key: "string" | "number";
  value: TypeNode;
}

export interface PropertyNode {
  name: string;
  type: TypeNode;
  optional: boolean;
  readonly: boolean;
}

export interface GenericParameterNode {
  name: string;
  constraint?: TypeNode;
  defaultType?: TypeNode;
}

export interface EntityNode {
  id: string;
  name: string;
  sourceFile: string;
  declarationKind: "class" | "interface" | "typeAlias" | "enum";
  type: TypeNode;
  generics: GenericParameterNode[];
  recursive: boolean;
}

export interface FileModel {
  sourceFile: string;
  entities: EntityNode[];
}

export interface NormalizedProject {
  files: FileModel[];
  entities: EntityNode[];
  entityById: Map<string, EntityNode>;
  entityBySourceAndName: Map<string, EntityNode>;
}

export interface MockNameContext {
  /** The type name, e.g. `Cart`. */
  name: string;
  /** Absolute path of the file declaring the type. */
  sourceFile: string;
  /** PascalCase directory of the source file relative to its `baseDir`, e.g. `StoreOrder`. */
  dir: string;
}

/**
 * Either a template using the `{name}` and `{dir}` tokens (default `"Mock{name}"`),
 * or a function returning the exported mock function name.
 */
export type MockNameOption = string | ((context: MockNameContext) => string);

/** Legacy provider signature, kept compatible with typemockr 0.1.x. */
export type LegacyMappingProvider = (
  type: string,
  path: string,
  context?: { sourceFile?: string; entityName?: string },
) => string | undefined | null;

/**
 * One entry of the ordered `mappings` array. `path` is a `*`-wildcard glob matched against the
 * value path (`Entity.prop`), `type` restricts the entry to those scalar kinds, and `source` is a
 * `*`-wildcard glob matched against the declaring file's path relative to `baseDir`, without the
 * extension (`Store/Order/PaymentPlan`). Every omitted field matches everything, so `{ type, value }`
 * alone is a per-type fallback and `{ path, value }` alone behaves like the object form.
 *
 * `value` may use the tokens in {@link MappingValueTokens}, which is how a discriminator is derived
 * from the declaration's own path rather than hard-coded per type.
 */
export interface MappingEntry {
  path?: string;
  type?: ScalarKind | ScalarKind[];
  source?: string;
  value: string;
  /**
   * Set to `"unknown"` when the expression deliberately produces a different type than the field
   * declares — `Date` fields carrying the ISO string the wire actually holds, say. The emitted
   * assertion then goes through `unknown`, which TypeScript allows between unrelated types, and the
   * drift report stops treating the entry as a type/generator mismatch.
   */
  cast?: "unknown";
}

/**
 * Tokens substituted into a {@link MappingEntry.value}, all derived from the declaring file:
 *
 * - `{typeName}` — `PaymentPlan`
 * - `{sourceDir}` — `Store/Order`, empty at the root of `baseDir`
 * - `{sourcePath}` — `Store/Order/PaymentPlan`
 * - `{sourceNamespace}` — `Store.Order.PaymentPlan`
 */
export interface MappingValueTokens {
  typeName: string;
  sourceDir: string;
  sourcePath: string;
  sourceNamespace: string;
}

/**
 * Inline mappings, either as an ordered array of {@link MappingEntry} (first match wins), or in
 * the legacy object form: `{ pattern: expression }` or `{ expression: [patterns] }`.
 */
export type LegacyMappings = Record<string, string | string[]> | MappingEntry[];

export interface TypemockrConfig {
  include: string[];
  outDir: string;
  baseDir?: string[];
  registry?: string;
  /** Path to a module exporting a legacy `mappingProvider(type, path, context)` function. */
  mappingProvider?: string;
  mappings?: LegacyMappings;
  mockName?: MockNameOption;
  tsconfig?: string;
  projectRootDir?: string;
  format?: TypemockrOutputFormat;
  optional?: TypemockrOptionalMode;
  /** Cut-off for self-referencing types. Defaults to 2. */
  maxDepth?: number;
  arrayCount?: TypemockrArrayCount;
}

export interface ResolvedTypemockrConfig {
  projectRootDir: string;
  include: string[];
  outputRootDir: string;
  baseDir: string[];
  registryFile?: string;
  mappingProviderFile?: string;
  mappings?: LegacyMappings;
  mockName?: MockNameOption;
  tsconfigPath?: string;
  configFile?: string;
  format: TypemockrOutputFormat;
  optional: TypemockrOptionalMode;
  maxDepth: number;
  arrayCount?: TypemockrArrayCount;
}

export interface GeneratedFile {
  sourceFile: string;
  outputFile: string;
  code: string;
  entityNames: string[];
  format: TypemockrOutputFormat;
}

export interface VirtualSourceFile {
  filePath: string;
  text: string;
}

export interface RenderSourceTextOptions {
  sourceFilePath?: string;
  projectRootDir?: string;
  outDir?: string;
  baseDir?: string[];
  registryFilePath?: string;
  registry?: GenerationRegistry;
  format?: TypemockrOutputFormat;
  optional?: TypemockrOptionalMode;
  maxDepth?: number;
  arrayCount?: TypemockrArrayCount;
  mockName?: MockNameOption;
}

export interface ValueExpressionContext {
  kind: TypeNode["kind"];
  path: string;
  entityName: string;
  /** Absolute path of the file declaring the entity. */
  sourceFile: string;
  /** `sourceFile` relative to its `baseDir`, without the extension, e.g. `Store/Order/PaymentPlan`. */
  sourcePath: string;
  /** Directory part of `sourcePath`, empty at the root of `baseDir`. */
  sourceDir: string;
  /** `sourcePath` with `/` replaced by `.`, e.g. `Store.Order.PaymentPlan`. */
  sourceNamespace: string;
  scalar?: ScalarKind;
  targetName?: string;
  genericName?: string;
}

/**
 * What a registry hands back for one value. The object form exists so an expression can say that it
 * deliberately deviates from the declared type; a bare string means "this matches the declaration".
 */
export type ProvidedValue = string | { value: string; cast?: "unknown" };

export interface GenerationRegistry {
  values?: Record<string, string>;
  provideValue?(context: ValueExpressionContext): ProvidedValue | undefined | null;
  rules?: Record<string, string[]>;
}

export interface DriftMismatch {
  path: string;
  entityName: string;
  sourceFile: string;
  declared: ScalarKind;
  generated: ScalarKind;
  value: string;
}

export interface DriftDefaultGroup {
  scalar: ScalarKind;
  paths: string[];
}

export interface DriftDeadMapping {
  index: number;
  entry: MappingEntry;
}

/**
 * Advisory output of a generation run: what generated a value of the wrong type, what nothing
 * mapped, and which mapping entries are now dead.
 */
export interface DriftReport {
  mismatches: DriftMismatch[];
  defaults: DriftDefaultGroup[];
  deadMappings: DriftDeadMapping[];
}

export interface GenerateMocksResult {
  config: ResolvedTypemockrConfig;
  project: NormalizedProject;
  files: GeneratedFile[];
  report: DriftReport;
}
