import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { emitFiles } from "./emit";
import {
  createProject,
  createVirtualProject,
  loadModuleFromFile,
  resolveConfig,
} from "./load";
import { normalizeProject } from "./normalize";
import {
  composeRegistries,
  createLegacyRegistry,
  resolveGenerationRegistry,
  resolveLegacyMappingProvider,
} from "./registry";
import type {
  GenerationRegistry,
  GenerateMocksResult,
  GeneratedFile,
  RenderSourceTextOptions,
  ResolvedTypemockrConfig,
  TypemockrConfig,
  VirtualSourceFile,
} from "./types";

export async function generateMocks(
  config: TypemockrConfig | ResolvedTypemockrConfig,
): Promise<GenerateMocksResult> {
  const rendered = await renderMocks(config);
  await writeGeneratedFiles(rendered.files);
  return rendered;
}

export async function renderMocks(
  config: TypemockrConfig | ResolvedTypemockrConfig,
): Promise<GenerateMocksResult> {
  const resolvedConfig = isResolvedConfig(config) ? config : resolveConfig(config);
  const project = createProject(resolvedConfig);
  const normalizedProject = normalizeProject(project);
  const registry = loadRegistry(resolvedConfig);
  const files = emitFiles(normalizedProject, resolvedConfig, registry);

  return {
    config: resolvedConfig,
    project: normalizedProject,
    files,
  };
}

export async function renderMocksFromSourceText(
  sourceText: string,
  options: RenderSourceTextOptions = {},
): Promise<GeneratedFile> {
  const projectRootDir = options.projectRootDir ?? "/__typemockr__";
  const sourceFilePath = resolveInlinePath(
    projectRootDir,
    options.sourceFilePath ?? "src/input.ts",
  );
  const resolvedConfig = resolveConfig({
    include: [sourceFilePath],
    outDir: options.outDir ?? "$mock",
    baseDir: options.baseDir ?? ["src"],
    registry: options.registryFilePath,
    projectRootDir,
    format: options.format,
    mockName: options.mockName,
  });
  const project = createVirtualProject([
    {
      filePath: sourceFilePath,
      text: sourceText,
    },
  ]);
  const normalizedProject = normalizeProject(project);
  const registry = options.registry ?? loadRegistry(resolvedConfig);
  const files = emitFiles(normalizedProject, resolvedConfig, registry);
  const renderedFile = files.find((file) => file.sourceFile === sourceFilePath);

  if (!renderedFile) {
    throw new Error(`No generated output was produced for ${sourceFilePath}.`);
  }

  return renderedFile;
}

export async function writeGeneratedFiles(
  files: ReadonlyArray<{ outputFile: string; code: string }>,
): Promise<void> {
  for (const file of files) {
    await mkdir(dirname(file.outputFile), { recursive: true });
    await writeFile(file.outputFile, `${file.code}\n`, "utf8");
  }
}

function isResolvedConfig(
  config: TypemockrConfig | ResolvedTypemockrConfig,
): config is ResolvedTypemockrConfig {
  return "outputRootDir" in config;
}

function resolveInlinePath(projectRootDir: string, filePath: string): string {
  return filePath.startsWith("/") ? filePath : `${projectRootDir}/${filePath}`;
}

function loadRegistry(config: ResolvedTypemockrConfig): GenerationRegistry {
  const registry = config.registryFile
    ? resolveGenerationRegistry(
        loadModuleFromFile(config.registryFile),
        `registry ${config.registryFile}`,
      )
    : undefined;
  const mappingProvider = config.mappingProviderFile
    ? resolveLegacyMappingProvider(
        loadModuleFromFile(config.mappingProviderFile),
        `mappingProvider ${config.mappingProviderFile}`,
      )
    : undefined;

  return composeRegistries([
    registry,
    createLegacyRegistry({ mappingProvider, mappings: config.mappings }),
  ]);
}
