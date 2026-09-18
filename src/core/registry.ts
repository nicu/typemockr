import type {
  GenerationRegistry,
  LegacyMappingProvider,
  LegacyMappings,
  MappingEntry,
  ScalarKind,
  ValueExpressionContext,
} from "./types";

export function defineRegistry(registry: GenerationRegistry): GenerationRegistry {
  return registry;
}

export function resolveGenerationRegistry(
  value: unknown,
  source = "registry module",
): GenerationRegistry {
  if (!value || typeof value !== "object") {
    throw new Error(`${source} must export a registry object.`);
  }

  const maybeModule = value as {
    default?: unknown;
    registry?: unknown;
  };
  const candidate = maybeModule.default ?? maybeModule.registry ?? maybeModule;

  if (!isGenerationRegistry(candidate)) {
    throw new Error(
      `${source} must export a registry with \`values\`, \`provideValue\` or \`rules\`.`,
    );
  }

  return candidate;
}

export function resolveLegacyMappingProvider(
  value: unknown,
  source = "mappingProvider module",
): LegacyMappingProvider {
  if (typeof value === "function") {
    return value as LegacyMappingProvider;
  }

  if (value && typeof value === "object") {
    const maybeModule = value as Record<string, unknown>;
    for (const key of ["mappingProvider", "default", "getMapping"]) {
      if (typeof maybeModule[key] === "function") {
        return maybeModule[key] as LegacyMappingProvider;
      }
    }
  }

  throw new Error(
    `${source} must export a \`mappingProvider(type, path, context)\` function (named or default export).`,
  );
}

// Scalars the 0.1.x generator handed to `mappingProvider`/`mappings`. Literal-like scalars
// (`null`, `undefined`) and structured nodes never went through the provider.
const LEGACY_SCALARS = new Set<ScalarKind>([
  "string",
  "number",
  "bigint",
  "boolean",
  "date",
  "any",
  "unknown",
]);

/**
 * Adapts the 0.1.x `mappingProvider` / `mappings` options to a registry. The provider is called
 * as `provider(scalarType, "Entity.prop", { sourceFile, entityName })` for scalar leaves only;
 * the first non-empty result wins, and inline `mappings` are the fallback.
 */
export function createLegacyRegistry(options: {
  mappingProvider?: LegacyMappingProvider;
  mappings?: LegacyMappings;
}): GenerationRegistry | undefined {
  const matchers = options.mappings ? compileLegacyMappings(options.mappings) : [];
  const provider = options.mappingProvider;

  if (!provider && matchers.length === 0) {
    return undefined;
  }

  return {
    provideValue(context) {
      const scalar = context.scalar;
      if (context.kind !== "scalar" || !scalar || !LEGACY_SCALARS.has(scalar)) {
        return undefined;
      }

      const provided = provider?.(scalar, context.path, {
        sourceFile: context.sourceFile,
        entityName: context.entityName,
      });
      if (typeof provided === "string" && provided.length > 0) {
        return provided;
      }

      return matchers.find((matcher) =>
        matchesLegacyMapping(matcher, scalar, context.path),
      )?.value;
    },
  };
}

/** Merges registries; earlier registries win for values and provided expressions. */
export function composeRegistries(
  registries: Array<GenerationRegistry | undefined>,
): GenerationRegistry {
  const present = registries.filter(
    (registry): registry is GenerationRegistry => Boolean(registry),
  );

  if (present.length <= 1) {
    return present[0] ?? {};
  }

  const values = Object.assign(
    {},
    ...present.map((registry) => registry.values ?? {}).reverse(),
  ) as Record<string, string>;
  const rules: Record<string, string[]> = {};
  for (const registry of present) {
    for (const [name, lines] of Object.entries(registry.rules ?? {})) {
      rules[name] = [...(rules[name] ?? []), ...lines];
    }
  }

  return {
    values,
    rules,
    provideValue(context: ValueExpressionContext) {
      for (const registry of present) {
        const provided = registry.provideValue?.(context);
        if (typeof provided === "string" && provided.length > 0) {
          return provided;
        }
      }
      return undefined;
    },
  };
}

interface LegacyMatcher {
  /** Undefined when the entry has no `path`, i.e. it matches every path. */
  pattern?: RegExp;
  /** Undefined when the entry has no `type`, i.e. it matches every scalar. */
  types?: ScalarKind[];
  value: string;
}

function matchesLegacyMapping(
  matcher: LegacyMatcher,
  scalar: ScalarKind,
  path: string,
): boolean {
  if (matcher.types && !matcher.types.includes(scalar)) {
    return false;
  }

  return matcher.pattern === undefined || matcher.pattern.test(path);
}

function compileLegacyMappings(mappings: LegacyMappings): LegacyMatcher[] {
  return Array.isArray(mappings)
    ? mappings.map((entry, index) => compileMappingEntry(entry, index))
    : compileLegacyMappingObject(mappings);
}

function compileMappingEntry(entry: MappingEntry, index: number): LegacyMatcher {
  const at = `\`mappings[${index}]\``;

  if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
    throw new Error(`${at} must be an object with a \`value\` expression.`);
  }

  if (typeof entry.value !== "string" || entry.value.length === 0) {
    throw new Error(`${at}.value must be a non-empty expression string.`);
  }

  if (entry.path !== undefined && typeof entry.path !== "string") {
    throw new Error(`${at}.path must be a path pattern string.`);
  }

  return {
    pattern: entry.path === undefined ? undefined : legacyPatternToRegExp(entry.path),
    types: compileMappingEntryTypes(entry.type, at),
    value: entry.value,
  };
}

function compileMappingEntryTypes(
  type: MappingEntry["type"],
  at: string,
): ScalarKind[] | undefined {
  if (type === undefined) {
    return undefined;
  }

  const types = Array.isArray(type) ? type : [type];
  const unknownType = types.find((candidate) => !LEGACY_SCALARS.has(candidate));

  if (unknownType !== undefined || types.length === 0) {
    throw new Error(
      `${at}.type must be one or more of ${[...LEGACY_SCALARS].join(", ")}.`,
    );
  }

  return types;
}

function compileLegacyMappingObject(
  mappings: Record<string, string | string[]>,
): LegacyMatcher[] {
  const matchers: LegacyMatcher[] = [];

  for (const [key, value] of Object.entries(mappings)) {
    if (typeof value === "string") {
      // { pattern: expression }
      matchers.push({ pattern: legacyPatternToRegExp(key), value });
    } else if (Array.isArray(value)) {
      // { expression: [patterns] }
      for (const pattern of value) {
        matchers.push({ pattern: legacyPatternToRegExp(pattern), value: key });
      }
    } else {
      throw new Error(
        `\`mappings.${key}\` must be an expression string or an array of path patterns.`,
      );
    }
  }

  return matchers;
}

// Same semantics as 0.1.x: `*` is a lazy wildcard, matching is case-insensitive.
function legacyPatternToRegExp(pattern: string): RegExp {
  const escaped = pattern
    .replace(/[-/\\^$+?.()|[\]{}]/g, "\\$&")
    .replace(/\*/g, ".*?");
  return new RegExp(`^${escaped}$`, "i");
}

function isGenerationRegistry(value: unknown): value is GenerationRegistry {
  if (!value || typeof value !== "object") {
    return false;
  }

  const registry = value as GenerationRegistry;
  return (
    (registry.values !== undefined && typeof registry.values === "object") ||
    typeof registry.provideValue === "function" ||
    (registry.rules !== undefined && typeof registry.rules === "object")
  );
}
