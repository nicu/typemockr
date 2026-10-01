import { dirname, resolve } from "node:path";
import { Node, type Project } from "ts-morph";
import { createValueContext, getSourceLocationTokens, lookupRegistryValue } from "./emit";
import { loadRegistry } from "./generate";
import { createProject, loadConfig, resolveConfig } from "./load";
import { normalizeProject } from "./normalize";
import type { DriftRecorder } from "./report";
import type {
  EntityNode,
  EnumNode,
  MappingEntry,
  NormalizedProject,
  ObjectNode,
  ReferenceNode,
  ResolvedTypemockrConfig,
  TypeNode,
  TypemockrConfig,
} from "./types";

export type LeafKind = "string" | "number" | "boolean" | "date" | "enum" | "null" | "unknown";

export interface LeafMapping {
  /** The expression generation would emit, with `{sourceNamespace}`-style tokens substituted. */
  value: string;
  source?: string;
  /** The entry's path glob, or the exact path for `registry.values` and `provideValue` hits. */
  path: string;
  /** Index into `mappings` when the value came from an array-form mapping entry. */
  index?: number;
}

export interface Leaf {
  path: string;
  modelPath: string;
  source: string;
  kind: LeafKind;
  enumName?: string;
  value: unknown;
  mapping?: LeafMapping;
}

export type DriftKind =
  | "key-mismatch"
  | "missing-required"
  | "unmodelled"
  | "type-mismatch"
  | "null-for-optional"
  | "string-for-date"
  | "enum-mismatch"
  | "unknown-discriminator";

export type FieldKind =
  | "string"
  | "number"
  | "boolean"
  | "date"
  | "enum"
  | "array"
  | "object"
  | "null"
  | "union"
  | "unknown";

/** A declared type, reduced to what a caller needs to produce a value for it. */
export interface FieldType {
  kind: FieldKind;
  /** The model type's name: the class, enum or alias the field is declared as. */
  name?: string;
  /** Declaring file of `name`, relative to `baseDir` without extension. */
  source?: string;
  values?: Array<string | number>;
  element?: FieldType;
  /** The declaration was `T | null`. */
  nullable?: boolean;
}

export interface Drift {
  path: string;
  kind: DriftKind;
  modelPath?: string;
  expected?: string;
  actual?: string;
  /** What the path alone does not say: why a subclass could not be selected, how the keys differ. */
  note?: string;
  /** `missing-required` only: the declared type of the absent field. */
  type?: FieldType;
  /** `missing-required` only: declaring file of the field's owner, as in `Leaf.source`. */
  source?: string;
}

/** An object walked as something other than its declared type, without a `$type` saying so. */
export interface InferredType {
  path: string;
  declared: string;
  type: string;
  /** Declaring file of `type`, relative to `baseDir` without extension. */
  source: string;
  by: "keys" | "hint";
}

export interface DriftGroup {
  kind: DriftKind;
  modelPath: string;
  count: number;
  /** How many instances of the field's owner were walked, when known. */
  total?: number;
  /** JSON path of the first occurrence. */
  example: string;
  /** What this kind of drift is, shared by every group of the kind: the text output's block heading. */
  heading: string;
  /** What the model or the JSON has there, as the text output's detail column; absent when the heading says it all. */
  detail?: string;
  /** The first occurrence's note. */
  note?: string;
  message: string;
  /** `missing-required` only, as on `Drift`. */
  type?: FieldType;
  source?: string;
}

export interface WalkResult {
  leaves: Leaf[];
  drift: Drift[];
  /** How many times each model path was walked, present or not: the denominator for drift counts. */
  seen: Record<string, number>;
  inferred: InferredType[];
}

export interface FormatDriftOptions {
  /** One line per occurrence instead of one per `kind + modelPath`. */
  all?: boolean;
  /** `WalkResult.seen`, for "in 4 of 8". */
  seen?: Record<string, number>;
}

export type WalkConfigOption = string | TypemockrConfig | ResolvedTypemockrConfig;

export interface WalkerOptions {
  /** Config path (relative paths inside it resolve from its directory), object, or discovery when omitted. */
  config?: WalkConfigOption;
  /** Where to discover a config, and what a relative `config` path is relative to. Defaults to cwd. */
  cwd?: string;
  /**
   * The type to walk the object at a JSON path as, for a subclass the API sends without a `$type`:
   * `{ content: "Store/Magazine/MagazineContent", "payments[]": "Store/Payment/GiftCard#GiftCard" }`. Paths are
   * drift paths; `[]` matches every index. Wins over `$type` and over inference.
   */
  types?: TypeHints;
}

export type TypeHints = Record<string, string>;

export interface WalkInputOptions {
  /** Merged over the walker's own `types`. */
  types?: TypeHints;
}

export interface WalkOptions extends WalkerOptions {
  /** Declaring file relative to `baseDir` without extension, optionally `#TypeName`. */
  model: string;
  input: unknown;
}

export interface Walker {
  config: ResolvedTypemockrConfig;
  walk(model: string, input: unknown, options?: WalkInputOptions): WalkResult;
}

const DISCRIMINATOR_KEYS = ["$type", "$Type"] as const;
const MAX_DEPTH = 64;
const ISO_DATE =
  /^\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?)?$/;

/** Loads the project once; reuse the walker for many inputs. */
export async function createWalker(options: WalkerOptions = {}): Promise<Walker> {
  const config = await resolveWalkConfig(options.config, options.cwd);
  const tsProject = createProject(config);
  const project = normalizeProject(tsProject);

  // Legacy mappings report the entry they matched through the drift recorder; capture it so a
  // leaf can name its entry, without a second matcher implementation.
  let entries: ReadonlyArray<MappingEntry> = [];
  let matchedIndex: number | undefined;
  const recorder: DriftRecorder = {
    registerMappings(next) {
      entries = next;
    },
    mappingMatched(index) {
      matchedIndex = index;
    },
    scalarResolved() {},
    scalarFellThrough() {},
    build: () => ({ mismatches: [], defaults: [], deadMappings: [] }),
  };
  const registry = loadRegistry(config, recorder);

  const index = createProjectIndex(config, project, tsProject);

  const lookup = (entity: EntityNode, node: TypeNode, path: string): LeafMapping | undefined => {
    matchedIndex = undefined;
    const hit = lookupRegistryValue(registry, createValueContext(config, entity, node, path));
    if (!hit) {
      return undefined;
    }
    if (hit.via === "values") {
      return { value: hit.resolved.value, path };
    }
    const entry = matchedIndex === undefined ? undefined : entries[matchedIndex];
    if (entry && matchedIndex !== undefined) {
      return {
        value: hit.resolved.value,
        ...(entry.source !== undefined ? { source: entry.source } : {}),
        path: entry.path ?? "*",
        index: matchedIndex,
      };
    }
    return { value: hit.resolved.value, path };
  };

  return {
    config,
    walk(model, input, walkOptions = {}) {
      const hints = new Map<string, EntityNode>();
      for (const [path, type] of Object.entries({ ...options.types, ...walkOptions.types })) {
        hints.set(path.replace(/^\$\.?/, ""), resolveModel(index, type));
      }
      return walkInput(index, lookup, resolveModel(index, model), input, hints);
    },
  };
}

export async function walk(options: WalkOptions): Promise<WalkResult> {
  const walker = await createWalker(options);
  return walker.walk(options.model, options.input);
}

async function resolveWalkConfig(
  config: WalkConfigOption | undefined,
  cwd = process.cwd(),
): Promise<ResolvedTypemockrConfig> {
  if (config === undefined) {
    return loadConfig(cwd);
  }
  if (typeof config === "string") {
    const file = resolve(cwd, config);
    return loadConfig(dirname(file), file);
  }
  if ("outputRootDir" in config) {
    return config;
  }
  // `outDir` is irrelevant to walking; don't make object configs invent one.
  return resolveConfig({ ...config, outDir: config.outDir ?? "." });
}

interface ProjectIndex {
  project: NormalizedProject;
  sourcePathOf(entity: EntityNode): string;
  bySourcePath: Map<string, EntityNode[]>;
  findByDiscriminator(value: string): EntityNode | undefined;
  isAssignable(entity: EntityNode, to: EntityNode): boolean;
  enumMemberNames(entity: EntityNode): string[];
  subclassesOf(entity: EntityNode): EntityNode[];
  propertyNames(entity: EntityNode): Set<string>;
}

function createProjectIndex(
  config: ResolvedTypemockrConfig,
  project: NormalizedProject,
  tsProject: Project,
): ProjectIndex {
  const sourcePathOf = (entity: EntityNode) =>
    getSourceLocationTokens(config, entity.sourceFile).sourcePath;
  const bySourcePath = new Map<string, EntityNode[]>();
  const byNamespace = new Map<string, EntityNode>();

  for (const entity of project.entities) {
    const tokens = getSourceLocationTokens(config, entity.sourceFile);
    bySourcePath.set(tokens.sourcePath, [...(bySourcePath.get(tokens.sourcePath) ?? []), entity]);
    if (entity.declarationKind === "class" || entity.declarationKind === "interface") {
      const namespace = [tokens.sourceDir.split("/").join("."), entity.name]
        .filter(Boolean)
        .join(".")
        .toLowerCase();
      if (!byNamespace.has(namespace)) {
        byNamespace.set(namespace, entity);
      }
    }
  }

  const ancestorCache = new Map<string, Set<string>>();
  const ancestors = (entity: EntityNode): Set<string> => {
    const cached = ancestorCache.get(entity.id);
    if (cached) {
      return cached;
    }
    const result = new Set<string>();
    ancestorCache.set(entity.id, result);
    const sourceFile = tsProject.getSourceFile(entity.sourceFile);
    const queue: Node[] = [
      ...[sourceFile?.getClass(entity.name), sourceFile?.getInterface(entity.name)].filter(
        (node): node is NonNullable<typeof node> => Boolean(node),
      ),
    ];
    while (queue.length > 0) {
      const declaration = queue.shift()!;
      for (const base of directBases(declaration)) {
        const name = Node.hasName(base) ? base.getName() : undefined;
        const id = name ? `${base.getSourceFile().getFilePath()}::${name}` : undefined;
        if (id && !result.has(id)) {
          result.add(id);
          queue.push(base);
        }
      }
    }
    return result;
  };

  const isAssignable = (entity: EntityNode, to: EntityNode) =>
    entity.id === to.id || ancestors(entity).has(to.id);
  const subclassCache = new Map<string, EntityNode[]>();
  const propertyNameCache = new Map<string, Set<string>>();

  return {
    project,
    sourcePathOf,
    bySourcePath,
    subclassesOf(entity) {
      let subclasses = subclassCache.get(entity.id);
      if (!subclasses) {
        subclasses = project.entities.filter(
          (candidate) =>
            candidate.id !== entity.id &&
            candidate.type.kind === "object" &&
            (candidate.declarationKind === "class" || candidate.declarationKind === "interface") &&
            isAssignable(candidate, entity),
        );
        subclassCache.set(entity.id, subclasses);
      }
      return subclasses;
    },
    propertyNames(entity) {
      let names = propertyNameCache.get(entity.id);
      if (!names) {
        names = new Set(
          entity.type.kind === "object" ? entity.type.properties.map((property) => property.name) : [],
        );
        propertyNameCache.set(entity.id, names);
      }
      return names;
    },
    findByDiscriminator(value) {
      // .NET writes `Namespace.Type, Assembly` and `Generic`1[[...]]`; the type path is the prefix.
      const segments = value.split(/[,`[]/)[0]!.trim().split(".");
      for (let start = 0; start < segments.length; start += 1) {
        const hit = byNamespace.get(segments.slice(start).join(".").toLowerCase());
        if (hit) {
          return hit;
        }
      }
      return undefined;
    },
    isAssignable,
    enumMemberNames(entity) {
      return (
        tsProject
          .getSourceFile(entity.sourceFile)
          ?.getEnum(entity.name)
          ?.getMembers()
          .map((member) => member.getName()) ?? []
      );
    },
  };
}

function directBases(declaration: Node): Node[] {
  if (Node.isClassDeclaration(declaration)) {
    const bases: Node[] = [];
    const base = declaration.getBaseClass();
    if (base) {
      bases.push(base);
    }
    for (const implemented of declaration.getImplements()) {
      bases.push(...(implemented.getType().getSymbol()?.getDeclarations() ?? []));
    }
    return bases;
  }
  if (Node.isInterfaceDeclaration(declaration)) {
    return declaration.getBaseDeclarations();
  }
  return [];
}

function resolveModel(index: ProjectIndex, model: string): EntityNode {
  const [rawPath, typeName] = model.split("#");
  const sourcePath = rawPath!.replace(/\\/g, "/").replace(/^\/+/, "").replace(/(\.d)?\.[cm]?tsx?$/, "");
  const candidates = index.bySourcePath.get(sourcePath) ?? [];

  if (candidates.length === 0) {
    throw new Error(`No declarations found for model "${sourcePath}" (relative to baseDir, without extension).`);
  }

  const baseName = sourcePath.split("/").pop();
  const entity = typeName
    ? candidates.find((candidate) => candidate.name === typeName)
    : candidates.find((candidate) => candidate.name === baseName) ??
      (candidates.length === 1 ? candidates[0] : undefined);

  if (!entity) {
    throw new Error(
      `Model "${model}" is ambiguous or missing; ${sourcePath} exports ${candidates
        .map((candidate) => candidate.name)
        .join(", ")}. Use "${sourcePath}#TypeName".`,
    );
  }

  return entity;
}

type Bindings = Map<string, { node: TypeNode; bindings: Bindings }>;

interface Position {
  /** Entity whose mock would emit this value: leaves are reported under it. */
  entity: EntityNode;
  modelPath: string;
  /**
   * Where generation would look this value up. Same as entity/modelPath except inside a non-object
   * alias or enum entity, whose mock is its own function with its own root path.
   */
  lookupEntity: EntityNode;
  lookupPath: string;
  jsonPath: string;
  bindings: Bindings;
  depth: number;
  /** A mapping on an enclosing position replaces this whole subtree in generation. */
  inherited?: LeafMapping;
}

type Lookup = (entity: EntityNode, node: TypeNode, path: string) => LeafMapping | undefined;

function walkInput(
  index: ProjectIndex,
  lookup: Lookup,
  model: EntityNode,
  input: unknown,
  hints: Map<string, EntityNode> = new Map(),
): WalkResult {
  const leaves: Leaf[] = [];
  const drift: Drift[] = [];
  const inferred: InferredType[] = [];
  const dateReported = new Set<string>();
  const seen: Record<string, number> = {};
  const see = (modelPath: string) => {
    seen[modelPath] = (seen[modelPath] ?? 0) + 1;
  };
  const entityOf = (node: ReferenceNode) =>
    node.sourceFile
      ? index.project.entityBySourceAndName.get(`${node.sourceFile}::${node.name}`)
      : undefined;

  const addLeaf = (
    pos: Position,
    kind: LeafKind,
    value: unknown,
    mapping: LeafMapping | undefined,
    enumName?: string,
  ) => {
    leaves.push({
      path: pos.jsonPath || "$",
      modelPath: pos.modelPath,
      source: index.sourcePathOf(pos.entity),
      kind,
      ...(enumName ? { enumName } : {}),
      value,
      ...(mapping ? { mapping } : {}),
    });
  };

  const addDrift = (
    pos: Position,
    kind: DriftKind,
    expected?: string,
    actual?: string,
    note?: string,
    extra: Pick<Drift, "type" | "source"> = {},
  ) => {
    drift.push({
      path: pos.jsonPath || "$",
      kind,
      modelPath: pos.modelPath,
      ...(expected !== undefined ? { expected } : {}),
      ...(actual !== undefined ? { actual } : {}),
      ...(note !== undefined ? { note } : {}),
      ...extra,
    });
  };

  const fieldType = (node: TypeNode, bindings: Bindings, depth = 0): FieldType => {
    if (depth > MAX_DEPTH) {
      return { kind: "unknown" };
    }
    switch (node.kind) {
      case "scalar":
        switch (node.scalar) {
          case "string":
          case "number":
          case "boolean":
          case "date":
          case "null":
            return { kind: node.scalar };
          case "bigint":
            return { kind: "number" };
          default:
            return { kind: "unknown" };
        }
      case "literal":
        return { kind: primitiveKind(node.value) ?? "unknown" };
      case "enum":
        return { kind: "enum", ...(node.source ? { name: node.source.name } : {}), values: node.values };
      case "array":
        return { kind: "array", element: fieldType(node.element, bindings, depth + 1) };
      case "tuple":
        return { kind: "array" };
      case "object":
        return { kind: "object" };
      case "union": {
        const members = node.members.filter(
          (member) => !(member.kind === "scalar" && member.scalar === "null") &&
            !(member.kind === "literal" && member.value === null),
        );
        const nullable = members.length < node.members.length ? { nullable: true } : {};
        return members.length === 1
          ? { ...fieldType(members[0]!, bindings, depth + 1), ...nullable }
          : { kind: "union", ...nullable };
      }
      case "reference": {
        if (node.genericParameter) {
          const bound = bindings.get(node.name);
          return bound ? fieldType(bound.node, bound.bindings, depth + 1) : { kind: "unknown" };
        }
        const target = entityOf(node);
        if (!target) {
          return { kind: "unknown", name: node.name };
        }
        const named = { name: target.name, source: index.sourcePathOf(target) };
        return target.type.kind === "object"
          ? { kind: "object", ...named }
          : { ...fieldType(target.type, new Map(), depth + 1), ...named };
      }
    }
  };

  const hintFor = (jsonPath: string) =>
    hints.get(jsonPath) ?? hints.get(jsonPath.replace(/\[\d+\]/g, "[]"));

  /**
   * Without a `$type`, only the JSON's own keys are evidence. The keys the declared type lacks
   * must all be declared by one subclass; when several subclasses declare all of them the least
   * derived wins, and unrelated ones are a tie. Absent required fields are never evidence: an API
   * that omits them is what the walk is there to report.
   */
  const inferSubclass = (
    value: Record<string, unknown>,
    declared: EntityNode,
  ): { entity: EntityNode; ambiguous?: boolean } => {
    const subclasses = index.subclassesOf(declared);
    if (subclasses.length === 0 || declared.type.kind !== "object" || declared.type.indexSignature) {
      return { entity: declared };
    }
    const own = index.propertyNames(declared);
    const extra = Object.keys(value).filter(
      (key) =>
        value[key] !== undefined &&
        !own.has(key) &&
        !(DISCRIMINATOR_KEYS as readonly string[]).includes(key),
    );
    const explained = subclasses.map((subclass) => ({
      subclass,
      count: extra.filter((key) => index.propertyNames(subclass).has(key)).length,
    }));
    const explainable = extra.filter((key) =>
      subclasses.some((subclass) => index.propertyNames(subclass).has(key)),
    ).length;
    if (explainable === 0) {
      return { entity: declared };
    }
    const complete = explained.filter((entry) => entry.count === explainable).map((entry) => entry.subclass);
    const entity = complete.find((candidate) =>
      complete.every((other) => index.isAssignable(other, candidate)),
    );
    return entity ? { entity } : { entity: declared, ambiguous: true };
  };

  const mismatch = (pos: Position, node: TypeNode, value: unknown, mapping?: LeafMapping) => {
    addDrift(pos, "type-mismatch", describe(node), jsonKind(value));
    const kind = primitiveKind(value);
    if (kind) {
      addLeaf(pos, kind, value, mapping);
    }
  };

  const resolveDiscriminated = (value: object, expected: EntityNode, pos: Position): EntityNode => {
    const discriminator = readDiscriminator(value);
    if (discriminator === undefined) {
      return expected;
    }
    const found = index.findByDiscriminator(discriminator);
    if (found && index.isAssignable(found, expected)) {
      return found;
    }
    addDrift(
      { ...pos, jsonPath: childPath(pos.jsonPath, readDiscriminatorKey(value)!) },
      "unknown-discriminator",
      expected.name,
      found ? `${discriminator} (not assignable)` : discriminator,
    );
    return expected;
  };

  const walkUnknown = (value: unknown, pos: Position, mapping: LeafMapping | undefined) => {
    if (pos.depth > MAX_DEPTH) {
      return;
    }
    if (Array.isArray(value)) {
      value.forEach((element, i) =>
        walkUnknown(element, {
          ...pos,
          modelPath: `${pos.modelPath}[]`,
          jsonPath: `${pos.jsonPath}[${i}]`,
          depth: pos.depth + 1,
        }, mapping),
      );
      return;
    }
    if (isPlainObject(value)) {
      for (const [key, child] of Object.entries(value)) {
        walkUnknown(child, {
          ...pos,
          modelPath: `${pos.modelPath}.${key}`,
          jsonPath: childPath(pos.jsonPath, key),
          depth: pos.depth + 1,
        }, mapping);
      }
      return;
    }
    addLeaf(pos, value === null ? "null" : "unknown", value, mapping);
  };

  const walkEnum = (
    value: unknown,
    values: Array<string | number>,
    enumName: string | undefined,
    memberNames: string[],
    pos: Position,
    mapping: LeafMapping | undefined,
  ) => {
    if (values.includes(value as string | number)) {
      addLeaf(pos, "enum", value, mapping, enumName);
      return;
    }
    if (typeof value !== "string" && typeof value !== "number") {
      mismatch(pos, { kind: "enum", values }, value, mapping);
      return;
    }
    const numeric = values.length > 0 && values.every((member) => typeof member === "number");
    const label = enumName ?? "enum";
    const expected =
      typeof value === "string" && numeric
        ? `${label} (numeric${memberNames.includes(value) ? `; "${value}" is a member name` : ""})`
        : typeof value === "number" && !numeric
          ? `${label} (string)`
          : `${label} member (${values.map((member) => JSON.stringify(member)).join(", ")})`;
    addDrift(pos, "enum-mismatch", expected, JSON.stringify(value));
    addLeaf(pos, "enum", value, mapping, enumName);
  };

  const walkEntity = (
    value: unknown,
    target: EntityNode,
    bindings: Bindings,
    pos: Position,
    mapping: LeafMapping | undefined,
  ) => {
    if (target.type.kind !== "object") {
      if (target.declarationKind === "enum" && target.type.kind === "enum") {
        const own = mapping ?? lookup(target, target.type, target.name);
        walkEnum(value, target.type.values, target.name, index.enumMemberNames(target), pos, own);
        return;
      }
      walkNode(value, target.type, {
        ...pos,
        lookupEntity: target,
        lookupPath: target.name,
        bindings,
        inherited: mapping,
      });
      return;
    }

    if (!isPlainObject(value)) {
      mismatch(pos, { kind: "reference", name: target.name, genericParameter: false, typeArguments: [] }, value, mapping);
      return;
    }

    const hint = hintFor(pos.jsonPath);
    if (hint && (hint.type.kind !== "object" || !index.isAssignable(hint, target))) {
      throw new Error(
        `Type hint for "${pos.jsonPath || "$"}": ${hint.name} is not assignable to the declared ${target.name}.`,
      );
    }
    const discriminator = readDiscriminator(value);
    // An empty `$type` names nothing: it is reported, and the keys decide as if it were absent.
    const blank = discriminator !== undefined && discriminator.trim() === "";
    const untyped = discriminator === undefined || blank;
    if (blank && !hint) {
      addDrift(
        { ...pos, jsonPath: childPath(pos.jsonPath, readDiscriminatorKey(value)!) },
        "unknown-discriminator",
        target.name,
        JSON.stringify(discriminator),
      );
    }
    const guess = hint || !untyped ? undefined : inferSubclass(value, target);
    const resolved = hint ?? guess?.entity ?? resolveDiscriminated(value, target, pos);
    const node = resolved.type.kind === "object" ? resolved.type : target.type;
    const entity = resolved.type.kind === "object" ? resolved : target;
    const by = hint ? "hint" : guess && entity !== target ? "keys" : undefined;
    if (by && entity !== target) {
      inferred.push({
        path: pos.jsonPath || "$",
        declared: target.name,
        type: entity.name,
        source: index.sourcePathOf(entity),
        by,
      });
    }
    see(entity.name);
    walkObject(
      value,
      node,
      {
        ...pos,
        entity,
        modelPath: entity.name,
        lookupEntity: entity,
        lookupPath: entity.name,
        bindings: entity === target ? bindings : new Map(),
        inherited: mapping,
      },
      entity !== target && by
        ? {
            note:
              by === "hint"
                ? `walked as ${entity.name} by a type hint; the model declares ${target.name}`
                : `walked as ${entity.name}, inferred from its keys (${
                    blank ? "empty" : "no"
                  } $type); the model declares ${target.name}`,
          }
        : untyped && !hint
          ? { subclasses: index.subclassesOf(entity), ambiguous: guess?.ambiguous }
          : {},
    );
  };

  /**
   * `subclasses`: the types the object could have been, had it carried a `$type`.
   * `note`: how the type being walked was chosen, when the model did not declare it.
   */
  const walkObject = (
    value: Record<string, unknown>,
    node: ObjectNode,
    pos: Position,
    selection: { subclasses?: EntityNode[]; ambiguous?: boolean; note?: string } = {},
  ) => {
    const declared = new Set(node.properties.map((property) => property.name));
    const keys = Object.keys(value).filter(
      (key) => value[key] !== undefined && !(DISCRIMINATOR_KEYS as readonly string[]).includes(key),
    );

    // A dictionary over a finite key set is one field: report its keys once, not per key.
    let keyMismatch = false;
    if (node.keyed && !node.indexSignature) {
      const absent = node.properties.filter(
        (property) => !property.optional && !keys.includes(property.name),
      );
      const undeclared = keys.filter((key) => !declared.has(key));
      keyMismatch = absent.length > 0 || undeclared.length > 0;
      if (keyMismatch) {
        const size = node.properties.length;
        addDrift(
          pos,
          "key-mismatch",
          node.keyed.name ? `keys of ${node.keyed.name} (${size})` : `${size} declared keys`,
          describeKeys(keys),
          undeclared.length === 0
            ? `all valid, but only ${keys.length} of ${size}`
            : undeclared.length === keys.length
              ? "none declared"
              : `${undeclared.length} undeclared, ${absent.length} declared absent`,
        );
      }
    }

    for (const property of node.properties) {
      const child: Position = {
        ...pos,
        modelPath: `${pos.modelPath}.${property.name}`,
        lookupPath: `${pos.lookupPath}.${property.name}`,
        jsonPath: childPath(pos.jsonPath, property.name),
        depth: pos.depth + 1,
      };
      const present = Object.prototype.hasOwnProperty.call(value, property.name);
      const propertyValue = value[property.name];
      see(child.modelPath);

      if (!present || propertyValue === undefined) {
        if (!property.optional && !keyMismatch) {
          addDrift(child, "missing-required", describe(property.type), undefined, selection.note, {
            type: fieldType(property.type, pos.bindings),
            source: index.sourcePathOf(pos.entity),
          });
        }
        continue;
      }

      if (propertyValue === null && !allowsNull(property.type, pos.bindings)) {
        const mapping = pos.inherited ?? lookup(child.lookupEntity, property.type, child.lookupPath);
        addDrift(
          child,
          property.optional ? "null-for-optional" : "type-mismatch",
          describe(property.type),
          "null",
        );
        addLeaf(child, "null", null, mapping);
        continue;
      }

      walkNode(propertyValue, property.type, child);
    }

    for (const [key, child] of Object.entries(value)) {
      if (declared.has(key) || (DISCRIMINATOR_KEYS as readonly string[]).includes(key)) {
        continue;
      }
      const childPos: Position = {
        ...pos,
        modelPath: `${pos.modelPath}.${key}`,
        lookupPath: `${pos.lookupPath}.${key}`,
        jsonPath: childPath(pos.jsonPath, key),
        depth: pos.depth + 1,
      };
      if (node.indexSignature) {
        see(childPos.modelPath);
        walkNode(child, node.indexSignature.value, childPos);
      } else if (!keyMismatch) {
        addDrift(
          childPos,
          "unmodelled",
          undefined,
          jsonKind(child),
          selection.note ?? subclassNote(pos, key, selection.subclasses ?? [], selection.ambiguous),
        );
      }
    }
  };

  const subclassNote = (pos: Position, key: string, subclasses: EntityNode[], ambiguous = false) => {
    if (subclasses.length === 0) {
      return undefined;
    }
    const declaring = subclasses.filter(
      (subclass) =>
        subclass.type.kind === "object" &&
        subclass.type.properties.some((property) => property.name === key),
    );
    const names = declaring.slice(0, 3).map((subclass) => subclass.name);
    const owner = pos.entity.name;
    if (declaring.length === 0) {
      return `no $type; no subclass of ${owner} declares it either`;
    }
    const which = `${names.join(", ")}${declaring.length > 3 ? ` and ${declaring.length - 3} more` : ""} ${
      declaring.length === 1 ? "declares" : "declare"
    } it`;
    return ambiguous
      ? `no $type, and the keys fit no single subclass of ${owner}; ${which}`
      : `no $type to select a subclass of ${owner}; ${which}`;
  };

  const walkNode = (value: unknown, node: TypeNode, pos: Position): void => {
    if (pos.depth > MAX_DEPTH) {
      return;
    }
    // Same order as generation: the value at this position is looked up before its members.
    const mapping = pos.inherited ?? lookup(pos.lookupEntity, node, pos.lookupPath);
    const inner: Position = { ...pos, inherited: mapping };

    switch (node.kind) {
      case "scalar":
        switch (node.scalar) {
          case "any":
          case "unknown":
            walkUnknown(value, pos, mapping);
            return;
          case "string":
            return typeof value === "string" ? addLeaf(pos, "string", value, mapping) : mismatch(pos, node, value, mapping);
          case "number":
          case "bigint":
            return typeof value === "number" ? addLeaf(pos, "number", value, mapping) : mismatch(pos, node, value, mapping);
          case "boolean":
            return typeof value === "boolean" ? addLeaf(pos, "boolean", value, mapping) : mismatch(pos, node, value, mapping);
          case "date":
            if (typeof value === "string" && ISO_DATE.test(value)) {
              if (!dateReported.has(pos.modelPath)) {
                dateReported.add(pos.modelPath);
                addDrift(pos, "string-for-date", "Date", "string");
              }
              addLeaf(pos, "date", value, mapping);
              return;
            }
            return mismatch(pos, node, value, mapping);
          case "null":
            return value === null ? addLeaf(pos, "null", null, mapping) : mismatch(pos, node, value, mapping);
          default:
            return mismatch(pos, node, value, mapping);
        }
      case "literal": {
        if (value !== node.value) {
          return mismatch(pos, node, value, mapping);
        }
        return addLeaf(pos, primitiveKind(value) ?? "unknown", value, mapping);
      }
      case "enum":
        return walkEnum(value, node.values, node.source?.name, node.source?.members ?? [], pos, mapping);
      case "array":
        if (!Array.isArray(value)) {
          return mismatch(pos, node, value, mapping);
        }
        value.forEach((element, i) => {
          see(`${pos.modelPath}[]`);
          walkNode(element, node.element, {
            ...inner,
            modelPath: `${pos.modelPath}[]`,
            lookupPath: `${pos.lookupPath}[]`,
            jsonPath: `${pos.jsonPath}[${i}]`,
            depth: pos.depth + 1,
          });
        });
        return;
      case "tuple":
        if (!Array.isArray(value)) {
          return mismatch(pos, node, value, mapping);
        }
        value.forEach((element, i) => {
          const elementNode = node.elements[i];
          const child: Position = {
            ...inner,
            modelPath: `${pos.modelPath}.${i}`,
            lookupPath: `${pos.lookupPath}.${i}`,
            jsonPath: `${pos.jsonPath}[${i}]`,
            depth: pos.depth + 1,
          };
          see(child.modelPath);
          if (elementNode) {
            walkNode(element, elementNode, child);
          } else {
            addDrift(child, "unmodelled", undefined, jsonKind(element));
          }
        });
        return;
      case "object":
        if (!isPlainObject(value)) {
          return mismatch(pos, node, value, mapping);
        }
        walkObject(value, node, inner);
        return;
      case "union": {
        const member = pickUnionMember(value, node.members, pos.bindings);
        if (!member) {
          return mismatch(pos, node, value, mapping);
        }
        walkNode(value, member, inner);
        return;
      }
      case "reference": {
        if (node.genericParameter) {
          const bound = pos.bindings.get(node.name);
          if (!bound) {
            walkUnknown(value, pos, mapping);
            return;
          }
          walkNode(value, bound.node, { ...inner, bindings: bound.bindings });
          return;
        }
        const target = entityOf(node);
        if (!target) {
          walkUnknown(value, pos, mapping);
          return;
        }
        const bindings: Bindings = new Map(
          target.generics.map((generic, i) => [
            generic.name,
            {
              node: node.typeArguments[i] ?? generic.defaultType ?? { kind: "scalar", scalar: "unknown" },
              bindings: pos.bindings,
            },
          ]),
        );
        walkEntity(value, target, bindings, pos, mapping);
        return;
      }
    }
  };

  const allowsNull = (node: TypeNode, bindings: Bindings): boolean => {
    switch (node.kind) {
      case "scalar":
        return node.scalar === "null" || node.scalar === "any" || node.scalar === "unknown";
      case "literal":
        return node.value === null;
      case "union":
        return node.members.some((member) => allowsNull(member, bindings));
      case "reference": {
        if (node.genericParameter) {
          const bound = bindings.get(node.name);
          return bound ? allowsNull(bound.node, bound.bindings) : true;
        }
        const target = entityOf(node);
        return target ? target.type.kind !== "object" && allowsNull(target.type, new Map()) : true;
      }
      default:
        return false;
    }
  };

  /** Lower is better; undefined means the member cannot hold the value. */
  const rankMember = (value: unknown, node: TypeNode, bindings: Bindings): number | undefined => {
    switch (node.kind) {
      case "scalar":
        switch (node.scalar) {
          case "any":
          case "unknown":
            return 9;
          case "null":
            return value === null ? 0 : undefined;
          case "string":
            return typeof value === "string" ? 1 : undefined;
          case "number":
          case "bigint":
            return typeof value === "number" ? 1 : undefined;
          case "boolean":
            return typeof value === "boolean" ? 1 : undefined;
          case "date":
            return typeof value === "string" && ISO_DATE.test(value) ? 3 : undefined;
          default:
            return undefined;
        }
      case "literal":
        return value === node.value ? 0 : undefined;
      case "enum":
        return node.values.includes(value as string | number) ? 0 : undefined;
      case "array":
      case "tuple":
        return Array.isArray(value) ? 1 : undefined;
      case "object":
        return isPlainObject(value) ? 2 : undefined;
      case "union":
        return node.members.reduce<number | undefined>((best, member) => {
          const rank = rankMember(value, member, bindings);
          return rank === undefined ? best : best === undefined ? rank : Math.min(best, rank);
        }, undefined);
      case "reference": {
        if (node.genericParameter) {
          const bound = bindings.get(node.name);
          return bound ? rankMember(value, bound.node, bound.bindings) : 9;
        }
        const target = entityOf(node);
        if (!target) {
          return 8;
        }
        if (target.type.kind !== "object") {
          return rankMember(value, target.type, new Map());
        }
        if (!isPlainObject(value)) {
          return undefined;
        }
        const discriminator = readDiscriminator(value);
        const found = discriminator === undefined ? undefined : index.findByDiscriminator(discriminator);
        return found && index.isAssignable(found, target) ? 0 : 2;
      }
    }
  };

  const pickUnionMember = (value: unknown, members: TypeNode[], bindings: Bindings) => {
    let best: TypeNode | undefined;
    let bestRank = Infinity;
    for (const member of members) {
      const rank = rankMember(value, member, bindings);
      if (rank !== undefined && rank < bestRank) {
        best = member;
        bestRank = rank;
      }
    }
    return best;
  };

  const root: Position = {
    entity: model,
    modelPath: model.name,
    lookupEntity: model,
    lookupPath: model.name,
    jsonPath: "",
    bindings: new Map(),
    depth: 0,
  };
  walkEntity(input, model, new Map(), root, undefined);

  return { leaves, drift, seen, inferred };
}

function readDiscriminatorKey(value: object): string | undefined {
  return DISCRIMINATOR_KEYS.find(
    (key) => typeof (value as Record<string, unknown>)[key] === "string",
  );
}

function readDiscriminator(value: object): string | undefined {
  const key = readDiscriminatorKey(value);
  return key ? ((value as Record<string, unknown>)[key] as string) : undefined;
}

function isBlankJson(actual: string | undefined): boolean {
  return actual !== undefined && /^"\s*"$/.test(actual);
}

function childPath(parent: string, key: string): string {
  const segment = /^[A-Za-z_$][\w$]*$/.test(key) ? key : `[${JSON.stringify(key)}]`;
  if (segment.startsWith("[")) {
    return `${parent}${segment}`;
  }
  return parent ? `${parent}.${segment}` : segment;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function primitiveKind(value: unknown): LeafKind | undefined {
  if (value === null) {
    return "null";
  }
  switch (typeof value) {
    case "string":
      return "string";
    case "number":
      return "number";
    case "boolean":
      return "boolean";
    default:
      return undefined;
  }
}

function jsonKind(value: unknown): string {
  if (value === null) {
    return "null";
  }
  if (Array.isArray(value)) {
    return "array";
  }
  return typeof value;
}

function describeKeys(keys: string[], max = 8): string {
  if (keys.length === 0) {
    return "no keys";
  }
  const shown = keys.slice(0, max).map((key) => JSON.stringify(key)).join(", ");
  return keys.length > max ? `${shown}, … (${keys.length} keys)` : shown;
}

function describe(node: TypeNode): string {
  switch (node.kind) {
    case "scalar":
      return node.scalar === "date" ? "Date" : node.scalar;
    case "literal":
      return JSON.stringify(node.value);
    case "enum":
      return node.source?.name ?? describeEnumValues(node);
    case "object":
      return "object";
    case "array":
      return `${describe(node.element)}[]`;
    case "tuple":
      return `[${node.elements.map(describe).join(", ")}]`;
    case "union":
      return node.members.map(describe).join(" | ");
    case "reference":
      return node.name;
  }
}

function describeEnumValues(node: EnumNode): string {
  return node.values.map((value) => JSON.stringify(value)).join(" | ");
}

/** One line per leaf: `path  modelPath  kind  value  [→ mapping]`. */
export function formatLeaves(leaves: Leaf[]): string {
  return leaves
    .map((leaf) =>
      [
        leaf.path,
        leaf.modelPath,
        leaf.enumName ? `${leaf.kind}:${leaf.enumName}` : leaf.kind,
        truncate(JSON.stringify(leaf.value) ?? "undefined"),
        leaf.mapping ? `→ ${formatMapping(leaf.mapping)}` : "",
      ]
        .filter(Boolean)
        .join("  "),
    )
    .join("\n");
}

const KIND_ORDER: DriftKind[] = [
  "key-mismatch",
  "missing-required",
  "unmodelled",
  "type-mismatch",
  "null-for-optional",
  "string-for-date",
  "enum-mismatch",
  "unknown-discriminator",
];

const HEADINGS: Record<DriftKind, string> = {
  "key-mismatch": "Keys differ from the model's",
  "missing-required": "Required by the model, not in the JSON",
  unmodelled: "In the JSON, not in the model",
  "type-mismatch": "Another type than the model says",
  "null-for-optional": "null where the model says optional",
  "string-for-date": "The model says Date, the JSON has an ISO string",
  "enum-mismatch": "Not a value of the model's enum",
  "unknown-discriminator": "$type the model does not know",
};

/** One group per `kind + modelPath`, ordered by kind then model path. */
export function groupDrift(drift: Drift[], seen: Record<string, number> = {}): DriftGroup[] {
  const buckets = new Map<string, Drift[]>();
  for (const entry of drift) {
    const key = `${entry.kind}\u0000${entry.modelPath ?? entry.path}`;
    buckets.set(key, [...(buckets.get(key) ?? []), entry]);
  }

  return [...buckets.values()]
    .map((entries) => {
      const first = entries[0]!;
      const modelPath = first.modelPath ?? first.path;
      // An unmodelled field is counted against its owner: the model has no such path to count.
      const owner =
        first.kind === "unmodelled" ? modelPath.slice(0, modelPath.lastIndexOf(".")) : modelPath;
      const total = seen[owner];
      const detail = describeDetail(first.kind, entries);
      const group = {
        kind: first.kind,
        modelPath,
        count: entries.length,
        ...(total !== undefined && total >= entries.length ? { total } : {}),
        example: first.path,
        heading: HEADINGS[first.kind],
        ...(detail ? { detail } : {}),
        ...(first.note !== undefined ? { note: first.note } : {}),
      };
      return {
        ...group,
        message: describeGroup(group),
        ...(first.type ? { type: first.type } : {}),
        ...(first.source !== undefined ? { source: first.source } : {}),
      };
    })
    .sort(
      (a, b) =>
        KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind) ||
        (a.modelPath < b.modelPath ? -1 : a.modelPath > b.modelPath ? 1 : 0),
    );
}

function describeDetail(kind: DriftKind, entries: Drift[]): string {
  const actuals = [...new Set(entries.map((entry) => entry.actual).filter((actual) => actual !== undefined))];
  const actual = `${actuals.slice(0, 3).join(", ")}${actuals.length > 3 ? ", …" : ""}`;
  const expected = entries[0]!.expected ?? "unknown";

  switch (kind) {
    case "missing-required":
    case "null-for-optional":
      return expected;
    case "unmodelled":
      return actual;
    case "string-for-date":
      return "";
    case "unknown-discriminator": {
      const why = actual.includes("(not assignable)")
        ? ""
        : actuals.every(isBlankJson)
          ? " (empty)"
          : " (no such model)";
      return `$type ${actual}${why}, expected ${expected} or a subclass`;
    }
    default:
      return `model ${expected}, JSON ${actual}`;
  }
}

/** `N of M` when the number of instances walked is known. String dates are reported once, so have no count. */
function describeCount(group: Pick<DriftGroup, "kind" | "count" | "total">): string {
  if (group.kind === "string-for-date") {
    return "";
  }
  return group.total !== undefined ? `${group.count} of ${group.total}` : `${group.count}×`;
}

function describeGroup(group: Omit<DriftGroup, "message" | "type" | "source">): string {
  const heading = `${group.heading.charAt(0).toLowerCase()}${group.heading.slice(1)}`;
  const clause = (() => {
    switch (group.kind) {
      case "missing-required":
        return `required by the model (${group.detail}), not in the JSON`;
      case "unmodelled":
        return `in the JSON (${group.detail}), not in the model`;
      case "unknown-discriminator":
        return group.detail!;
      default:
        return group.detail ? `${heading} (${group.detail})` : heading;
    }
  })();
  const where = [describeCount(group), `at ${group.example}`].filter(Boolean).join(", ");

  return `${group.modelPath}: ${clause}; ${where}${group.note ? `; ${group.note}` : ""}`;
}

/**
 * A block per kind under a heading that says what disagrees, one aligned row per model field with
 * its count and one path, then a summary; with `all`, one line per occurrence.
 */
export function formatDrift(drift: Drift[], options: FormatDriftOptions = {}): string {
  if (drift.length === 0) {
    return "";
  }
  const groups = groupDrift(drift, options.seen);
  const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
  const summary = `${plural(groups.length, "field")} differ${groups.length === 1 ? "s" : ""}, ${plural(drift.length, "occurrence")}`;

  if (options.all) {
    const lines = drift.map((entry) =>
      [
        entry.kind,
        entry.path,
        entry.modelPath ?? "",
        entry.expected !== undefined ? `expected ${entry.expected}` : "",
        entry.actual !== undefined ? `got ${entry.actual}` : "",
      ]
        .filter(Boolean)
        .join("  "),
    );
    return [...lines, "", summary].join("\n");
  }

  const blocks = KIND_ORDER.flatMap((kind) => {
    const rows = groups.filter((group) => group.kind === kind);
    if (rows.length === 0) {
      return [];
    }
    const cells = rows.map((group) => [group.modelPath, group.detail ?? "", describeCount(group)]);
    const widths = [0, 1, 2].map((column) => Math.max(...cells.map((row) => row[column]!.length)));
    const lines = rows.flatMap((group, i) => [
      `  ${cells[i]!
        .map((cell, column) => cell.padEnd(widths[column]!))
        .filter((_, column) => widths[column]! > 0)
        .join("  ")}  at ${group.example}`,
      ...(group.note ? [`      ${group.note}`] : []),
    ]);
    return [[HEADINGS[kind], ...lines].join("\n")];
  });

  return [...blocks, summary].join("\n\n");
}

function formatMapping(mapping: LeafMapping): string {
  const where = [
    mapping.index !== undefined ? `mappings[${mapping.index}]` : undefined,
    mapping.source !== undefined ? `source ${mapping.source}` : undefined,
    `path ${mapping.path}`,
  ]
    .filter(Boolean)
    .join(" ");
  return `${mapping.value} (${where})`;
}

function truncate(text: string, max = 60): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}
