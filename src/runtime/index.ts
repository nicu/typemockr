import { faker } from "@faker-js/faker";

export type PrimitiveLiteral = string | number | boolean | null;

export type ScalarKind =
  | "string"
  | "number"
  | "bigint"
  | "boolean"
  | "symbol"
  | "null"
  | "undefined"
  | "unknown"
  | "any"
  | "date";

export type DeepPartial<T> = T extends Date
  ? Date
  : T extends ReadonlyArray<infer Item>
    ? Array<DeepPartial<Item>>
    : T extends Array<infer Item>
      ? Array<DeepPartial<Item>>
      : T extends object
        ? { [Key in keyof T]?: DeepPartial<T[Key]> }
        : T;

type ValueKind =
  | "scalar"
  | "literal"
  | "enum"
  | "union"
  | "array"
  | "tuple"
  | "object"
  | "reference"
  | "generic"
  | "record";

export interface MockValueContext {
  kind: ValueKind;
  path: string;
  entityName: string;
  propertyName: string;
  scalar?: ScalarKind;
  literal?: PrimitiveLiteral;
  values?: ReadonlyArray<string | number>;
  targetName?: string;
  genericName?: string;
}

export interface RuleContext<T> {
  typeName: string;
  draft: Readonly<T>;
  get(path: string): unknown;
  set(path: string, value: unknown): void;
  has(path: string): boolean;
  isExplicit(path: string): boolean;
}

export type RuleFn<T = unknown> = (context: RuleContext<T>) => void;

export interface MockRegistry {
  provideValue?(context: MockValueContext): unknown | undefined;
  rules?: Record<string, RuleFn[]>;
}

interface MockState {
  counts: Map<string, number>;
}

export interface MockOptions {
  maxDepth?: number;
  generics?: Record<string, () => unknown>;
  __state?: MockState;
}

export interface MockFactoryContext {
  scalar<T>(path: string, scalar: ScalarKind): T;
  literal<T extends PrimitiveLiteral>(path: string, value: T): T;
  enumValue<T extends string | number>(
    path: string,
    values: readonly T[],
  ): T;
  union<T>(path: string, factories: Array<() => T>): T;
  array<T>(path: string, factory: () => T): T[];
  tuple<T extends readonly unknown[]>(
    path: string,
    factories: { [Key in keyof T]: () => T[Key] },
  ): T;
  object<T extends object>(
    path: string,
    factory: () => T,
  ): T;
  record<T>(path: string, factory: () => T): Record<string, T>;
  reference<T>(path: string, targetName: string, factory: () => T): T;
  generic<T>(path: string, name: string, fallback?: () => T): T;
  nested(generics?: Record<string, () => unknown>): MockOptions;
}

interface BuildMockArgs<T> {
  typeName: string;
  defaults(context: MockFactoryContext): T;
  fallback(): T;
  overrides?: DeepPartial<T>;
  options?: MockOptions;
  registry?: MockRegistry;
}

const DEFAULT_MAX_DEPTH = 2;

export const defaultRegistry: MockRegistry = Object.freeze({
  rules: {},
});

export function defineRegistry(registry: MockRegistry): MockRegistry {
  return registry;
}

export function buildObjectMock<T extends object>(
  args: BuildMockArgs<T>,
): T {
  const state = getState(args.options);
  const maxDepth = args.options?.maxDepth ?? DEFAULT_MAX_DEPTH;

  if (shouldShortCircuit(state, args.typeName, maxDepth)) {
    return finalizeObjectMock(
      args.fallback(),
      args.overrides,
      args.typeName,
      args.registry ?? defaultRegistry,
    );
  }

  enterType(state, args.typeName);

  try {
    const context = createFactoryContext(
      args.typeName,
      args.registry ?? defaultRegistry,
      args.options ?? {},
    );
    const defaults = args.defaults(context);
    return finalizeObjectMock(
      defaults,
      args.overrides,
      args.typeName,
      args.registry ?? defaultRegistry,
    );
  } finally {
    exitType(state, args.typeName);
  }
}

export function buildValueMock<T>(args: BuildMockArgs<T>): T {
  const state = getState(args.options);
  const maxDepth = args.options?.maxDepth ?? DEFAULT_MAX_DEPTH;

  if (shouldShortCircuit(state, args.typeName, maxDepth)) {
    return mergeValues(args.fallback(), args.overrides as T | undefined);
  }

  enterType(state, args.typeName);

  try {
    const context = createFactoryContext(
      args.typeName,
      args.registry ?? defaultRegistry,
      args.options ?? {},
    );
    return mergeValues(
      args.defaults(context),
      args.overrides as T | undefined,
    );
  } finally {
    exitType(state, args.typeName);
  }
}

function createFactoryContext(
  entityName: string,
  registry: MockRegistry,
  options: MockOptions,
): MockFactoryContext {
  const resolve = <T>(
    context: Omit<MockValueContext, "entityName" | "propertyName">,
    fallback: () => T,
  ): T => {
    const propertyName = getPropertyName(context.path);
    const provided = registry.provideValue?.({
      ...context,
      entityName,
      propertyName,
    });

    if (provided !== undefined) {
      return cloneValue(provided) as T;
    }

    return fallback();
  };

  return {
    scalar: <T>(path: string, scalar: ScalarKind): T =>
      resolve({ kind: "scalar", path, scalar }, () =>
        inferScalarValue(path, entityName, scalar),
      ) as T,
    literal: <T extends PrimitiveLiteral>(path: string, value: T): T =>
      resolve({ kind: "literal", path, literal: value }, () => value),
    enumValue: <T extends string | number>(
      path: string,
      values: readonly T[],
    ): T =>
      resolve({ kind: "enum", path, values }, () =>
        faker.helpers.arrayElement(values as T[]),
      ) as T,
    union: <T>(path: string, factories: Array<() => T>): T =>
      resolve({ kind: "union", path }, () =>
        faker.helpers.arrayElement(factories)(),
      ) as T,
    array: <T>(path: string, factory: () => T): T[] =>
      resolve({ kind: "array", path }, () => {
        const count = faker.number.int({ min: 1, max: 3 });
        return Array.from({ length: count }, () => factory());
      }),
    tuple: <T extends readonly unknown[]>(
      path: string,
      factories: { [Key in keyof T]: () => T[Key] },
    ): T =>
      resolve({ kind: "tuple", path }, () =>
        factories.map((factory) => factory()) as unknown as T,
      ),
    object: <T extends object>(
      path: string,
      factory: () => T,
    ): T => resolve({ kind: "object", path }, factory),
    record: <T>(path: string, factory: () => T): Record<string, T> =>
      resolve({ kind: "record", path }, () => {
        const key = `${getPropertyName(path)}-${faker.string.alphanumeric(6)}`;
        return { [key]: factory() };
      }),
    reference: <T>(path: string, targetName: string, factory: () => T): T =>
      resolve({ kind: "reference", path, targetName }, factory),
    generic: <T>(path: string, name: string, fallback?: () => T): T =>
      resolve({ kind: "generic", path, genericName: name }, () => {
        const factory = options.generics?.[name];
        if (factory) {
          return factory() as T;
        }

        if (fallback) {
          return fallback();
        }

        return undefined as T;
      }),
    nested: (generics?: Record<string, () => unknown>): MockOptions => ({
      maxDepth: options.maxDepth,
      generics: generics
        ? { ...(options.generics ?? {}), ...generics }
        : options.generics,
      __state: getState(options),
    }),
  };
}

function finalizeObjectMock<T extends object>(
  defaults: T,
  overrides: DeepPartial<T> | undefined,
  typeName: string,
  registry: MockRegistry,
): T {
  const explicitPaths = collectExplicitPaths(overrides);
  const draft = mergeValues(defaults, overrides as T | undefined);
  applyRules(draft, typeName, explicitPaths, registry);
  return draft;
}

function applyRules<T extends object>(
  draft: T,
  typeName: string,
  explicitPaths: Set<string>,
  registry: MockRegistry,
) {
  const rules = [
    ...(registry.rules?.["*"] ?? []),
    ...(registry.rules?.[typeName] ?? []),
  ];

  if (rules.length === 0) {
    return;
  }

  const context: RuleContext<T> = {
    typeName,
    draft,
    get: (path) => getByPath(draft, path).value,
    set: (path, value) => {
      if (isProtectedPath(explicitPaths, path)) {
        return;
      }

      setByPath(draft, path, cloneValue(value));
    },
    has: (path) => getByPath(draft, path).exists,
    isExplicit: (path) => isProtectedPath(explicitPaths, path),
  };

  for (const rule of rules) {
    rule(context);
  }
}

function inferScalarValue(
  _path: string,
  _entityName: string,
  scalar: ScalarKind,
): unknown {
  switch (scalar) {
    case "string":
      return faker.lorem.words();
    case "number":
      return faker.number.int({ min: 1, max: 10_000 });
    case "bigint":
      return BigInt(faker.number.int({ min: 1, max: 10_000 }));
    case "boolean":
      return faker.datatype.boolean();
    case "symbol":
      return Symbol(faker.string.alphanumeric(8));
    case "null":
      return null;
    case "undefined":
      return undefined;
    case "date":
      return faker.date.recent();
    case "any":
    case "unknown":
      return {};
  }
}

function getState(options: MockOptions | undefined): MockState {
  if (options?.__state) {
    return options.__state;
  }

  const state: MockState = { counts: new Map<string, number>() };

  if (options) {
    options.__state = state;
  }

  return state;
}

function shouldShortCircuit(
  state: MockState,
  typeName: string,
  maxDepth: number,
): boolean {
  return (state.counts.get(typeName) ?? 0) >= maxDepth;
}

function enterType(state: MockState, typeName: string) {
  state.counts.set(typeName, (state.counts.get(typeName) ?? 0) + 1);
}

function exitType(state: MockState, typeName: string) {
  const next = (state.counts.get(typeName) ?? 1) - 1;

  if (next <= 0) {
    state.counts.delete(typeName);
    return;
  }

  state.counts.set(typeName, next);
}

function mergeValues<T>(defaults: T, overrides: T | undefined): T {
  if (overrides === undefined) {
    return cloneValue(defaults) as T;
  }

  if (Array.isArray(overrides)) {
    return cloneValue(overrides) as T;
  }

  if (Array.isArray(defaults)) {
    return cloneValue(overrides) as T;
  }

  if (isPlainObject(defaults) && isPlainObject(overrides)) {
    const result: Record<string, unknown> = {};
    const keys = new Set([
      ...Object.keys(defaults as Record<string, unknown>),
      ...Object.keys(overrides as Record<string, unknown>),
    ]);

    for (const key of keys) {
      if (hasOwn(overrides, key)) {
        result[key] = mergeValues(
          (defaults as Record<string, unknown>)[key],
          (overrides as Record<string, unknown>)[key],
        );
      } else {
        result[key] = cloneValue((defaults as Record<string, unknown>)[key]);
      }
    }

    return result as T;
  }

  return cloneValue(overrides) as T;
}

function collectExplicitPaths(
  value: unknown,
  currentPath = "",
  result = new Set<string>(),
): Set<string> {
  if (value === undefined) {
    return result;
  }

  if (currentPath) {
    result.add(currentPath);
  }

  if (Array.isArray(value)) {
    value.forEach((item, index) => {
      collectExplicitPaths(item, joinPath(currentPath, String(index)), result);
    });
    return result;
  }

  if (!isPlainObject(value)) {
    return result;
  }

  for (const [key, nested] of Object.entries(value)) {
    collectExplicitPaths(nested, joinPath(currentPath, key), result);
  }

  return result;
}

function isProtectedPath(explicitPaths: Set<string>, targetPath: string): boolean {
  for (const explicitPath of explicitPaths) {
    if (
      explicitPath === targetPath ||
      explicitPath.startsWith(`${targetPath}.`) ||
      targetPath.startsWith(`${explicitPath}.`)
    ) {
      return true;
    }
  }

  return false;
}

function getByPath(value: unknown, path: string): {
  exists: boolean;
  value: unknown;
} {
  if (!path) {
    return { exists: true, value };
  }

  const segments = path.split(".");
  let current = value;

  for (const segment of segments) {
    if (Array.isArray(current)) {
      const index = Number(segment);
      if (!Number.isInteger(index) || index < 0 || index >= current.length) {
        return { exists: false, value: undefined };
      }
      current = current[index];
      continue;
    }

    if (!isPlainObject(current) || !hasOwn(current, segment)) {
      return { exists: false, value: undefined };
    }

    current = (current as Record<string, unknown>)[segment];
  }

  return { exists: true, value: current };
}

function setByPath(target: unknown, path: string, value: unknown) {
  const segments = path.split(".");
  let current = target as Record<string, unknown>;

  for (let index = 0; index < segments.length - 1; index += 1) {
    const segment = segments[index];
    const nextSegment = segments[index + 1];

    if (!segment || !nextSegment) {
      return;
    }

    const existing = current[segment];

    if (Array.isArray(existing) || isPlainObject(existing)) {
      current = existing as Record<string, unknown>;
      continue;
    }

    current[segment] = /^\d+$/.test(nextSegment) ? [] : {};
    current = current[segment] as Record<string, unknown>;
  }

  const lastSegment = segments.at(-1);
  if (!lastSegment) {
    return;
  }

  if (Array.isArray(current)) {
    current[Number(lastSegment)] = value;
    return;
  }

  current[lastSegment] = value;
}

function joinPath(left: string, right: string): string {
  if (!left) {
    return right;
  }

  return `${left}.${right}`;
}

function getPropertyName(path: string): string {
  return path.split(".").at(-1)?.replace(/\[\]$/, "") ?? path;
}

function cloneValue<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((item) => cloneValue(item)) as T;
  }

  if (value instanceof Date) {
    return new Date(value.getTime()) as T;
  }

  if (isPlainObject(value)) {
    const result: Record<string, unknown> = {};

    for (const [key, nested] of Object.entries(value)) {
      result[key] = cloneValue(nested);
    }

    return result as T;
  }

  return value;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object") {
    return false;
  }

  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function hasOwn(value: unknown, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}

export { faker };
