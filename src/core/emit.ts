import { readFileSync } from "node:fs";
import { basename, dirname, extname, join, relative, sep } from "node:path";
import { buildEntityGraph } from "./graph";
import type {
  EntityNode,
  EnumNode,
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
  mockName(entity: Pick<EntityNode, "name" | "sourceFile">): string;
  entitiesByMockName: Map<string, EntityNode[]>;
}

interface ImportBinding {
  exportedName: string;
  localName: string;
}

interface FileEmitContext extends EmitContext {
  file: FileModel;
  outputFile: string;
  externalMockImports: Map<string, ImportBinding>;
  /** Local type names of enums imported for literal casts, keyed by `sourceFile::name`. */
  enumTypeImports: Map<string, string>;
}

const DEFAULT_MOCK_NAME = "Mock{name}";
const IDENTIFIER = /^[A-Za-z_$][A-Za-z0-9_$]*$/;

export function emitFiles(
  project: NormalizedProject,
  config: ResolvedTypemockrConfig,
  registry: GenerationRegistry = {},
): GeneratedFile[] {
  const outputPathBySource = new Map(
    project.files.map((file) => [file.sourceFile, getOutputFilePath(config, file.sourceFile)]),
  );
  assertUniqueOutputFiles(outputPathBySource);

  const mockName = createMockNamer(config);
  const entitiesByMockName = new Map<string, EntityNode[]>();
  for (const entity of project.entities) {
    const name = mockName(entity);
    entitiesByMockName.set(name, [...(entitiesByMockName.get(name) ?? []), entity]);
  }

  for (const file of project.files) {
    const names = file.entities.map((entity) => mockName(entity));
    const duplicate = names.find((name, index) => names.indexOf(name) !== index);
    if (duplicate) {
      throw new Error(
        `mockName produced \`${duplicate}\` for more than one type in ${file.sourceFile}. Include \`{name}\` in the template.`,
      );
    }
  }

  const context: EmitContext = {
    config,
    project,
    registry,
    outputPathBySource,
    graph: buildEntityGraph(project),
    mockName,
    entitiesByMockName,
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

export function createMockNamer(
  config: Pick<ResolvedTypemockrConfig, "mockName" | "baseDir" | "projectRootDir">,
): (entity: Pick<EntityNode, "name" | "sourceFile">) => string {
  const option = config.mockName ?? DEFAULT_MOCK_NAME;
  const cache = new Map<string, string>();

  return ({ name, sourceFile }) => {
    const key = `${sourceFile}::${name}`;
    const cached = cache.get(key);
    if (cached) {
      return cached;
    }

    const dir = toPascalCase(dirname(getRelativeSourcePath(config, sourceFile)));
    const result = typeof option === "function"
      ? option({ name, sourceFile, dir })
      : option.replaceAll("{name}", name).replaceAll("{dir}", dir);

    if (typeof result !== "string" || !IDENTIFIER.test(result)) {
      throw new Error(
        `mockName produced ${JSON.stringify(result)} for ${name} (${sourceFile}), which is not a valid identifier.`,
      );
    }

    cache.set(key, result);
    return result;
  };
}

function assertUniqueOutputFiles(outputPathBySource: Map<string, string>) {
  const sourceByOutput = new Map<string, string>();

  for (const [sourceFile, outputFile] of outputPathBySource) {
    const existing = sourceByOutput.get(outputFile);
    if (existing) {
      throw new Error(
        `${existing} and ${sourceFile} would both generate ${outputFile}. Exclude one of them from \`include\` or adjust \`baseDir\`.`,
      );
    }
    sourceByOutput.set(outputFile, sourceFile);
  }
}

function emitFile(file: FileModel, outputFile: string, context: EmitContext): string {
  const externalMockImports = collectExternalMockImports(file, context);
  const enumTypeImports = collectEnumTypeImports(file, context, externalMockImports);
  const importLines = [
    'import { faker } from "@faker-js/faker";',
    ...emitTypeImportLines(file, outputFile, context.config.format, enumTypeImports),
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
        enumTypeImports,
      }),
    )
    .join("\n\n");

  return importLines.length > 0 ? `${importLines.join("\n")}\n\n${body}` : body;
}

function emitTypeImportLines(
  file: FileModel,
  outputFile: string,
  format: TypemockrOutputFormat,
  enumTypeImports: Map<string, string>,
): string[] {
  if (format !== "ts" || file.entities.length === 0) {
    return [];
  }

  const enumImports = new Map<string, string[]>();

  for (const [key, localName] of enumTypeImports) {
    const separatorIndex = key.lastIndexOf("::");
    const sourceFile = key.slice(0, separatorIndex);
    if (sourceFile === file.sourceFile) {
      // Already imported with the entity types below.
      continue;
    }

    const exportedName = key.slice(separatorIndex + 2);
    const specifier = toSourceModuleSpecifier(outputFile, sourceFile);
    const list = enumImports.get(specifier) ?? [];
    list.push(exportedName === localName ? exportedName : `${exportedName} as ${localName}`);
    enumImports.set(specifier, list);
  }

  return [
    [
      toSourceModuleSpecifier(outputFile, file.sourceFile),
      file.entities.map((entity) => entity.name),
    ] as const,
    ...[...enumImports.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([specifier, names]) => [specifier, names.sort()] as const),
  ].map(
    ([specifier, names]) => `import type { ${names.join(", ")} } from ${quote(specifier)};`,
  );
}

function collectEnumTypeImports(
  file: FileModel,
  context: EmitContext,
  externalMockImports: Map<string, ImportBinding>,
): Map<string, string> {
  const imports = new Map<string, string>();
  if (context.config.format !== "ts") {
    return imports;
  }

  const fileTypeNames = new Set(file.entities.map((entity) => entity.name));
  const usedNames = new Set([
    ...fileTypeNames,
    ...file.entities.map((entity) => context.mockName(entity)),
    ...[...externalMockImports.values()].map((binding) => binding.localName),
  ]);

  for (const entity of file.entities) {
    visitTypeNode(entity.type, (node) => {
      const source = node.kind === "enum" ? node.source : undefined;
      if (!source?.exported) {
        return;
      }

      const key = `${source.sourceFile}::${source.name}`;
      if (imports.has(key)) {
        return;
      }

      // Exported enums declared in this file are already imported with the entity types.
      if (source.sourceFile === file.sourceFile && fileTypeNames.has(source.name)) {
        imports.set(key, source.name);
        return;
      }

      let localName = source.name;
      let suffix = 2;
      while (usedNames.has(localName)) {
        localName = `${source.name}_${suffix}`;
        suffix += 1;
      }

      usedNames.add(localName);
      imports.set(key, localName);
    });
  }

  return imports;
}

function emitEntity(
  entity: EntityNode,
  context: FileEmitContext,
): string {
  const docs = context.config.format === "js"
    ? emitJsDoc(entity, context.outputFile)
    : [];
  const signature = emitFunctionSignature(entity, context.config.format, context.mockName);
  const body = emitEntityBody(entity, context);

  return [...docs, signature, ...body, "}"].join("\n");
}

function emitFunctionSignature(
  entity: EntityNode,
  format: TypemockrOutputFormat,
  mockName: EmitContext["mockName"],
): string {
  const functionName = mockName(entity);
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
  context: FileEmitContext,
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
  context: FileEmitContext,
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
  context: FileEmitContext,
  ruleLines: string[],
): string[] {
  const resultLines = emitObjectLiteralLines(entity, node, entity.name, context, 2);
  // Classes with private/protected members can't be satisfied by an object literal.
  const assertion = node.nominal && context.config.format === "ts"
    ? ` as ${getEntityTypeReference(entity)}`
    : "";

  if (ruleLines.length === 0) {
    return [
      ...resultLines,
      `  return { ...result, ...overrides }${assertion};`,
    ];
  }

  return [
    ...renameLeadingConst(resultLines, "base"),
    `  const result = { ...base, ...overrides }${assertion};`,
    ...indentSnippetLines(ruleLines, 2),
    "  return result;",
  ];
}

function emitValueEntityBody(
  entity: EntityNode,
  node: TypeNode,
  context: FileEmitContext,
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
  context: FileEmitContext,
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
  context: FileEmitContext,
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
  context: FileEmitContext,
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
  context: FileEmitContext,
): string {
  const custom = resolveRegistryExpression(entity, node, path, context.registry);
  return custom ?? emitDefaultValueExpression(entity, node, path, context);
}

function emitDefaultValueExpression(
  entity: EntityNode,
  node: TypeNode,
  path: string,
  context: FileEmitContext,
): string {
  switch (node.kind) {
    case "scalar":
      return emitScalarExpression(node.scalar);
    case "literal":
      return emitLiteralExpression(node.value, context.config.format);
    case "enum":
      return emitEnumExpression(node, context);
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
  context: FileEmitContext,
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

  const access = emitPathTypeAccess(entity, path);

  return access === undefined ? "[]" : `([] as NonNullable<${access}>)`;
}

function emitReferenceExpression(
  entity: EntityNode,
  node: ReferenceNode,
  path: string,
  context: FileEmitContext,
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
  context: FileEmitContext,
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
  context: FileEmitContext,
): string {
  const target = resolveReferencedEntity(node, context.project);
  const ownName = context.mockName(target ?? { name: node.name, sourceFile: node.sourceFile ?? "" });

  if (!node.sourceFile || node.sourceFile === context.file.sourceFile) {
    return ownName;
  }

  const binding = context.externalMockImports.get(`${node.sourceFile}::${node.name}`);
  return binding?.localName ?? ownName;
}

function collectExternalMockImports(
  file: FileModel,
  context: EmitContext,
): Map<string, ImportBinding> {
  const grouped = new Map<string, ImportBinding>();
  const usedLocalNames = new Set(file.entities.map((entity) => context.mockName(entity)));

  const register = (target: EntityNode) => {
    if (target.sourceFile === file.sourceFile) {
      return;
    }

    const key = `${target.sourceFile}::${target.name}`;
    if (grouped.has(key)) {
      return;
    }

    const exportedName = context.mockName(target);
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
      for (const target of findMockReferences(snippet, context.entitiesByMockName)) {
        register(target);
      }
    }
  }

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
    sourceFile: entity.sourceFile,
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

/**
 * Builds the indexed access that names the type at `segments`, e.g. `Foo["items"]`.
 *
 * Every step but the first indexes into whatever the previous one produced, and that may be
 * optional (`prop?:`) or an array we still have to unwrap, so each target is wrapped in
 * `NonNullable<>` before being indexed. The wrapper is a no-op on a type that is not nullable, so
 * the required case keeps the same meaning. The entity itself is never nullable, so the first
 * index stays bare.
 *
 * Returns `undefined` when no sound access exists — a generic type argument (`box<T>`) is reached
 * through the target's own generic parameter, not by indexing the entity.
 */
function emitPropertyTypeAccess(entity: EntityNode, segments: string[]): string | undefined {
  let access = getEntityTypeReference(entity);
  let nullable = false;

  for (const segment of segments) {
    if (segment.includes("<")) {
      return undefined;
    }

    const name = segment.replace(/(?:\[\])*$/, "");
    const arrayDepth = (segment.length - name.length) / 2;

    access = `${nullable ? `NonNullable<${access}>` : access}[${quote(name)}]`;
    for (let depth = 0; depth < arrayDepth; depth += 1) {
      access = `NonNullable<${access}>[number]`;
    }

    nullable = true;
  }

  return access;
}

function emitPathTypeAccess(entity: EntityNode, path: string): string | undefined {
  return emitPropertyTypeAccess(entity, path.split(".").slice(1));
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

  const access = emitPropertyTypeAccess(entity, segments);

  return access === undefined ? value : `(${value}) as ${access}`;
}

function getJsDocEntityTypeReference(entity: EntityNode, outputFile: string): string {
  const moduleSpecifier = toSourceModuleSpecifier(outputFile, entity.sourceFile);
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

// Finds calls to generated mocks in registry snippets. Names shared by several types are
// ambiguous and left for the snippet author to import.
function findMockReferences(
  code: string,
  entitiesByMockName: Map<string, EntityNode[]>,
): EntityNode[] {
  const matches = new Set<EntityNode>();

  for (const match of code.matchAll(/(?<![\w$.])([A-Za-z_$][\w$]*)\s*\(/g)) {
    const candidates = match[1] ? entitiesByMockName.get(match[1]) : undefined;
    if (candidates?.length === 1) {
      matches.add(candidates[0]!);
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

// String enums reject plain literals, so TS output casts each value to its enum member
// (`"Active" as Status.Active`). Enums that can't be imported fall back to `never`.
function emitEnumExpression(node: EnumNode, context: FileEmitContext): string {
  const source = node.source;
  const typeName = source
    ? context.enumTypeImports.get(`${source.sourceFile}::${source.name}`)
    : undefined;

  const list = node.values
    .map((value, index) => {
      if (context.config.format !== "ts" || !source) {
        return emitLiteralExpression(value, context.config.format);
      }

      if (!typeName) {
        return `${emitLiteral(value)} as never`;
      }

      const member = source.members[index];
      if (member === undefined) {
        return `${emitLiteral(value)} as ${typeName}`;
      }

      return IDENTIFIER.test(member)
        ? `${emitLiteral(value)} as ${typeName}.${member}`
        : `${emitLiteral(value)} as (typeof ${typeName})[${quote(member)}]`;
    })
    .join(", ");
  return `faker.helpers.arrayElement([${list}])`;
}

function stripConstAssertion(value: string): string {
  return value.replace(/ as const$/, "");
}

function toTypeModuleSpecifier(fromFile: string, toFile: string): string {
  return toModuleSpecifier(fromFile, toFile, false);
}

// Types from installed packages are imported by package name, e.g.
// `node_modules/@acme/models/lib/Cart.d.ts` -> `@acme/models/lib/Cart`.
function toSourceModuleSpecifier(fromFile: string, sourceFile: string): string {
  return getPackageModuleSpecifier(sourceFile) ?? toTypeModuleSpecifier(fromFile, sourceFile);
}

const packageEntryCache = new Map<string, string | undefined>();

export function getPackageModuleSpecifier(sourceFile: string): string | undefined {
  const normalized = sourceFile.split(sep).join("/");
  const marker = "/node_modules/";
  const index = normalized.lastIndexOf(marker);
  if (index === -1) {
    return undefined;
  }

  const segments = normalized.slice(index + marker.length).split("/");
  const nameLength = segments[0]?.startsWith("@") ? 2 : 1;
  if (segments.length <= nameLength) {
    return undefined;
  }

  const packageDir = normalized.slice(0, index + marker.length) +
    segments.slice(0, nameLength).join("/");
  const packageName = toImportablePackageName(segments.slice(0, nameLength).join("/"));
  const subpath = stripSourceExtension(segments.slice(nameLength).join("/"));

  return subpath === getPackageTypesEntry(packageDir)
    ? packageName
    : `${packageName}/${subpath}`;
}

function toImportablePackageName(packageName: string): string {
  if (!packageName.startsWith("@types/")) {
    return packageName;
  }

  const name = packageName.slice("@types/".length);
  return name.includes("__") ? `@${name.replace("__", "/")}` : name;
}

function getPackageTypesEntry(packageDir: string): string | undefined {
  if (packageEntryCache.has(packageDir)) {
    return packageEntryCache.get(packageDir);
  }

  let entry: string | undefined;
  try {
    const manifest = JSON.parse(readFileSync(join(packageDir, "package.json"), "utf8")) as {
      types?: unknown;
      typings?: unknown;
    };
    const types = manifest.types ?? manifest.typings ?? "index.d.ts";
    entry = typeof types === "string"
      ? stripSourceExtension(types.replace(/^\.\//, ""))
      : undefined;
  } catch {
    entry = "index";
  }

  packageEntryCache.set(packageDir, entry);
  return entry;
}

function toPascalCase(directory: string): string {
  return directory
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean)
    .map((segment) => segment[0]!.toUpperCase() + segment.slice(1))
    .join("");
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
  config: Pick<ResolvedTypemockrConfig, "baseDir" | "projectRootDir">,
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
  const declaration = /\.d\.[cm]?ts$/.exec(filePath);
  if (declaration) {
    return filePath.slice(0, -declaration[0].length);
  }

  const extension = extname(filePath);
  return extension ? filePath.slice(0, -extension.length) : filePath;
}

function indentText(size: number): string {
  return " ".repeat(size);
}
