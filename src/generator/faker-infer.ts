import { defineGeneratorMatchers } from "../category";

// Optional context with file info we can thread through value generation
export type GenerationContext = {
  sourceFile?: string;
  mockFile?: string;
  entityName?: string;
  entityHasRecursion?: boolean;
  genericParamSet?: Set<string>;
  typesWithOptions?: Set<string>;
};

// Module-level infer generator which can be configured by callers via `setMappings`.
let inferGenerator = defineGeneratorMatchers({} as Record<string, string[]>);
// Optional runtime mapping provider function supplied by the consuming project.
let mappingProviderFunc:
  | ((
      type: string,
      path: string,
      _context?: GenerationContext
    ) => string | undefined | null)
  | undefined = undefined;

export function setMappings(mappings?: Record<string, string | string[]>) {
  // Support both shapes:
  // 1) legacy: { "faker.xxx()": ["*.email", "*.id"] }
  // 2) new:    { "*.id": "faker.string.uuid()", "*firstName*": "faker.person.firstName()" }
  if (!mappings || Object.keys(mappings).length === 0) {
    inferGenerator = defineGeneratorMatchers({} as Record<string, string[]>);
    return;
  }

  // Detect shape by inspecting the first value type
  const firstVal = Object.values(mappings)[0];
  let normalized: Record<string, string[]> = {};
  if (typeof firstVal === "string") {
    // pattern -> generator  (new style). Convert to generator -> [patterns]
    for (const [pattern, generator] of Object.entries(mappings)) {
      if (typeof generator !== "string") continue;
      const g = generator as string;
      if (!normalized[g]) normalized[g] = [];
      normalized[g].push(pattern);
    }
  } else {
    // generator -> patterns (legacy shape)
    normalized = mappings as Record<string, string[]>;
  }

  inferGenerator = defineGeneratorMatchers(
    normalized as Record<string, string[]>
  );
}

export function setMappingProvider(
  fn?: (
    type: string,
    path: string,
    _context?: GenerationContext
  ) => string | undefined | null
) {
  mappingProviderFunc = fn;
}

export function inferMapping(path: string): string | null {
  return inferGenerator(path) || null;
}

export function getFakerGenerator(
  type: string,
  path: string,
  _context?: GenerationContext
) {
  // If a runtime mapping provider exists, call it first. If it returns a value
  // (truthy or empty string), use it. If it returns undefined/null, fall through.
  try {
    if (mappingProviderFunc) {
      const v = mappingProviderFunc(type, path, _context);
      if (v !== undefined && v !== null) return v;
    }
  } catch (err) {
    // If the provider throws, ignore and fall back to built-in mappings
    console.error("mappingProvider threw:", err);
  }
  const nameBased = inferGenerator(path);

  if (nameBased) {
    if (
      type === "number" &&
      /string\.|uuid\(|alphanumeric\(/i.test(nameBased)
    ) {
      return "faker.number.int(10000)";
    }
    if (type === "date" && /string\.|uuid\(|alphanumeric\(/i.test(nameBased)) {
      return "faker.date.recent()";
    }
    if (
      type === "boolean" &&
      /string\.|uuid\(|alphanumeric\(/i.test(nameBased)
    ) {
      return "faker.datatype.boolean()";
    }
    return nameBased;
  }

  switch (type) {
    case "any":
    case "string":
      return "faker.lorem.words()";
    case "unknown":
      return "{}";
    case "number":
      return "faker.number.int(10000)";
    case "boolean":
      return "faker.datatype.boolean()";
    case "null":
      return "null";
    case "date":
      return "faker.date.recent()";
    case "object":
      return "{}";
    default:
      return "faker.lorem.words()";
  }
}
