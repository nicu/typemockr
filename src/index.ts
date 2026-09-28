export {
  generateMocks,
  renderMocks,
  renderMocksFromSourceText,
  writeGeneratedFiles,
} from "./core/generate";
export {
  createProject,
  createVirtualProject,
  defineConfig,
  loadConfig,
  resolveConfig,
} from "./core/load";
export { defineRegistry } from "./core/registry";
export { formatDriftReport, formatMappingMismatches } from "./core/report";
export { buildEntityGraph, markRecursiveEntities } from "./core/graph";
export { normalizeProject } from "./core/normalize";
export type {
  DriftDeadMapping,
  DriftDefaultGroup,
  DriftMismatch,
  DriftReport,
  EntityNode,
  FileModel,
  GenerateMocksResult,
  GeneratedFile,
  GenerationRegistry,
  GenericParameterNode,
  LegacyMappingProvider,
  LegacyMappings,
  MappingEntry,
  MockNameContext,
  MockNameOption,
  MappingValueTokens,
  NormalizedProject,
  PropertyNode,
  ProvidedValue,
  RenderSourceTextOptions,
  ResolvedTypemockrConfig,
  TypemockrArrayCount,
  TypemockrConfig,
  TypemockrOptionalMode,
  TypemockrOutputFormat,
  TypeNode,
  ValueExpressionContext,
  VirtualSourceFile,
} from "./core/types";
