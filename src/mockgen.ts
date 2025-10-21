import * as fs from "fs";
import * as path from "path";
import {
  Node,
  Project,
  SourceFile,
  Symbol as MorphSymbol,
  SyntaxKind,
  Type,
} from "ts-morph";
import type {
  ASTEntity,
  ASTProperty,
  ASTPropertyValue,
  ASTArrayProperty,
} from "./ast-types";
import { generate } from "./generation";
import {
  getLocation,
  getDocs,
  parseVariableStatement,
  getGenerics,
  isExported,
  typeToAST,
  symbolToASTProperty,
  parseClassOrInterface,
  parseEnum,
  parseTypeAlias,
  parseEntities,
  parseEntitiesForFile,
  buildTypeToSourceFileMap,
  resolveModuleToFilePath,
  expandProjectWithLocalImports,
} from "./parser";
import {
  buildAdjacency,
  computeSCC,
  annotateEntityWithRecursion,
  extractTypeNameFromImportish,
} from "./analyzer";

function ensureDirSync(dir: string) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

// Configurable output path function
function configureOutputPath(destinationPath: string, baseDir: string[]) {
  return baseDir.reduce((result, dir) => {
    const regexp = new RegExp(`^${dir}\/`);
    return result.replace(regexp, "");
  }, destinationPath);
}

function getOutputPathsForSourceFile({
  projectRootDir,
  outputRootDir,
  sourceFile,
  baseDir,
  format = "ts",
}: {
  projectRootDir: string;
  sourceFile: SourceFile;
  outputRootDir: string;
  baseDir: string[];
  format?: "ts" | "jsdoc";
}) {
  // Mirror structure under ./lib/output relative to the input project root
  const relPath = path.relative(projectRootDir, sourceFile.getFilePath());
  const outDir = path.join(
    outputRootDir,
    path.dirname(configureOutputPath(relPath, baseDir))
  );
  let baseName = path.basename(relPath, path.extname(relPath));
  // Remove trailing .d if present
  if (baseName.endsWith(".d")) baseName = baseName.slice(0, -2);

  const astPath = path.join(outDir, `Mock${baseName}.ast.json`);

  const ext = format === "jsdoc" ? ".mock.js" : ".mock.ts";
  // Use baseName.mock.ts/js (no `Mock` prefix in filenames). The exported
  // symbols inside files still use the Mock<...> naming to preserve API.
  const mockPath = path.join(outDir, `${baseName}${ext}`);
  return { outDir, astPath, mockPath };
}

export function generateMocks({
  projectRootDir,
  include,
  outputRootDir,
  baseDir = [],
  mappings,
  mappingProvider,
  format = "ts",
}: {
  projectRootDir: string;
  include: string[];
  outputRootDir: string;
  baseDir?: string[];
  mappings?: Record<string, string[]>;
  mappingProvider?: string;
  format?: "ts" | "jsdoc";
}) {
  const project = new Project({
    tsConfigFilePath: path.join(projectRootDir, "tsconfig.json"),
    skipAddingFilesFromTsConfig: true,
  });
  // Add initial include paths
  project.addSourceFilesAtPaths(include);

  function resolveModuleToFilePath(fromDir: string, moduleSpecifier: string) {
    // Only handle relative paths here
    const spec = moduleSpecifier;
    const base = path.resolve(fromDir, spec);
    const exts = [".ts", ".tsx", ".d.ts", ".js", ".jsx"];

    // If the spec already has an extension and points to a real file, accept it
    try {
      if (fs.existsSync(base) && fs.statSync(base).isFile()) return base;
    } catch {}

    // Try appending extensions
    for (const e of exts) {
      const p = base + e;
      try {
        if (fs.existsSync(p) && fs.statSync(p).isFile()) return p;
      } catch {}
    }

    // Try index files inside the directory
    try {
      if (fs.existsSync(base) && fs.statSync(base).isDirectory()) {
        for (const e of exts) {
          const p = path.join(base, `index${e}`);
          try {
            if (fs.existsSync(p) && fs.statSync(p).isFile()) return p;
          } catch {}
        }
      }
    } catch {}

    return undefined;
  }

  function expandProjectWithLocalImports(proj: Project) {
    const seen = new Set<string>();
    const queue: string[] = [];

    for (const sf of proj.getSourceFiles()) {
      const fp = sf.getFilePath();
      seen.add(fp);
      queue.push(fp);
    }

    while (queue.length) {
      const filePath = queue.shift()!;
      const sf = proj.getSourceFile(filePath);
      if (!sf) continue;
      const fromDir = path.dirname(filePath);

      // Handle both import declarations and export-from declarations
      const importDecls = sf.getImportDeclarations();
      const exportDecls = sf.getExportDeclarations();

      for (const decl of [...importDecls, ...exportDecls]) {
        const moduleSpec = decl.getModuleSpecifierValue?.();
        if (!moduleSpec) continue;
        // Only follow relative imports (./ or ../)
        if (!moduleSpec.startsWith(".") && !moduleSpec.startsWith("/"))
          continue;
        const resolved = resolveModuleToFilePath(fromDir, moduleSpec);
        if (!resolved) continue;
        // Normalize
        const normalized = path.resolve(resolved);
        if (seen.has(normalized)) continue;
        try {
          proj.addSourceFileAtPath(normalized);
          seen.add(normalized);
          queue.push(normalized);
        } catch (err) {
          // ignore resolution errors
        }
      }
    }
  }

  expandProjectWithLocalImports(project);

  const typeToFileMap = buildTypeToSourceFileMap(project);

  // 1) Build a global view of all entities and references
  const allEntities = parseEntities(project, typeToFileMap);

  // Map entity name -> entity for quick lookup
  const entityByName = new Map<string, ASTEntity>();
  for (const e of allEntities) entityByName.set(e.name, e);

  // Build adjacency: entity -> referenced entity names
  const adj = buildAdjacency(allEntities);

  // Compute SCCs to detect cycles
  const sccs = computeSCC(adj);
  const nodeToScc = new Map<string, Set<string>>();
  for (const comp of sccs) {
    const compSet = new Set(comp);
    for (const n of comp) nodeToScc.set(n, compSet);
  }

  // Precompute reachability with memoization
  const reachMemo = new Map<string, Set<string>>();
  function reachableFrom(node: string): Set<string> {
    if (reachMemo.has(node)) return reachMemo.get(node)!;
    const visited = new Set<string>();
    function dfs(n: string) {
      if (visited.has(n)) return;
      visited.add(n);
      const outs = adj.get(n);
      if (!outs) return;
      for (const m of outs) dfs(m);
    }
    dfs(node);
    // Remove self from reach set for clarity (we handle self-loop separately)
    // But keep it if there is an explicit self-edge
    const outs = adj.get(node);
    const hasSelf = outs?.has(node) ?? false;
    if (!hasSelf) visited.delete(node);
    reachMemo.set(node, visited);
    return visited;
  }

  // 2) Process per-file, annotating nodes with recursion metadata from global graph
  const processed = new Set();
  for (const sourceFile of project.getSourceFiles()) {
    const filePath = sourceFile.getFilePath();
    if (processed.has(filePath)) continue;
    processed.add(filePath);
    const { astPath, mockPath } = getOutputPathsForSourceFile({
      sourceFile,
      projectRootDir,
      outputRootDir,
      baseDir,
      format,
    });
    let astNodes = parseEntitiesForFile(sourceFile, typeToFileMap);
    if (!astNodes.length) continue;

    // Annotate this file's entities with recursion metadata
    astNodes = astNodes.map((e) =>
      annotateEntityWithRecursion(e, adj, nodeToScc, reachableFrom)
    );

    // Ensure output directories for astPath and mockPath exist
    ensureDirSync(path.dirname(astPath));
    ensureDirSync(path.dirname(mockPath));

    // Populate inherits[].properties transitively so generators can use them
    // Build a per-file map of entityName -> entity for quick resolution
    const fileEntityMap = new Map<string, ASTEntity>();
    for (const e of astNodes) fileEntityMap.set(e.name, e);

    // Helper: resolve base entity by name and optional location across allEntities or fileEntityMap
    function resolveBaseEntity(
      expr: string,
      loc?: { file: string; line: number }
    ) {
      const baseName = extractTypeNameFromImportish(expr);
      // Prefer exact location match when provided
      if (loc) {
        for (const e of allEntities) {
          if (
            e.name === baseName &&
            e.location?.file &&
            path.resolve(e.location.file) === path.resolve(loc.file)
          )
            return e as any;
        }
      }
      // Prefer current file
      if (fileEntityMap.has(baseName))
        return fileEntityMap.get(baseName) as any;
      // Fallback to global entityByName
      if (entityByName.has(baseName)) return entityByName.get(baseName) as any;
      return undefined;
    }

    // Collect properties transitively with cycle protection
    function collectPropsTransitive(
      startExpr: string,
      startLoc?: { file: string; line: number }
    ) {
      const seen = new Set<string>();
      const out: ASTProperty[] = [];
      function walk(
        expr: string | undefined,
        loc?: { file: string; line: number }
      ) {
        if (!expr) return;
        const baseName = extractTypeNameFromImportish(expr);
        if (seen.has(baseName)) return;
        seen.add(baseName);
        const ent = resolveBaseEntity(expr, loc) as any;
        if (!ent) return;
        // push its properties first (so nearest base's props can be overridden by child if needed)
        if (Array.isArray(ent.properties)) {
          for (const p of ent.properties) {
            // avoid duplicates by property name
            if (!out.some((op) => op.name === p.name)) out.push(p);
          }
        }
        // walk its bases
        for (const b of (ent as any).inherits || []) {
          const bexpr = typeof b === "string" ? b : b.expr;
          const bloc = typeof b === "string" ? undefined : b.location;
          walk(bexpr, bloc);
        }
      }
      walk(startExpr, startLoc);
      return out;
    }

    // For each entity in this file, populate its inherits[].properties
    for (const e of astNodes) {
      if (e.type === "instance" && Array.isArray((e as any).inherits)) {
        for (const inh of (e as any).inherits) {
          const expr = inh?.expr ?? inh;
          const loc = inh?.location;
          const props = collectPropsTransitive(expr, loc);
          if (props.length) inh.properties = props;
        }
      }
    }

    // Write annotated AST
    // fs.writeFileSync(astPath, JSON.stringify(astNodes, null, 2), "utf-8");

    // Generate mocks for this file's AST nodes, passing the typeToFileMap
    const mockCode = generate(
      projectRootDir,
      outputRootDir,
      baseDir,
      astNodes,
      format === "ts", // includeTypes only for TS output
      true,
      mockPath,
      typeToFileMap,
      mappings,
      mappingProvider,
      format
    );
    fs.writeFileSync(mockPath, mockCode, "utf-8");
    // console.log(`Wrote: ${astPath} and ${mockPath}`);
  }
}

// Export for use in generation.ts
export { buildTypeToSourceFileMap, getOutputPathsForSourceFile };
