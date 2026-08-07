import { basename, dirname, extname, join, relative } from "node:path";
import { buildEntityGraph } from "./graph";
import type {
  EntityNode,
  FileModel,
  GeneratedFile,
  GenerationRegistry,
  NormalizedProject,
  ObjectNode,
  ReferenceNode,
  ResolvedTypemockrConfig,
  TypeNode,
  TypemockrOutputFormat,
} from "./types";

interface EmitContext {
  config: ResolvedTypemockrConfig;
  project: NormalizedProject;
  registry: GenerationRegistry;
  outputPathBySource: Map<string, string>;
  graph: Map<string, Set<string>>;
}

interface ImportBinding {
  exportedName: string;
  localName: string;
}

export function emitFiles(
  project: NormalizedProject,
  config: ResolvedTypemockrConfig,
  registry: GenerationRegistry = {},
): GeneratedFile[] {
  const outputPathBySource = new Map(
    project.files.map((file) => [file.sourceFile, getOutputFilePath(config, file.sourceFile)]),
  );
  const context: EmitContext = {
    config,
    project,
    registry,
    outputPathBySource,
    graph: buildEntityGraph(project),
  };

  return project.files.map((file) => {
    const outputFile = outputPathBySource.get(file.sourceFile);
    if (!outputFile) {
      throw new Error(`Missing output file for ${file.sourceFile}`);
    }

    return {
      sourceFile: file.sourceFile,
      outputFile,
      code: emitFile(file, outputFile, context),
      entityNames: file.entities.map((entity) => entity.name),
      format: config.format,
    };
  });
}

export function getOutputFilePath(
  config: ResolvedTypemockrConfig,
  sourceFile: string,
): string {
  const relativeSource = getRelativeSourcePath(config, sourceFile);
  const directory = dirname(relativeSource);
  const fileName = stripSourceExtension(basename(relativeSource));

  return join(
    config.outputRootDir,
    directory === "." ? "" : directory,
    `${fileName}.mock.${config.format}`,
  );
}

function emitFile(file: FileModel, outputFile: string, context: EmitContext): string {
  const externalMockImports = collectExternalMockImports(file, outputFile, context);
  const importLines = [
    'import { faker } from "@faker-js/faker";',
    ...emitTypeImportLines(file, outputFile, context.config.format),
    ...emitExternalMockImportLines(
      externalMockImports,
      outputFile,
      context.outputPathBySource,
      context.config.format,
    ),
  ];
  const body = file.entities
    .map((entity) =>
      emitEntity(entity, {
        ...context,
        file,
        outputFile,
        externalMockImports,
      }),
    )
    .join("\n\n");

  return importLines.length > 0 ? `${importLines.join("\n")}\n\n${body}` : body;
}

function emitTypeImportLines(
  file: FileModel,
  outputFile: string,
  format: TypemockrOutputFormat,
): string[] {
  if (format !== "ts" || file.entities.length === 0) {
    return [];
  }

  return [
    `import type { ${file.entities.map((entity) => entity.name).join(", ")} } from ${quote(
      toTypeModuleSpecifier(outputFile, file.sourceFile),
    )};`,
  ];
}

function emitEntity(
  entity: EntityNode,
  context: EmitContext & {
    file: FileModel;
    outputFile: string;
    externalMockImports: Map<string, ImportBinding>;
  },
): string {
  const docs = context.config.format === "js"
    ? emitJsDoc(entity, context.outputFile)
    : [];
  const signature = emitFunctionSignature(entity, context.config.format);
  const body = emitEntityBody(entity, context);

  return [...docs, signature, ...body, "}"].join("\n");
}

function emitFunctionSignature(
  entity: EntityNode,
  format: TypemockrOutputFormat,
): string {
  const functionName = getMockFunctionName(entity.name);
  const genericParams = format === "ts" ? emitTsGenericParams(entity) : "";
  const params = format === "ts"
    ? emitTsFunctionParams(entity)
    : emitJsFunctionParams(entity);
  const returnType = format === "ts"
    ? `: ${getEntityTypeReference(entity)}`
    : "";

  return `export function ${functionName}${genericParams}(${params})${returnType} {`;
}

function emitTsGenericParams(entity: EntityNode): string {
  if (entity.generics.length === 0) {
    return "";
  }

  return `<${entity.generics.map((generic) => `${generic.name} = any`).join(", ")}>`;
}

function emitTsFunctionParams(entity: EntityNode): string {
  const params: string[] = entity.generics.map(
    (generic) => `mock${generic.name}: () => ${generic.name} = () => ({} as ${generic.name})`,
  );

  if (entity.type.kind === "object") {
    params.push(`overrides: Partial<${getEntityTypeReference(entity)}> = {}`);
  } else {
    params.push(`overrides?: ${getEntityTypeReference(entity)}`);
  }

  if (entity.recursive) {
    params.push("__options: { depth?: number; maxDepth?: number } = {}");
  }

  return params.join(", ");
}

function emitJsFunctionParams(entity: EntityNode): string {
  const params: string[] = entity.generics.map((generic) => `mock${generic.name} = () => ({})`);
  params.push(entity.type.kind === "object" ? "overrides = {}" : "overrides");

  if (entity.recursive) {
    params.push("__options = {}");
  }

  return params.join(", ");
}

function emitJsDoc(entity: EntityNode, outputFile: string): string[] {
  const typeRef = getJsDocEntityTypeReference(entity, outputFile);
  const lines = ["/**"];

  for (const generic of entity.generics) {
    lines.push(` * @template ${generic.name}`);
  }

  for (const generic of entity.generics) {
    lines.push(` * @param {() => ${generic.name}} [mock${generic.name}=() => ({})]`);
  }

  if (entity.type.kind === "object") {
    lines.push(` * @param {Partial<${typeRef}>} [overrides={}]`);
  } else {
    lines.push(` * @param {${typeRef}} [overrides]`);
  }

  if (entity.recursive) {
    lines.push(" * @param {{ depth?: number, maxDepth?: number }} [__options={}]");
  }

  lines.push(` * @returns {${typeRef}}`);
  lines.push(" */");
  return lines;
}

function emitEntityBody(
  entity: EntityNode,
  context: EmitContext & {
    file: FileModel;
    outputFile: string;
    externalMockImports: Map<string, ImportBinding>;
  },
): string[] {
  const ruleLines = getRuleLines(entity, context.registry);

  if (entity.recursive) {
    return [
      "  const { depth = 0, maxDepth = 2 } = __options;",
      "",
      ...emitEntityBodyAfterOptions(entity, context, ruleLines),
    ];
  }

  return emitEntityBodyAfterOptions(entity, context, ruleLines);
}

function emitEntityBodyAfterOptions(
  entity: EntityNode,
  context: EmitContext & {
    file: FileModel;
    outputFile: string;
    externalMockImports: Map<string, ImportBinding>;
  },
  ruleLines: string[],
): string[] {
  if (entity.type.kind === "object") {
    return emitObjectEntityBody(entity, entity.type, context, ruleLines);
  }

  return emitValueEntityBody(entity, entity.type, context);
}

function emitObjectEntityBody(
  entity: EntityNode,
  node: ObjectNode,
  context: EmitContext & {
    file: FileModel;
    outputFile: string;
    externalMockImports: Map<string, ImportBinding>;
  },
  ruleLines: string[],
): string[] {
  const resultLines = emitObjectLiteralLines(entity, node, entity.name, context, 2);

  if (ruleLines.length === 0) {
    return [
      ...resultLines,
      "  return { ...result, ...overrides };",
    ];
  }

  return [
    ...renameLeadingConst(resultLines, "base"),
    "  const result = { ...base, ...overrides };",
    ...indentSnippetLines(ruleLines, 2),
    "  return result;",
  ];
}

function emitValueEntityBody(
  entity: EntityNode,
  node: TypeNode,
  context: EmitContext & {
    file: FileModel;
    outputFile: string;
    externalMockImports: Map<string, ImportBinding>;
  },
): string[] {
  const value = emitValueExpression(entity, node, entity.name, context);
  const typeRef = getEntityTypeReference(entity);

  return [
    context.config.format === "ts"
      ? `  const result: ${typeRef} = ${stripConstAssertion(value)} as ${typeRef};`
      : `  const result = ${value};`,
    "  return overrides ?? result;",
  ];
}

function emitObjectLiteralLines(
  entity: EntityNode,
  node: ObjectNode,
  path: string,
  context: EmitContext & {
    file: FileModel;
    outputFile: string;
    externalMockImports: Map<string, ImportBinding>;
  },
  indent: number,
): string[] {
  const properties = node.properties.map((property) => {
    const value = emitPropertyValue(entity, property, path, context);
    return `${indentText(indent + 2)}${quote(property.name)}: ${value},`;
  });

  if (properties.length === 0) {
    return [
      `${indentText(indent)}const result = {};`,
    ];
  }

  return [
    `${indentText(indent)}const result = {`,
    ...properties,
    `${indentText(indent)}};`,
  ];
}

function emitNestedObjectExpression(
  entity: EntityNode,
  node: ObjectNode,
  path: string,
  context: EmitContext & {
    file: FileModel;
    outputFile: string;
    externalMockImports: Map<string, ImportBinding>;
  },
  indent: number,
): string {
  const properties = node.properties.map((property) => {
    const value = emitPropertyValue(entity, property, path, context);
    return `${indentText(indent + 2)}${quote(property.name)}: ${value},`;
  });

  if (properties.length === 0) {
    return "{}";
  }

  return [
    "{",
    ...properties,
    `${indentText(indent)}}`,
  ].join("\n");
}

function emitPropertyValue(
  entity: EntityNode,
  property: ObjectNode["properties"][number],
  parentPath: string,
  context: EmitContext & {
    file: FileModel;
    outputFile: string;
    externalMockImports: Map<string, ImportBinding>;
  },
): string {
  const path = joinPath(parentPath, property.name);
  const segments = [...parentPath.split(".").slice(1), property.name];
  const direct = resolveRegistryExpression(entity, property.type, path, context.registry);
  const value = direct === undefined
    ? emitDefaultValueExpression(entity, property.type, path, context)
    : applyPropertyTypeAssertion(
        direct,
        entity,
        segments,
        context.config.format,
      );

  if (property.optional && direct === undefined) {
    return `faker.helpers.maybe(() => ${wrapArrowValue(value)})`;
  }

  return value;
}

function emitValueExpression(
  entity: EntityNode,
  node: TypeNode,
  path: string,
  context: EmitContext & {
    file: FileModel;
    outputFile: string;
    externalMockImports: Map<string, ImportBinding>;
  },
): string {
  const custom = resolveRegistryExpression(entity, node, path, context.registry);
  return custom ?? emitDefaultValueExpression(entity, node, path, context);
}

function emitDefaultValueExpression(
  entity: EntityNode,
  node: TypeNode,
  path: string,
  context: EmitContext & {
    file: FileModel;
    outputFile: string;
    externalMockImports: Map<string, ImportBinding>;
  },
): string {
  switch (node.kind) {
    case "scalar":
      return emitScalarExpression(node.scalar);
    case "literal":
      return emitLiteralExpression(node.value, context.config.format);
    case "enum":
      return emitEnumExpression(node.values, context.config.format);
    case "union":
      return `faker.helpers.arrayElement([${node.members
        .map((member) => emitValueExpression(entity, member, path, context))
        .join(", ")}])`;
    case "array":
      return emitArrayExpression(entity, node.element, path, context);
    case "tuple":
      return `[${node.elements
        .map((element, index) => emitValueExpression(entity, element, `${path}.${index}`, context))
        .join(", ")}]`;
    case "object":
      return emitNestedObjectExpression(entity, node, path, context, 4);
    case "reference":
      return emitReferenceExpression(entity, node, path, context);
  }
}

function emitScalarExpression(scalar: string): string {
  switch (scalar) {
    case "string":
      return "faker.lorem.words()";
    case "number":
      return "faker.number.int()";
    case "bigint":
      return "BigInt(faker.number.int())";
    case "boolean":
      return "faker.datatype.boolean()";
    case "symbol":
      return "Symbol(faker.string.alphanumeric())";
    case "null":
      return "null";
    case "undefined":
      return "undefined";
    case "date":
      return "faker.date.recent()";
    case "any":
    case "unknown":
      return "{}";
    default:
      return "undefined";
  }
}

function emitArrayExpression(
  entity: EntityNode,
  element: TypeNode,
  path: string,
  context: EmitContext & {
    file: FileModel;
    outputFile: string;
    externalMockImports: Map<string, ImportBinding>;
  },
): string {
  const value = emitValueExpression(entity, element, `${path}[]`, context);
  const arrayExpression = `faker.helpers.multiple(() => ${wrapArrowValue(value)})`;

  if (
    entity.recursive &&
    element.kind === "reference" &&
    !element.genericParameter &&
    isRecursiveReference(entity, element, context)
  ) {
    return `depth >= maxDepth ? ${emitRecursiveArrayCutoff(entity, path, context.config.format)} : ${arrayExpression}`;
  }

  return arrayExpression;
}

function emitRecursiveArrayCutoff(
  entity: EntityNode,
  path: string,
  format: TypemockrOutputFormat,
): string {
  if (format !== "ts") {
    return "[]";
  }

  return `([] as NonNullable<${emitPathTypeAccess(entity, path)}>)`;
}

function emitReferenceExpression(
  entity: EntityNode,
  node: ReferenceNode,
  path: string,
  context: EmitContext & {
    file: FileModel;
    outputFile: string;
    externalMockImports: Map<string, ImportBinding>;
  },
): string {
  if (node.genericParameter) {
    return `mock${node.name}()`;
  }

  const callee = resolveMockFunctionName(node, context);
  const targetEntity = resolveReferencedEntity(node, context.project);
  const recursive = entity.recursive && isRecursiveReference(entity, node, context);
  const args = emitReferenceArguments(entity, node, targetEntity, path, context, recursive);

  return args.length === 0 ? `${callee}()` : `${callee}(${args.join(", ")})`;
}

function emitReferenceArguments(
  entity: EntityNode,
  node: ReferenceNode,
  targetEntity: EntityNode | undefined,
  path: string,
  context: EmitContext & {
    file: FileModel;
    outputFile: string;
    externalMockImports: Map<string, ImportBinding>;
  },
  includeOptions: boolean,
): string[] {
  const args: string[] = [];
  const targetGenerics = targetEntity?.generics ?? [];
  const needsPadding = includeOptions;

  for (let index = 0; index < targetGenerics.length; index += 1) {
    const generic = targetGenerics[index];
    const typeArgument = node.typeArguments[index];

    if (generic && typeArgument) {
      const expression = emitValueExpression(
        entity,
        typeArgument,
        `${path}<${generic.name}>`,
        context,
      );
      args.push(`() => ${wrapArrowValue(expression)}`);
      continue;
    }

    if (needsPadding) {
      args.push("undefined");
    }
  }

  if (includeOptions) {
    args.push("{}");
    args.push("{ depth: depth + 1, maxDepth }");
  }

  return trimTrailingUndefinedArgs(args, includeOptions);
}

function trimTrailingUndefinedArgs(args: string[], includeOptions: boolean): string[] {
  if (includeOptions) {
    return args;
  }

  const trimmed = [...args];
  while (trimmed.at(-1) === "undefined") {
    trimmed.pop();
  }
  return trimmed;
}

function resolveMockFunctionName(
  node: ReferenceNode,
  context: EmitContext & {
    file: FileModel;
    outputFile: string;
    externalMockImports: Map<string, ImportBinding>;
  },
): string {
  if (!node.sourceFile || node.sourceFile === context.file.sourceFile) {
    return getMockFunctionName(node.name);
  }

  const binding = context.externalMockImports.get(`${node.sourceFile}::${node.name}`);
  return binding?.localName ?? getMockFunctionName(node.name);
}

function collectExternalMockImports(
  file: FileModel,
  outputFile: string,
  context: EmitContext,
): Map<string, ImportBinding> {
  const grouped = new Map<string, ImportBinding>();
  const usedLocalNames = new Set(file.entities.map((entity) => getMockFunctionName(entity.name)));

  const register = (target: EntityNode) => {
    if (target.sourceFile === file.sourceFile) {
      return;
    }

    const key = `${target.sourceFile}::${target.name}`;
    if (grouped.has(key)) {
      return;
    }

    const exportedName = getMockFunctionName(target.name);
    let localName = exportedName;
    let suffix = 2;

    while (usedLocalNames.has(localName)) {
      localName = `${exportedName}_${suffix}`;
      suffix += 1;
    }

    usedLocalNames.add(localName);
    grouped.set(key, {
      exportedName,
      localName,
    });
  };

  for (const entity of file.entities) {
    visitTypeNode(entity.type, (node) => {
      if (
        node.kind !== "reference" ||
        node.genericParameter ||
        !node.sourceFile
      ) {
        return;
      }

      const target = resolveReferencedEntity(node, context.project);
      if (target) {
        register(target);
      }
    });

    for (const snippet of getRegistrySnippetsForEntity(entity, context.registry)) {
      for (const mockName of findMockReferences(snippet)) {
        const target = resolveUniqueEntityByName(mockName, context.project);
        if (target) {
          register(target);
        }
      }
    }
  }

  void outputFile;
  return grouped;
}

function emitExternalMockImportLines(
  bindings: Map<string, ImportBinding>,
  outputFile: string,
  outputPathBySource: Map<string, string>,
  format: TypemockrOutputFormat,
): string[] {
  const grouped = new Map<string, string[]>();

  for (const [key, binding] of bindings.entries()) {
    const separatorIndex = key.lastIndexOf("::");
    const sourceFile = key.slice(0, separatorIndex);
    const targetOutputFile = outputPathBySource.get(sourceFile);
    if (!targetOutputFile) {
      continue;
    }

    const moduleSpecifier = format === "js"
      ? toRuntimeModuleSpecifier(outputFile, targetOutputFile)
      : toTypeModuleSpecifier(outputFile, targetOutputFile);
    const importLine = binding.exportedName === binding.localName
      ? binding.exportedName
      : `${binding.exportedName} as ${binding.localName}`;
    const list = grouped.get(moduleSpecifier) ?? [];
    list.push(importLine);
    grouped.set(moduleSpecifier, list);
  }

  return [...grouped.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(
      ([moduleSpecifier, list]) =>
        `import { ${list.sort().join(", ")} } from ${quote(moduleSpecifier)};`,
    );
}

function visitTypeNode(node: TypeNode, visit: (node: TypeNode) => void) {
  visit(node);

  switch (node.kind) {
    case "array":
      visitTypeNode(node.element, visit);
      return;
    case "tuple":
      node.elements.forEach((element) => visitTypeNode(element, visit));
      return;
    case "union":
      node.members.forEach((member) => visitTypeNode(member, visit));
      return;
    case "object":
      node.properties.forEach((property) => visitTypeNode(property.type, visit));
      if (node.indexSignature) {
        visitTypeNode(node.indexSignature.value, visit);
      }
      return;
    case "reference":
      node.typeArguments.forEach((argument) => visitTypeNode(argument, visit));
      return;
    case "enum":
    case "literal":
    case "scalar":
      return;
  }
}

function resolveRegistryExpression(
  entity: EntityNode,
  node: TypeNode,
  path: string,
  registry: GenerationRegistry,
): string | undefined {
  const mapped = registry.values?.[path];
  if (typeof mapped === "string" && mapped.length > 0) {
    return mapped;
  }

  const provided = registry.provideValue?.({
    kind: node.kind,
    path,
    entityName: entity.name,
    scalar: node.kind === "scalar" ? node.scalar : undefined,
    targetName:
      node.kind === "reference" && !node.genericParameter ? node.name : undefined,
    genericName:
      node.kind === "reference" && node.genericParameter ? node.name : undefined,
  });

  return typeof provided === "string" && provided.length > 0 ? provided : undefined;
}

function getRuleLines(entity: EntityNode, registry: GenerationRegistry): string[] {
  return [
    ...(registry.rules?.["*"] ?? []),
    ...(registry.rules?.[entity.name] ?? []),
  ];
}

function getRegistrySnippetsForEntity(
  entity: EntityNode,
  registry: GenerationRegistry,
): string[] {
  const valueSnippets = Object.entries(registry.values ?? {})
    .filter(([path]) => path === entity.name || path.startsWith(`${entity.name}.`))
    .map(([, value]) => value);

  return [...valueSnippets, ...getRuleLines(entity, registry)];
}

function getEntityTypeReference(entity: EntityNode): string {
  if (entity.generics.length === 0) {
    return entity.name;
  }

  return `${entity.name}<${entity.generics.map((generic) => generic.name).join(", ")}>`;
}

function emitPropertyTypeAccess(entity: EntityNode, segments: string[]): string {
  return `${getEntityTypeReference(entity)}${segments.map((segment) => `[${quote(segment)}]`).join("")}`;
}

function emitPathTypeAccess(entity: EntityNode, path: string): string {
  return emitPropertyTypeAccess(
    entity,
    path
      .split(".")
      .slice(1)
      .map((segment) => segment.replace(/\[\]$/g, "").replace(/<.*$/, "")),
  );
}

function applyPropertyTypeAssertion(
  value: string,
  entity: EntityNode,
  segments: string[],
  format: TypemockrOutputFormat,
): string {
  if (format !== "ts") {
    return value;
  }

  return `(${value}) as ${emitPropertyTypeAccess(entity, segments)}`;
}

function getJsDocEntityTypeReference(entity: EntityNode, outputFile: string): string {
  const moduleSpecifier = toTypeModuleSpecifier(outputFile, entity.sourceFile);
  const genericArgs = entity.generics.length === 0
    ? ""
    : `<${entity.generics.map((generic) => generic.name).join(", ")}>`;

  return `import(${quote(moduleSpecifier)}).${entity.name}${genericArgs}`;
}

function resolveReferencedEntity(
  node: ReferenceNode,
  project: NormalizedProject,
): EntityNode | undefined {
  return node.sourceFile
    ? project.entityBySourceAndName.get(`${node.sourceFile}::${node.name}`)
    : undefined;
}

function resolveUniqueEntityByName(
  name: string,
  project: NormalizedProject,
): EntityNode | undefined {
  const matches = project.entities.filter((entity) => entity.name === name);
  return matches.length === 1 ? matches[0] : undefined;
}

function isRecursiveReference(
  entity: EntityNode,
  node: ReferenceNode,
  context: Pick<EmitContext, "graph" | "project">,
): boolean {
  const target = resolveReferencedEntity(node, context.project);
  if (!target) {
    return false;
  }

  return hasPath(context.graph, target.id, entity.id);
}

function hasPath(
  graph: Map<string, Set<string>>,
  fromId: string,
  toId: string,
): boolean {
  const visited = new Set<string>();
  const queue = [fromId];

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current || visited.has(current)) {
      continue;
    }

    if (current === toId) {
      return true;
    }

    visited.add(current);
    queue.push(...(graph.get(current) ?? []));
  }

  return false;
}

function findMockReferences(code: string): string[] {
  const matches = new Set<string>();

  for (const match of code.matchAll(/\bMock([A-Za-z0-9_]+)\s*\(/g)) {
    const name = match[1];
    if (name) {
      matches.add(name);
    }
  }

  return [...matches];
}

function renameLeadingConst(lines: string[], name: string): string[] {
  if (lines.length === 0) {
    return lines;
  }

  return [
    lines[0]!.replace(/\bconst result\b/, `const ${name}`),
    ...lines.slice(1),
  ];
}

function indentSnippetLines(snippets: string[], indent: number): string[] {
  return snippets.flatMap((snippet) =>
    snippet.split("\n").map((line) => `${indentText(indent)}${line}`),
  );
}

function wrapArrowValue(value: string): string {
  const trimmed = value.trim();
  return trimmed.startsWith("{") ? `(${trimmed})` : trimmed;
}

function joinPath(parent: string, child: string): string {
  return `${parent}.${child}`;
}

function getMockFunctionName(typeName: string): string {
  return `Mock${typeName}`;
}

function quote(value: string): string {
  return JSON.stringify(value);
}

function emitLiteral(value: string | number | boolean | null): string {
  return value === null ? "null" : JSON.stringify(value);
}

// Literal values must keep their literal type, otherwise the untyped `const result = {...}`
// object literal widens them ("draft" -> string, 0 -> number) and no longer satisfies the
// declared entity type.
function emitLiteralExpression(
  value: string | number | boolean | null,
  format: TypemockrOutputFormat,
): string {
  const literal = emitLiteral(value);
  return format === "ts" && value !== null ? `${literal} as const` : literal;
}

function emitEnumExpression(
  values: Array<string | number>,
  format: TypemockrOutputFormat,
): string {
  const list = values.map((value) => emitLiteralExpression(value, format)).join(", ");
  return `faker.helpers.arrayElement([${list}])`;
}

function stripConstAssertion(value: string): string {
  return value.replace(/ as const$/, "");
}

function toTypeModuleSpecifier(fromFile: string, toFile: string): string {
  return toModuleSpecifier(fromFile, toFile, false);
}

function toRuntimeModuleSpecifier(fromFile: string, toFile: string): string {
  return toModuleSpecifier(fromFile, toFile, true);
}

function toModuleSpecifier(
  fromFile: string,
  toFile: string,
  preserveExtension: boolean,
): string {
  const relativePath = relative(dirname(fromFile), toFile).replace(/\\/g, "/");
  const specifier = preserveExtension ? relativePath : stripSourceExtension(relativePath);
  return specifier.startsWith(".") ? specifier : `./${specifier}`;
}

function getRelativeSourcePath(
  config: ResolvedTypemockrConfig,
  sourceFile: string,
): string {
  const defaultRelative = relative(config.projectRootDir, sourceFile);
  const matchingBaseDir = [...config.baseDir]
    .sort((left, right) => right.length - left.length)
    .find((baseDir) => isInside(baseDir, sourceFile));

  if (!matchingBaseDir) {
    return defaultRelative;
  }

  return relative(matchingBaseDir, sourceFile);
}

function isInside(parent: string, child: string): boolean {
  const relativePath = relative(parent, child);
  return relativePath === "" || (!relativePath.startsWith("..") && !relativePath.startsWith("/"));
}

function stripSourceExtension(filePath: string): string {
  const extension = extname(filePath);
  return extension ? filePath.slice(0, -extension.length) : filePath;
}

function indentText(size: number): string {
  return " ".repeat(size);
}
