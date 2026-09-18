import type {
  GenerationRegistry,
  LegacyMappingProvider,
  LegacyMappings,
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
      if (context.kind !== "scalar" || !context.scalar || !LEGACY_SCALARS.has(context.scalar)) {
        return undefined;
      }

      const provided = provider?.(context.scalar, context.path, {
        sourceFile: context.sourceFile,
        entityName: context.entityName,
      });
      if (typeof provided === "string" && provided.length > 0) {
        return provided;
      }

      return matchers.find(([pattern]) => pattern.test(context.path))?.[1];
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

function compileLegacyMappings(mappings: LegacyMappings): Array<[RegExp, string]> {
  const matchers: Array<[RegExp, string]> = [];

  for (const [key, value] of Object.entries(mappings)) {
    if (typeof value === "string") {
      // { pattern: expression }
      matchers.push([legacyPatternToRegExp(key), value]);
    } else if (Array.isArray(value)) {
      // { expression: [patterns] }
      for (const pattern of value) {
        matchers.push([legacyPatternToRegExp(pattern), key]);
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
