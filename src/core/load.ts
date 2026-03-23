import { existsSync, readFileSync, statSync } from "node:fs";
import { access } from "node:fs/promises";
import { createRequire, Module } from "node:module";
import { dirname, extname, isAbsolute, join, resolve } from "node:path";
import { constants as fsConstants } from "node:fs";
import { Project, ScriptTarget, ModuleKind, ModuleResolutionKind } from "ts-morph";
import ts from "typescript";
import type {
  VirtualSourceFile,
  ResolvedTypemockrConfig,
  TypemockrConfig,
} from "./types";

const CONFIG_FILE_NAMES = [
  "typemockr.config.ts",
  "typemockr.config.js",
  "typemockr.config.cjs",
  "typemockr.json",
] as const;

type RequireExtension = (
  module: NodeJS.Module & { _compile(code: string, filename: string): void },
  filename: string,
) => void;

export function defineConfig(config: TypemockrConfig): TypemockrConfig {
  return config;
}

export async function loadConfig(
  projectRootDir = process.cwd(),
  explicitConfigPath?: string,
): Promise<ResolvedTypemockrConfig> {
  const root = resolve(projectRootDir);
  const configFile = explicitConfigPath
    ? resolve(root, explicitConfigPath)
    : await findConfigFile(root);

  if (!configFile) {
    throw new Error(
      `Could not find a typemockr config file in ${root}. Expected one of ${CONFIG_FILE_NAMES.join(", ")}.`,
    );
  }

  const loaded = loadConfigModule(configFile);
  const config = extractConfigValue(loaded);

  return {
    ...resolveConfig({
      ...config,
      projectRootDir: root,
    }),
    configFile,
  };
}

export function resolveConfig(config: TypemockrConfig): ResolvedTypemockrConfig {
  if (!Array.isArray(config.include) || config.include.length === 0) {
    throw new Error("`include` must be a non-empty array.");
  }

  if (!config.outDir) {
    throw new Error("`outDir` is required.");
  }

  const projectRootDir = resolve(config.projectRootDir ?? process.cwd());
  const tsconfigCandidate = resolveOptional(projectRootDir, config.tsconfig);

  return {
    projectRootDir,
    include: [...config.include],
    outputRootDir: resolve(projectRootDir, config.outDir),
    baseDir: (config.baseDir ?? []).map((entry) =>
      resolve(projectRootDir, entry),
    ),
    registryFile: resolveOptional(projectRootDir, config.registry),
    tsconfigPath: tsconfigCandidate ?? resolveDefaultTsconfig(projectRootDir),
    format: config.format ?? "ts",
  };
}

export function createProject(config: ResolvedTypemockrConfig): Project {
  const project = createBaseProject(config.tsconfigPath);

  const patterns = config.include.map((entry) =>
    isAbsolute(entry) ? entry : resolve(config.projectRootDir, entry),
  );

  project.addSourceFilesAtPaths(patterns);
  expandProjectWithLocalImports(project);

  return project;
}

export function createVirtualProject(sourceFiles: VirtualSourceFile[]): Project {
  const project = createBaseProject();

  for (const sourceFile of sourceFiles) {
    project.createSourceFile(resolve(sourceFile.filePath), sourceFile.text, {
      overwrite: true,
    });
  }

  return project;
}

export function loadModuleFromFile(filePath: string): unknown {
  return loadConfigModule(filePath);
}

async function findConfigFile(projectRootDir: string): Promise<string | undefined> {
  for (const fileName of CONFIG_FILE_NAMES) {
    const filePath = join(projectRootDir, fileName);

    try {
      await access(filePath, fsConstants.F_OK);
      return filePath;
    } catch {
      continue;
    }
  }

  return undefined;
}

function resolveOptional(
  projectRootDir: string,
  value: string | undefined,
): string | undefined {
  return value ? resolve(projectRootDir, value) : undefined;
}

function resolveDefaultTsconfig(projectRootDir: string): string | undefined {
  const tsconfigPath = join(projectRootDir, "tsconfig.json");
  return existsSync(tsconfigPath) ? tsconfigPath : undefined;
}

function createBaseProject(tsconfigPath?: string): Project {
  return tsconfigPath
    ? new Project({
        tsConfigFilePath: tsconfigPath,
        skipAddingFilesFromTsConfig: true,
      })
    : new Project({
        compilerOptions: {
          target: ScriptTarget.ES2022,
          module: ModuleKind.ESNext,
          moduleResolution: ModuleResolutionKind.NodeJs,
          strict: true,
        },
      });
}

function loadConfigModule(filePath: string): unknown {
  if (extname(filePath) === ".json") {
    return JSON.parse(readFileSync(filePath, "utf8")) as unknown;
  }

  const requireForFile = createRequire(filePath);
  const extensions = requireForFile.extensions as Record<
    string,
    RequireExtension | undefined
  >;
  const previous = new Map<string, RequireExtension | undefined>();
  const transpileExtension: RequireExtension = (module, filename) => {
    module._compile(transpileFile(filename), filename);
  };

  for (const extension of [".ts", ".mts", ".cts"]) {
    previous.set(extension, extensions[extension]);
    extensions[extension] = transpileExtension;
  }

  try {
    const mod = new Module(filePath);
    mod.filename = filePath;
    mod.paths = (
      Module as unknown as {
        _nodeModulePaths(path: string): string[];
      }
    )._nodeModulePaths(dirname(filePath));
    (mod as NodeJS.Module & { require: NodeJS.Require }).require = requireForFile;
    (
      mod as NodeJS.Module & { _compile(code: string, filename: string): void }
    )._compile(transpileFile(filePath), filePath);
    return mod.exports;
  } finally {
    for (const [extension, handler] of previous.entries()) {
      extensions[extension] = handler;
    }
  }
}

function transpileFile(filePath: string): string {
  const source = readFileSync(filePath, "utf8");
  return ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      moduleResolution: ts.ModuleResolutionKind.NodeJs,
      esModuleInterop: true,
      allowJs: true,
      resolveJsonModule: true,
      verbatimModuleSyntax: false,
    },
    fileName: filePath,
  }).outputText;
}

function extractConfigValue(loaded: unknown): TypemockrConfig {
  if (loaded && typeof loaded === "object") {
    const maybeObject = loaded as {
      default?: unknown;
      config?: unknown;
    };
    const value = maybeObject.default ?? maybeObject.config ?? maybeObject;
    if (isTypemockrConfig(value)) {
      return value;
    }
  }

  throw new Error("Config file must export a typemockr config object.");
}

function isTypemockrConfig(value: unknown): value is TypemockrConfig {
  return Boolean(
    value &&
      typeof value === "object" &&
      Array.isArray((value as TypemockrConfig).include) &&
      typeof (value as TypemockrConfig).outDir === "string",
  );
}

function expandProjectWithLocalImports(project: Project) {
  const seen = new Set<string>(
    project.getSourceFiles().map((file) => file.getFilePath()),
  );
  const queue: string[] = [...seen];

  while (queue.length > 0) {
    const filePath = queue.shift();
    if (!filePath) {
      continue;
    }

    const sourceFile = project.getSourceFile(filePath);
    if (!sourceFile) {
      continue;
    }

    const fromDir = dirname(filePath);
    const moduleSpecifiers = [
      ...sourceFile
        .getImportDeclarations()
        .map((declaration) => declaration.getModuleSpecifierValue()),
      ...sourceFile
        .getExportDeclarations()
        .map((declaration) => declaration.getModuleSpecifierValue())
        .filter((value): value is string => Boolean(value)),
    ];

    for (const moduleSpecifier of moduleSpecifiers) {
      if (!moduleSpecifier.startsWith(".")) {
        continue;
      }

      const resolved = resolveModuleToFilePath(fromDir, moduleSpecifier);
      if (!resolved || seen.has(resolved)) {
        continue;
      }

      project.addSourceFileAtPath(
        resolved as Parameters<Project["addSourceFileAtPath"]>[0],
      );
      seen.add(resolved);
      queue.push(resolved);
    }
  }
}

function resolveModuleToFilePath(
  fromDir: string,
  moduleSpecifier: string,
): string | undefined {
  const candidate = resolve(fromDir, moduleSpecifier);
  const extensions = [".ts", ".tsx", ".d.ts", ".js", ".jsx"];

  if (isFile(candidate)) {
    return candidate;
  }

  for (const extension of extensions) {
    if (isFile(candidate + extension)) {
      return candidate + extension;
    }
  }

  if (existsSync(candidate) && statSync(candidate).isDirectory()) {
    for (const extension of extensions) {
      const indexPath = join(candidate, `index${extension}`);
      if (isFile(indexPath)) {
        return indexPath;
      }
    }
  }

  return undefined;
}

function isFile(filePath: string): boolean {
  return existsSync(filePath) && statSync(filePath).isFile();
}
