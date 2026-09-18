import {
  Node,
  Project,
  SyntaxKind,
  Symbol as MorphSymbol,
  Type,
  type ClassDeclaration,
  type EnumDeclaration,
  type InterfaceDeclaration,
  type SourceFile,
  type TypeAliasDeclaration,
  type TypeParameterDeclaration,
} from "ts-morph";
import { markRecursiveEntities } from "./graph";
import type {
  ArrayNode,
  EntityNode,
  EnumNode,
  EnumSource,
  FileModel,
  GenericParameterNode,
  NormalizedProject,
  ObjectNode,
  PropertyNode,
  ReferenceNode,
  ScalarKind,
  TupleNode,
  TypeNode,
  UnionNode,
} from "./types";

type SupportedDeclaration =
  | ClassDeclaration
  | InterfaceDeclaration
  | TypeAliasDeclaration
  | EnumDeclaration;

interface EntityDefinition {
  id: string;
  name: string;
  sourceFile: string;
  declarationKind: EntityNode["declarationKind"];
  node: SupportedDeclaration;
}

interface NormalizeContext {
  definitions: Map<string, EntityDefinition>;
}

export function normalizeProject(project: Project): NormalizedProject {
  const definitions = collectEntityDefinitions(project);
  const definitionMap = new Map(
    definitions.map((definition) => [
      createSourceAndNameKey(definition.sourceFile, definition.name),
      definition,
    ]),
  );

  const context: NormalizeContext = {
    definitions: definitionMap,
  };

  const entities = definitions.map((definition) => normalizeEntity(definition, context));
  const files = groupEntitiesBySourceFile(entities);
  const normalized: NormalizedProject = {
    files,
    entities,
    entityById: new Map(entities.map((entity) => [entity.id, entity])),
    entityBySourceAndName: new Map(
      entities.map((entity) => [
        createSourceAndNameKey(entity.sourceFile, entity.name),
        entity,
      ]),
    ),
  };

  markRecursiveEntities(normalized);

  return normalized;
}

function collectEntityDefinitions(project: Project): EntityDefinition[] {
  const definitions: EntityDefinition[] = [];

  // Declaration files are regular input: packages such as generated API models often ship
  // nothing but `.d.ts` files, and their `export declare ...` statements are supported below.
  for (const sourceFile of project.getSourceFiles()) {
    for (const statement of sourceFile.getStatements()) {
      if (!isSupportedDeclaration(statement) || !isExported(statement)) {
        continue;
      }

      const name = statement.getName();
      if (!name) {
        continue;
      }

      definitions.push({
        id: createEntityId(sourceFile.getFilePath(), name),
        name,
        sourceFile: sourceFile.getFilePath(),
        declarationKind: getDeclarationKind(statement),
        node: statement,
      });
    }
  }

  return definitions;
}

function normalizeEntity(
  definition: EntityDefinition,
  context: NormalizeContext,
): EntityNode {
  const type =
    definition.declarationKind === "enum"
      ? normalizeEnumDeclaration(definition.node as EnumDeclaration)
      : normalizeType(
          definition.node.getType(),
          context,
          definition.id,
          definition.node,
          true,
        );

  return {
    id: definition.id,
    name: definition.name,
    sourceFile: definition.sourceFile,
    declarationKind: definition.declarationKind,
    type,
    generics: getGenericParameters(definition.node, context, definition.id),
    recursive: false,
  };
}

function normalizeType(
  type: Type,
  context: NormalizeContext,
  currentEntityId: string,
  anchor: Node,
  forceExpand = false,
): TypeNode {
  if (!forceExpand) {
    const reference = resolveEntityReference(type, context, currentEntityId, anchor);
    if (reference) {
      return reference;
    }
  }

  if (isTypeParameter(type)) {
    return {
      kind: "reference",
      name: getTypeParameterName(type) ?? "T",
      sourceFile: undefined,
      genericParameter: true,
      typeArguments: [],
    };
  }

  if (isDateType(type)) {
    return { kind: "scalar", scalar: "date" };
  }

  if (type.isString()) {
    return { kind: "scalar", scalar: "string" };
  }

  if (type.isNumber()) {
    return { kind: "scalar", scalar: "number" };
  }

  if (type.isBigInt()) {
    return { kind: "scalar", scalar: "bigint" };
  }

  if (type.isBoolean()) {
    return { kind: "scalar", scalar: "boolean" };
  }

  if (isSymbolType(type, anchor)) {
    return { kind: "scalar", scalar: "symbol" };
  }

  if (type.isNull()) {
    return { kind: "scalar", scalar: "null" };
  }

  if (type.isUndefined()) {
    return { kind: "scalar", scalar: "undefined" };
  }

  if (type.isAny()) {
    return { kind: "scalar", scalar: "any" };
  }

  if (type.isUnknown() || type.isNever()) {
    return { kind: "scalar", scalar: "unknown" };
  }

  const enumMember = getEnumMember(type);
  if (enumMember) {
    return normalizeEnumMembers(enumMember.declaration, [enumMember], context);
  }

  if (type.isLiteral()) {
    return normalizeLiteralType(type, anchor);
  }

  if (type.isUnion()) {
    return normalizeUnionType(type, context, currentEntityId, anchor);
  }

  if (type.isTuple()) {
    return normalizeTupleType(type, context, currentEntityId, anchor);
  }

  const arrayType = getArrayElementType(type);
  if (arrayType) {
    return {
      kind: "array",
      element: normalizeType(arrayType, context, currentEntityId, anchor),
    };
  }

  if (type.isEnum()) {
    return normalizeEnumType(type, context, anchor);
  }

  if (shouldNormalizeAsObject(type)) {
    return normalizeObjectType(type, context, currentEntityId, anchor);
  }

  return { kind: "scalar", scalar: "unknown" };
}

function normalizeLiteralType(type: Type, anchor: Node): TypeNode {
  const text = type.getText(anchor);

  if (text === "true") {
    return { kind: "literal", value: true };
  }

  if (text === "false") {
    return { kind: "literal", value: false };
  }

  const literal = type.getLiteralValue();
  if (
    typeof literal === "string" ||
    typeof literal === "number" ||
    typeof literal === "boolean"
  ) {
    return { kind: "literal", value: literal };
  }

  return { kind: "scalar", scalar: "unknown" };
}

function normalizeUnionType(
  type: Type,
  context: NormalizeContext,
  currentEntityId: string,
  anchor: Node,
): TypeNode {
  // TS flattens `MyEnum | undefined` into the enum's member types. Regroup those per enum so
  // a whole enum becomes a reference to its mock again instead of a list of bare literals,
  // which a string enum would not accept.
  const items: Array<Type | EnumDeclaration> = [];
  const enumGroups = new Map<EnumDeclaration, EnumMemberInfo[]>();

  for (const member of type.getUnionTypes()) {
    const enumMember = getEnumMember(member);
    if (!enumMember) {
      items.push(member);
      continue;
    }

    const group = enumGroups.get(enumMember.declaration);
    if (group) {
      group.push(enumMember);
    } else {
      enumGroups.set(enumMember.declaration, [enumMember]);
      items.push(enumMember.declaration);
    }
  }

  const members = items
    .map((item) =>
      item instanceof Type
        ? normalizeType(item, context, currentEntityId, anchor)
        : normalizeEnumMembers(item, enumGroups.get(item) ?? [], context),
    )
    .flatMap((member) =>
      member.kind === "union" ? member.members : [member],
    );

  const simplified = simplifyUnionMembers(members);
  if (simplified.length === 1) {
    return simplified[0]!;
  }

  return {
    kind: "union",
    members: simplified,
  };
}

function normalizeTupleType(
  type: Type,
  context: NormalizeContext,
  currentEntityId: string,
  anchor: Node,
): TupleNode {
  return {
    kind: "tuple",
    elements: type
      .getTupleElements()
      .map((element) => normalizeType(element, context, currentEntityId, anchor)),
  };
}

function normalizeObjectType(
  type: Type,
  context: NormalizeContext,
  currentEntityId: string,
  anchor: Node,
): ObjectNode {
  const properties = new Map<string, PropertyNode>();
  let nominal = false;

  for (const symbol of type.getProperties()) {
    const declaration = pickPropertyDeclaration(symbol);
    if (isNonPublicMember(symbol, declaration)) {
      nominal = true;
      continue;
    }

    if (declaration && shouldSkipDeclaration(declaration)) {
      continue;
    }

    const propertyType = symbol.getTypeAtLocation(declaration ?? anchor);
    if (isFunctionType(propertyType)) {
      continue;
    }

    const normalized = normalizePropertyType(
      symbol,
      propertyType,
      context,
      currentEntityId,
      declaration ?? anchor,
    );

    properties.set(symbol.getName(), {
      name: symbol.getName(),
      type: normalized,
      optional: isOptionalProperty(symbol),
      readonly: declaration ? isReadonlyProperty(declaration) : false,
    });
  }

  const stringIndexType = type.getStringIndexType();
  const numberIndexType = type.getNumberIndexType();

  return {
    kind: "object",
    properties: [...properties.values()],
    ...(nominal ? { nominal } : {}),
    indexSignature: stringIndexType
      ? {
          key: "string",
          value: normalizeType(stringIndexType, context, currentEntityId, anchor),
        }
      : numberIndexType
        ? {
            key: "number",
            value: normalizeType(numberIndexType, context, currentEntityId, anchor),
          }
        : undefined,
  };
}

function normalizeEnumDeclaration(declaration: EnumDeclaration): EnumNode {
  return {
    kind: "enum",
    values: declaration
      .getMembers()
      .map((member) => member.getValue())
      .filter(
        (value): value is string | number =>
          typeof value === "string" || typeof value === "number",
      ),
  };
}

function normalizeEnumType(
  type: Type,
  context: NormalizeContext,
  anchor: Node,
): TypeNode {
  const members = type.getUnionTypes().map(getEnumMember);
  const declaration = members[0]?.declaration;
  if (declaration && members.every((member) => member?.declaration === declaration)) {
    return normalizeEnumMembers(declaration, members as EnumMemberInfo[], context);
  }

  const values = type
    .getUnionTypes()
    .map((member) => normalizeLiteralType(member, anchor))
    .filter(
      (member): member is Extract<TypeNode, { kind: "literal" }> =>
        member.kind === "literal",
    )
    .map((member) => member.value)
    .filter(
      (value): value is string | number =>
        typeof value === "string" || typeof value === "number",
    );

  return {
    kind: "enum",
    values,
  };
}

interface EnumMemberInfo {
  declaration: EnumDeclaration;
  name: string;
  value: string | number;
}

function getEnumMember(type: Type): EnumMemberInfo | undefined {
  if (!type.isEnumLiteral()) {
    return undefined;
  }

  const member = type.getSymbol()?.getDeclarations().find(Node.isEnumMember);
  const declaration = member?.getParent();
  const value = member?.getValue();

  if (
    !member ||
    !declaration ||
    !Node.isEnumDeclaration(declaration) ||
    (typeof value !== "string" && typeof value !== "number")
  ) {
    return undefined;
  }

  return { declaration, name: member.getSymbol()?.getName() ?? member.getName(), value };
}

function normalizeEnumMembers(
  declaration: EnumDeclaration,
  members: EnumMemberInfo[],
  context: NormalizeContext,
): TypeNode {
  const name = declaration.getName();
  const sourceFile = declaration.getSourceFile().getFilePath();
  const definition = context.definitions.get(createSourceAndNameKey(sourceFile, name));
  const isWholeEnum = members.length === declaration.getMembers().length;

  if (definition && isWholeEnum) {
    return {
      kind: "reference",
      name: definition.name,
      sourceFile: definition.sourceFile,
      genericParameter: false,
      typeArguments: [],
    };
  }

  const source: EnumSource = {
    name,
    sourceFile,
    exported: declaration.isExported(),
    members: members.map((member) => member.name),
  };

  return {
    kind: "enum",
    values: members.map((member) => member.value),
    source,
  };
}

function normalizePropertyType(
  symbol: MorphSymbol,
  type: Type,
  context: NormalizeContext,
  currentEntityId: string,
  anchor: Node,
): TypeNode {
  const normalized = normalizeType(type, context, currentEntityId, anchor);

  if (!isOptionalProperty(symbol) || normalized.kind !== "union") {
    return normalized;
  }

  const filtered = normalized.members.filter(
    (member) =>
      !(
        member.kind === "scalar" &&
        (member.scalar === "undefined" || member.scalar === "null")
      ),
  );

  if (filtered.length === 1) {
    return filtered[0]!;
  }

  return {
    kind: "union",
    members: filtered,
  };
}

function resolveEntityReference(
  type: Type,
  context: NormalizeContext,
  currentEntityId: string,
  anchor: Node,
): ReferenceNode | undefined {
  for (const symbol of getReferenceSymbols(type)) {
    for (const declaration of symbol.getDeclarations()) {
      const name = getDeclarationName(declaration);
      if (!name) {
        continue;
      }

      const sourceFile = declaration.getSourceFile().getFilePath();
      const definition = context.definitions.get(
        createSourceAndNameKey(sourceFile, name),
      );

      if (!definition) {
        continue;
      }

      const typeArguments = getReferenceTypeArguments(type).map((argument) =>
        normalizeType(argument, context, currentEntityId, anchor),
      );

      return {
        kind: "reference",
        name: definition.name,
        sourceFile: definition.sourceFile,
        genericParameter: false,
        typeArguments,
      };
    }
  }

  return undefined;
}

function getReferenceSymbols(type: Type): MorphSymbol[] {
  const symbols: MorphSymbol[] = [];
  const aliasSymbol = (
    type as unknown as { getAliasSymbol?: () => MorphSymbol | undefined }
  ).getAliasSymbol?.();
  const symbol = type.getSymbol();

  if (aliasSymbol) {
    symbols.push(aliasSymbol);
  }

  if (symbol && !symbols.includes(symbol)) {
    symbols.push(symbol);
  }

  return symbols;
}

function getReferenceTypeArguments(type: Type): Type[] {
  const aliasTypeArguments = (
    type as unknown as { getAliasTypeArguments?: () => Type[] }
  ).getAliasTypeArguments?.();

  if (aliasTypeArguments && aliasTypeArguments.length > 0) {
    return aliasTypeArguments;
  }

  return type.getTypeArguments();
}

function getGenericParameters(
  declaration: SupportedDeclaration,
  context: NormalizeContext,
  currentEntityId: string,
): GenericParameterNode[] {
  if (!Node.isClassDeclaration(declaration) &&
      !Node.isInterfaceDeclaration(declaration) &&
      !Node.isTypeAliasDeclaration(declaration)) {
    return [];
  }

  return declaration.getTypeParameters().map((parameter) =>
    normalizeGenericParameter(parameter, context, currentEntityId),
  );
}

function normalizeGenericParameter(
  parameter: TypeParameterDeclaration,
  context: NormalizeContext,
  currentEntityId: string,
): GenericParameterNode {
  const constraint = parameter.getConstraint();
  const defaultType = parameter.getDefault();

  return {
    name: parameter.getName(),
    constraint: constraint
      ? normalizeType(
          constraint.getType(),
          context,
          currentEntityId,
          constraint,
        )
      : undefined,
    defaultType: defaultType
      ? normalizeType(
          defaultType.getType(),
          context,
          currentEntityId,
          defaultType,
        )
      : undefined,
  };
}

function simplifyUnionMembers(members: TypeNode[]): TypeNode[] {
  const unique = new Map<string, TypeNode>();
  let hasTrue = false;
  let hasFalse = false;

  for (const member of members) {
    if (member.kind === "literal" && typeof member.value === "boolean") {
      hasTrue = hasTrue || member.value === true;
      hasFalse = hasFalse || member.value === false;
      continue;
    }

    unique.set(JSON.stringify(member), member);
  }

  if (hasTrue && hasFalse) {
    unique.set(JSON.stringify({ kind: "scalar", scalar: "boolean" }), {
      kind: "scalar",
      scalar: "boolean",
    });
  } else {
    if (hasTrue) {
      unique.set(JSON.stringify({ kind: "literal", value: true }), {
        kind: "literal",
        value: true,
      });
    }
    if (hasFalse) {
      unique.set(JSON.stringify({ kind: "literal", value: false }), {
        kind: "literal",
        value: false,
      });
    }
  }

  return [...unique.values()];
}

function shouldNormalizeAsObject(type: Type): boolean {
  if (type.getProperties().length > 0) {
    return true;
  }

  if (type.getStringIndexType() || type.getNumberIndexType()) {
    return true;
  }

  return type.isObject() || type.isIntersection();
}

function getArrayElementType(type: Type): Type | undefined {
  if (type.isArray()) {
    return type.getArrayElementType();
  }

  const targetSymbolName = type.getTargetType()?.getSymbol()?.getName();
  if (targetSymbolName === "Array" || targetSymbolName === "ReadonlyArray") {
    return type.getTypeArguments()[0];
  }

  return undefined;
}

function isTypeParameter(type: Type): boolean {
  const declaration = type.getSymbol()?.getDeclarations()[0];
  return Boolean(declaration && Node.isTypeParameterDeclaration(declaration));
}

function getTypeParameterName(type: Type): string | undefined {
  const declaration = type.getSymbol()?.getDeclarations()[0];
  return declaration && Node.isTypeParameterDeclaration(declaration)
    ? declaration.getName()
    : undefined;
}

function isDateType(type: Type): boolean {
  return type.getSymbol()?.getName() === "Date";
}

function isSymbolType(type: Type, anchor: Node): boolean {
  const text = type.getText(anchor);
  return text === "symbol" || text === "unique symbol";
}

function isFunctionType(type: Type): boolean {
  return (
    type.getCallSignatures().length > 0 &&
    type.getProperties().length === 0 &&
    !type.getStringIndexType() &&
    !type.getNumberIndexType()
  );
}

function pickPropertyDeclaration(symbol: MorphSymbol): Node | undefined {
  return (
    symbol
      .getDeclarations()
      .find((declaration) =>
        [
          Node.isPropertyDeclaration,
          Node.isPropertySignature,
          Node.isGetAccessorDeclaration,
          Node.isSetAccessorDeclaration,
        ].some((predicate) => predicate(declaration)),
      ) ?? symbol.getDeclarations()[0]
  );
}

function isNonPublicMember(symbol: MorphSymbol, declaration: Node | undefined): boolean {
  if (symbol.getName().startsWith("#")) {
    return true;
  }

  if (!declaration) {
    return false;
  }

  if (
    Node.isPropertyDeclaration(declaration) ||
    Node.isGetAccessorDeclaration(declaration) ||
    Node.isSetAccessorDeclaration(declaration) ||
    Node.isMethodDeclaration(declaration) ||
    Node.isParameterDeclaration(declaration)
  ) {
    return declaration.hasModifier(SyntaxKind.PrivateKeyword) ||
      declaration.hasModifier(SyntaxKind.ProtectedKeyword);
  }

  return false;
}

function shouldSkipDeclaration(declaration: Node): boolean {
  return (
    Node.isMethodDeclaration(declaration) ||
    Node.isMethodSignature(declaration) ||
    Node.isConstructorDeclaration(declaration)
  );
}

function isOptionalProperty(symbol: MorphSymbol): boolean {
  return Boolean(symbol.isOptional?.());
}

function isReadonlyProperty(declaration: Node): boolean {
  return Boolean(
    Node.isPropertyDeclaration(declaration) ||
      Node.isPropertySignature(declaration)
      ? declaration.isReadonly?.()
      : false,
  );
}

function groupEntitiesBySourceFile(entities: EntityNode[]): FileModel[] {
  const groups = new Map<string, EntityNode[]>();

  for (const entity of entities) {
    const list = groups.get(entity.sourceFile) ?? [];
    list.push(entity);
    groups.set(entity.sourceFile, list);
  }

  return [...groups.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([sourceFile, fileEntities]) => ({
      sourceFile,
      entities: fileEntities.sort((left, right) => left.name.localeCompare(right.name)),
    }));
}

function createEntityId(sourceFile: string, name: string): string {
  return `${sourceFile}::${name}`;
}

function createSourceAndNameKey(sourceFile: string, name: string): string {
  return `${sourceFile}::${name}`;
}

function isSupportedDeclaration(node: Node): node is SupportedDeclaration {
  return (
    Node.isClassDeclaration(node) ||
    Node.isInterfaceDeclaration(node) ||
    Node.isTypeAliasDeclaration(node) ||
    Node.isEnumDeclaration(node)
  );
}

function isExported(node: SupportedDeclaration): boolean {
  return Boolean(node.isExported?.());
}

function getDeclarationKind(
  declaration: SupportedDeclaration,
): EntityNode["declarationKind"] {
  if (Node.isClassDeclaration(declaration)) {
    return "class";
  }

  if (Node.isInterfaceDeclaration(declaration)) {
    return "interface";
  }

  if (Node.isEnumDeclaration(declaration)) {
    return "enum";
  }

  return "typeAlias";
}

function getDeclarationName(declaration: Node): string | undefined {
  if (
    Node.isClassDeclaration(declaration) ||
    Node.isInterfaceDeclaration(declaration) ||
    Node.isTypeAliasDeclaration(declaration) ||
    Node.isEnumDeclaration(declaration)
  ) {
    return declaration.getName() ?? undefined;
  }

  return undefined;
}
