import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { createVirtualProject, normalizeProject } from "../../src/index";
import { emitFiles } from "../../src/core/emit";
import type {
  EntityNode,
  GenerationRegistry,
  ResolvedTypemockrConfig,
  TypemockrOutputFormat,
  VirtualSourceFile,
} from "../../src/core/types";

export const CASES_ROOT = resolve(new URL("../cases", import.meta.url).pathname);

export function listCaseDirs(): string[] {
  return readdirSync(CASES_ROOT)
    .map((entry) => join(CASES_ROOT, entry))
    .filter((entry) => statSync(entry).isDirectory())
    .sort();
}

export function getCaseName(caseDir: string): string {
  return relative(CASES_ROOT, caseDir);
}

export function normalizeCase(caseDir: string): unknown {
  const project = normalizeProject(createVirtualProject(loadSourceFiles(caseDir)));
  return project.entities.map((entity) => serializeEntity(entity, caseDir));
}

export function renderCase(
  caseDir: string,
  format: TypemockrOutputFormat,
): Record<string, string> {
  const sourceFiles = loadSourceFiles(caseDir);
  const project = normalizeProject(createVirtualProject(sourceFiles));
  const outputRootDir = join(caseDir, "$mock");
  const files = emitFiles(
    project,
    createCaseConfig(caseDir, sourceFiles, outputRootDir, format),
    loadCaseRegistry(caseDir),
  );

  return Object.fromEntries(
    files.map((file) => [
      relative(outputRootDir, file.outputFile).replace(/\\/g, "/"),
      file.code.trim(),
    ]),
  );
}

export function readExpectedAst(caseDir: string): unknown {
  return JSON.parse(readFileSync(join(caseDir, "expected.ast.json"), "utf8")) as unknown;
}

export function readExpectedOutputs(
  caseDir: string,
  format: TypemockrOutputFormat,
  actualPaths: string[],
): Record<string, string> {
  const singleFilePath = join(caseDir, format === "ts" ? "expected.mock.ts" : "expected.mock.js");
  if (existsSync(singleFilePath)) {
    if (actualPaths.length !== 1) {
      throw new Error(
        `${getCaseName(caseDir)} expected a single generated ${format.toUpperCase()} file but produced ${actualPaths.length}.`,
      );
    }

    return {
      [actualPaths[0]!]: readFileSync(singleFilePath, "utf8").trim(),
    };
  }

  return Object.fromEntries(
    actualPaths.map((actualPath) => {
      const expectedPath = join(caseDir, `expected.${actualPath.replace(/\//g, ".")}`);
      return [actualPath, readFileSync(expectedPath, "utf8").trim()];
    }),
  );
}

/** Cases that need registry-provided values drop a `registry.json` next to their `src`. */
function loadCaseRegistry(caseDir: string): GenerationRegistry {
  const registryPath = join(caseDir, "registry.json");
  return existsSync(registryPath)
    ? (JSON.parse(readFileSync(registryPath, "utf8")) as GenerationRegistry)
    : {};
}

function loadSourceFiles(caseDir: string): VirtualSourceFile[] {
  const srcDir = join(caseDir, "src");
  return listFiles(srcDir)
    .filter((filePath) => filePath.endsWith(".ts"))
    .map((filePath) => ({
      filePath,
      text: readFileSync(filePath, "utf8"),
    }));
}

function listFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true })
    .flatMap((entry) => {
      const filePath = join(directory, entry.name);
      return entry.isDirectory() ? listFiles(filePath) : [filePath];
    })
    .sort();
}

function createCaseConfig(
  caseDir: string,
  sourceFiles: VirtualSourceFile[],
  outputRootDir: string,
  format: TypemockrOutputFormat,
): ResolvedTypemockrConfig {
  return {
    projectRootDir: caseDir,
    include: sourceFiles.map((sourceFile) => sourceFile.filePath),
    outputRootDir,
    baseDir: [join(caseDir, "src")],
    format,
    registryFile: undefined,
    tsconfigPath: undefined,
    configFile: undefined,
  };
}

function serializeEntity(entity: EntityNode, caseDir: string) {
  const { sourceFile: _sourceFile, ...rest } = entity;
  return serializeValue(rest as unknown as Record<string, unknown>, caseDir);
}

function serializeValue(value: unknown, caseDir: string): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => serializeValue(item, caseDir));
  }

  if (!value || typeof value !== "object") {
    return value;
  }

  const objectValue = value as Record<string, unknown>;
  const result: Record<string, unknown> = {};

  for (const [key, entry] of Object.entries(objectValue)) {
    if (key === "id") {
      continue;
    }

    if (key === "sourceFile" && typeof entry === "string") {
      result[key] = relative(caseDir, entry).replace(/\\/g, "/");
      continue;
    }

    result[key] = serializeValue(entry, caseDir);
  }

  return result;
}
