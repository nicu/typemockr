export type PrimitiveLiteral = string | number | boolean | null;
export type TypemockrOutputFormat = "ts" | "js";

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
}

export interface ObjectNode {
  kind: "object";
  properties: PropertyNode[];
  indexSignature?: IndexSignatureNode;
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

export interface TypemockrConfig {
  include: string[];
  outDir: string;
  baseDir?: string[];
  registry?: string;
  tsconfig?: string;
  projectRootDir?: string;
  format?: TypemockrOutputFormat;
}

export interface ResolvedTypemockrConfig {
  projectRootDir: string;
  include: string[];
  outputRootDir: string;
  baseDir: string[];
  registryFile?: string;
  tsconfigPath?: string;
  configFile?: string;
  format: TypemockrOutputFormat;
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
}

export interface ValueExpressionContext {
  kind: TypeNode["kind"];
  path: string;
  entityName: string;
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
