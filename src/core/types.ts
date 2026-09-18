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
  /** PascalCase directory of the source file relative to its `baseDir`, e.g. `SalesOrder`. */
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
 * value path (`Entity.prop`), `type` restricts the entry to those scalar kinds. Omitting `path`
 * matches every path, so `{ type, value }` alone is a per-type fallback; omitting `type` matches
 * every scalar, so `{ path, value }` alone behaves like the object form.
 */
export interface MappingEntry {
  path?: string;
  type?: ScalarKind | ScalarKind[];
  value: string;
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
  scalar?: ScalarKind;
  targetName?: string;
  genericName?: string;
}

export interface GenerationRegistry {
  values?: Record<string, string>;
  provideValue?(context: ValueExpressionContext): string | undefined | null;
  rules?: Record<string, string[]>;
}

export interface GenerateMocksResult {
  config: ResolvedTypemockrConfig;
  project: NormalizedProject;
  files: GeneratedFile[];
}
