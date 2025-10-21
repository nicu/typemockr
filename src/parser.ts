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
  ASTArrayProperty,
  ASTEntity,
  ASTEntityAlias,
  ASTEntityArray,
  ASTEntityConstant,
  ASTEntityEnum,
  ASTEntityInstance,
  ASTEntityPlaceholder,
  ASTEntityPrimitive,
  ASTEntityUnion,
  ASTGenericParameter,
  ASTProperty,
  ASTPropertyValue,
  ASTReferenceProperty,
} from "./ast-types";

export function getLocation(node: Node) {
  const sourceFile = node.getSourceFile();
  const { line } = sourceFile.getLineAndColumnAtPos(node.getPos());
  return { file: sourceFile.getFilePath(), line };
}

export function getDocs(node: Node): string | undefined {
  // Only certain nodes have getJsDocs
  if ("getJsDocs" in node && typeof (node as any).getJsDocs === "function") {
    const docs = (node as any).getJsDocs();
    if (docs.length > 0) {
      return docs
        .map((d: any) => d.getComment && d.getComment())
        .filter(Boolean)
        .join("\n");
    }
  }
  return undefined;
}

export function isExported(node: Node): boolean {
  // @ts-ignore
  return node.isExported?.() || false;
}

export function getGenerics(
  node: Node,
  typeToFileMap?: Map<string, string>,
  currentSourceFile?: SourceFile
): ASTGenericParameter[] | undefined {
  // For classes, interfaces, type aliases
  // @ts-ignore
  const typeParams = node.getTypeParameters?.() || [];
  if (!typeParams.length) return undefined;
  return typeParams.map((tp: any) => ({
    name: tp.getName(),
    constraint: tp.getConstraint
      ? tp.getConstraint()
        ? typeToAST(
            tp.getConstraintOrThrow().getType(),
            typeToFileMap,
            currentSourceFile
          )
        : undefined
      : undefined,
    default: tp.getDefault
      ? tp.getDefault()
        ? typeToAST(
            tp.getDefaultOrThrow().getType(),
            typeToFileMap,
            currentSourceFile
          )
        : undefined
      : undefined,
  }));
}

export function parseVariableStatement(
  node: Node,
  typeToFileMap?: Map<string, string>,
  currentSourceFile?: SourceFile
): ASTEntityConstant[] {
  // Only handle exported constants
  if (!Node.isVariableStatement(node) || !node.isExported()) return [];
  const decls = node.getDeclarations();
  return decls.map((decl) => {
    const name = decl.getName();
    let value: ASTPropertyValue = { type: "primitive", value: "unknown" };
    try {
      value = typeToAST(decl.getType(), typeToFileMap, currentSourceFile);
    } catch {}
    return {
      name,
      type: "constant",
      value,
      isExported: true,
      docs: getDocs(decl),
      // No location for constants
    };
  });
}

export function typeToAST(
  type: Type,
  typeToFileMap?: Map<string, string>,
  currentSourceFile?: SourceFile
): ASTPropertyValue {
  if (type.isString()) return { type: "primitive", value: "string" };
  if (type.isNumber()) return { type: "primitive", value: "number" };
  if (type.isBoolean()) return { type: "primitive", value: "boolean" };
  if (type.isNull()) return { type: "primitive", value: "null" };
  if (type.isUndefined()) return { type: "primitive", value: "undefined" };
  if (type.isAny()) return { type: "primitive", value: "any" };
  // Handle the plain `object` type (no properties, not a literal) before unknown fallback
  if (type.isObject() && type.getProperties().length === 0) {
    const text = type.getText(currentSourceFile);
    if (text === "object") {
      return { type: "primitive", value: "object" };
    }
  }
  if (type.isUnknown()) return { type: "primitive", value: "unknown" };
  if (type.isLiteral()) {
    const lit = type.getLiteralValue();
    const text = type.getText(currentSourceFile);

    // Handle boolean literals specifically (ts-morph bug where getLiteralValue() returns undefined for boolean literals)
    if (text === "true") {
      return { type: "constant", value: true };
    }
    if (text === "false") {
      return { type: "constant", value: false };
    }

    // Only allow string, number, boolean
    if (
      typeof lit === "string" ||
      typeof lit === "number" ||
      typeof lit === "boolean"
    ) {
      return { type: "constant", value: lit };
    }
    // Fallback
    return { type: "primitive", value: "unknown" };
  }

  // Treat Date as a primitive
  const symbol = type.getSymbol();
  // If the type is a named type (class/interface/type alias) and not a built-in, emit a reference
  if (symbol) {
    const name = symbol.getName();
    // Exclude built-in types
    const builtins = [
      "Array",
      "Date",
      "String",
      "Number",
      "Boolean",
      "Object",
      "Record",
      "Promise",
    ];
    if (!builtins.includes(name)) {
      const result: ASTReferenceProperty = { type: "reference", value: name };

      // Try to resolve the type location using the current source file's imports
      let resolvedFilePath = typeToFileMap?.get(name);

      if (currentSourceFile) {
        // Look for import declarations in the current source file
        const importDeclarations = currentSourceFile.getImportDeclarations();
        for (const importDecl of importDeclarations) {
          const namedImports = importDecl.getNamedImports();
          for (const namedImport of namedImports) {
            if (namedImport.getName() === name) {
              // Found the import for this type, resolve the module path
              const moduleSpecifier = importDecl.getModuleSpecifierValue();
              const resolvedModule = importDecl.getModuleSpecifierSourceFile();
              if (resolvedModule) {
                resolvedFilePath = resolvedModule.getFilePath();
                break;
              }
            }
          }
          if (
            resolvedFilePath &&
            resolvedFilePath !== typeToFileMap?.get(name)
          ) {
            break; // Found via imports, use this path
          }
        }
      }

      if (resolvedFilePath) {
        result.location = {
          file: resolvedFilePath,
          line: 1,
        };
      }
      return result;
    }
    if (name === "Date") {
      return { type: "primitive", value: "date" };
    }
  }
  if (type.isUnion()) {
    const unionTypes = type.getUnionTypes();
    const unionValues = unionTypes.map((t) =>
      typeToAST(t, typeToFileMap, currentSourceFile)
    );

    // Check if this is a boolean union (true | false) possibly with undefined
    // This happens with optional boolean properties where TypeScript represents them as boolean | undefined
    const hasTrue = unionValues.some(
      (v) => v.type === "constant" && v.value === true
    );
    const hasFalse = unionValues.some(
      (v) => v.type === "constant" && v.value === false
    );
    const nonBooleanValues = unionValues.filter(
      (v) => !(v.type === "constant" && (v.value === true || v.value === false))
    );

    if (hasTrue && hasFalse) {
      // This is a boolean union, possibly with other types like undefined
      if (nonBooleanValues.length === 0) {
        // Pure boolean union (true | false), simplify to boolean
        return { type: "primitive", value: "boolean" };
      } else if (
        nonBooleanValues.length === 1 &&
        nonBooleanValues[0]?.type === "primitive" &&
        nonBooleanValues[0]?.value === "undefined"
      ) {
        // Optional boolean (boolean | undefined), can still be simplified
        // but we need to keep it as a union for optional handling
        return {
          type: "union",
          value: [
            { type: "primitive", value: "boolean" },
            nonBooleanValues[0]!,
          ],
        };
      }
    }

    return {
      type: "union",
      value: unionValues,
    };
  }
  if (type.isIntersection())
    return {
      type: "intersection",
      value: type
        .getIntersectionTypes()
        .map((t) => typeToAST(t, typeToFileMap, currentSourceFile)),
    };
  if (type.isArray())
    return {
      type: "array",
      value: [
        typeToAST(
          type.getArrayElementTypeOrThrow(),
          typeToFileMap,
          currentSourceFile
        ),
      ],
    };
  if (type.isTuple())
    return {
      type: "tuple",
      value: type
        .getTupleElements()
        .map((t) => typeToAST(t, typeToFileMap, currentSourceFile)),
    };
  if (type.isObject() && type.getProperties().length > 0) {
    // Object literal
    const props = type
      .getProperties()
      .map((symbol) =>
        symbolToASTProperty(symbol, typeToFileMap, currentSourceFile)
      )
      .filter((p): p is ASTProperty => p !== undefined);
    return { type: "object", value: props };
  }
  if (type.getCallSignatures().length > 0) {
    // Function type - guard against missing signature
    const sig = type.getCallSignatures()[0];
    if (sig) {
      return {
        type: "function",
        value: typeToAST(sig.getReturnType(), typeToFileMap, currentSourceFile),
      };
    }
  }
  const targetType = type.getTargetType ? type.getTargetType() : undefined;
  if (
    targetType &&
    targetType.getSymbol &&
    targetType.getSymbol()?.getName() === "Promise"
  ) {
    // Promise<T>
    const typeArgs = type.getTypeArguments();
    return {
      type: "promise",
      value: typeArgs.map((t) =>
        typeToAST(t, typeToFileMap, currentSourceFile)
      ),
    };
  }
  if (type.isEnum()) {
    const values = type
      .getUnionTypes()
      .map((t) => t.getLiteralValue())
      .filter(
        (v): v is string | number =>
          typeof v === "string" || typeof v === "number"
      );
    return { type: "enum", values };
  }
  // Fallback
  return { type: "primitive", value: "unknown" };
}

export function symbolToASTProperty(
  symbol: MorphSymbol,
  typeToFileMap?: Map<string, string>,
  currentSourceFile?: SourceFile
): ASTProperty | undefined {
  const declarations = symbol.getDeclarations();
  const decl = declarations[0];
  const name = symbol.getName();
  const optional = symbol.isOptional?.() || false;
  const docs = decl ? getDocs(decl) : undefined;
  // No location for properties
  const location = undefined;

  // Skip private class properties to avoid assigning to inaccessible members
  if (decl && Node.isPropertyDeclaration(decl)) {
    if (decl.hasModifier(SyntaxKind.PrivateKeyword)) {
      return undefined;
    }
  }

  let value: ASTPropertyValue = { type: "primitive", value: "unknown" };
  try {
    if (decl) {
      let astVal = typeToAST(decl.getType(), typeToFileMap, currentSourceFile);
      // If optional and union with unknown/undefined/null, unwrap
      if (optional && astVal.type === "union" && Array.isArray(astVal.value)) {
        // For optional properties, only remove 'null' and 'undefined' from the union
        // Keep 'unknown' as it might represent the actual intended type
        const filtered = astVal.value.filter(
          (v) =>
            !(
              v.type === "primitive" &&
              (v.value === "null" || v.value === "undefined")
            )
        );
        if (filtered.length === 1 && filtered[0] !== undefined) {
          astVal = filtered[0] as ASTPropertyValue;
        } else {
          astVal = { ...astVal, value: filtered };
        }
      }
      value = astVal;
    }
  } catch {}
  return { name, optional, docs, location, ...value };
}

export function parseClassOrInterface(
  node: Node,
  typeToFileMap?: Map<string, string>,
  currentSourceFile?: SourceFile
): ASTEntityInstance {
  let name = "";
  let properties: ASTProperty[] = [];
  let inherits:
    | Array<{
        expr: string;
        location?: { file: string; line: number };
        properties?: ASTProperty[];
      }>
    | undefined = undefined;
  let instanceKind: "class" | "interface" | undefined = undefined;
  if (Node.isClassDeclaration(node) || Node.isInterfaceDeclaration(node)) {
    name = node.getName() || "";
    instanceKind = Node.isClassDeclaration(node) ? "class" : "interface";
    properties = node
      .getProperties()
      .map((p: any) =>
        symbolToASTProperty(p.getSymbol(), typeToFileMap, currentSourceFile)
      )
      .filter((p: any) => p !== undefined) as any;
    inherits = node.getBaseTypes().map((t: any) => {
      const expr = t.getText();
      // Try to resolve a source location for the base type if possible
      let location: { file: string; line: number } | undefined = undefined;
      try {
        const sym = t.getSymbol ? t.getSymbol() : undefined;
        const decl = sym?.getDeclarations?.()[0];
        if (decl) {
          location = getLocation(decl as any);
        }
      } catch {}
      return { expr, location };
    });
    if (inherits.length === 0) inherits = undefined;
  }
  return {
    name,
    type: "instance",
    instanceKind,
    properties,
    inherits,
    isExported: isExported(node),
    generics: getGenerics(node, typeToFileMap, currentSourceFile),
    docs: getDocs(node),
    location: getLocation(node),
  };
}

export function parseEnum(node: Node): ASTEntityEnum {
  // @ts-ignore
  const name = node.getName();
  // @ts-ignore
  const values = node.getMembers().map((m: any) => m.getName());
  return {
    name,
    type: "enum",
    values,
    isExported: isExported(node),
    docs: getDocs(node),
    location: getLocation(node),
  };
}

export function parseTypeAlias(
  node: Node,
  typeToFileMap?: Map<string, string>,
  currentSourceFile?: SourceFile
): ASTEntity {
  // @ts-ignore
  const name = node.getName();
  // @ts-ignore
  const typeNode = node.getTypeNode();
  const type = node.getType();
  const docs = getDocs(node);
  const location = getLocation(node);
  const isExportedVal = isExported(node);
  // Try to distinguish union, array, alias, etc.
  if (type.isUnion()) {
    const entity: ASTEntityUnion = {
      name,
      type: "union",
      values: type
        .getUnionTypes()
        .map((t) => typeToAST(t, typeToFileMap, currentSourceFile)),
      isExported: isExportedVal,
      docs,
      location,
    };
    return entity;
  }
  if (type.isArray()) {
    const entity: ASTEntityArray = {
      name,
      type: "array",
      value: {
        type: "array",
        value: [
          typeToAST(
            type.getArrayElementTypeOrThrow(),
            typeToFileMap,
            currentSourceFile
          ),
        ],
      },
      isExported: isExportedVal,
      docs,
      // No location for arrays
    };
    return entity;
  }
  if (
    type.isString() ||
    type.isNumber() ||
    type.isBoolean() ||
    type.isNull() ||
    type.isAny() ||
    type.isUnknown()
  ) {
    const entity: ASTEntityPrimitive = {
      name,
      type: "primitive",
      value: typeToAST(type, typeToFileMap, currentSourceFile) as any,
      isExported: isExportedVal,
      docs,
      // No location for primitives
    };
    return entity;
  }
  // If the type is a reference to an unresolved type, emit a placeholder
  const symbol = type.getSymbol();
  if (!symbol) {
    const entity: ASTEntityPlaceholder = {
      name,
      type: "placeholder",
      isExported: isExportedVal,
      docs,
      // No location for placeholders
    };
    return entity;
  }
  // Fallback: alias
  const entity: ASTEntityAlias = {
    name,
    type: "alias",
    entities: [type.getText()],
    isExported: isExportedVal,
    docs,
    location,
  };
  return entity;
}

export function parseEntities(
  project: Project,
  typeToFileMap?: Map<string, string>
) {
  const entities: ASTEntity[] = [];
  for (const sourceFile of project.getSourceFiles()) {
    for (const node of sourceFile.getStatements()) {
      if (Node.isClassDeclaration(node) || Node.isInterfaceDeclaration(node)) {
        entities.push(parseClassOrInterface(node, typeToFileMap, sourceFile));
      } else if (Node.isEnumDeclaration(node)) {
        entities.push(parseEnum(node));
      } else if (Node.isTypeAliasDeclaration(node)) {
        entities.push(parseTypeAlias(node, typeToFileMap, sourceFile));
      } else if (Node.isVariableStatement(node)) {
        entities.push(
          ...parseVariableStatement(node, typeToFileMap, sourceFile)
        );
      }
    }
  }
  return entities;
}

export function parseEntitiesForFile(
  sourceFile: SourceFile,
  typeToFileMap?: Map<string, string>
): ASTEntity[] {
  const entities: ASTEntity[] = [];
  for (const node of sourceFile.getStatements()) {
    if (Node.isClassDeclaration(node) || Node.isInterfaceDeclaration(node)) {
      entities.push(parseClassOrInterface(node, typeToFileMap, sourceFile));
    } else if (Node.isEnumDeclaration(node)) {
      entities.push(parseEnum(node));
    } else if (Node.isTypeAliasDeclaration(node)) {
      entities.push(parseTypeAlias(node, typeToFileMap, sourceFile));
    } else if (Node.isVariableStatement(node)) {
      entities.push(...parseVariableStatement(node, typeToFileMap, sourceFile));
    }
  }
  return entities;
}

export function buildTypeToSourceFileMap(project: Project) {
  const typeToFile = new Map<string, string>();
  for (const sourceFile of project.getSourceFiles()) {
    for (const node of sourceFile.getStatements()) {
      let name;
      if (
        Node.isClassDeclaration(node) ||
        Node.isInterfaceDeclaration(node) ||
        Node.isEnumDeclaration(node) ||
        Node.isTypeAliasDeclaration(node)
      ) {
        // @ts-ignore
        name = node.getName?.();
        if (name && isExported(node)) {
          typeToFile.set(name, sourceFile.getFilePath());
        }
      }
    }
  }
  return typeToFile;
}

export function resolveModuleToFilePath(
  fromDir: string,
  moduleSpecifier: string
) {
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

export function expandProjectWithLocalImports(proj: Project) {
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
      if (!moduleSpec.startsWith(".") && !moduleSpec.startsWith("/")) continue;
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
