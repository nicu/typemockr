import type { GenerationRegistry } from "./types";

export function defineRegistry(registry: GenerationRegistry): GenerationRegistry {
  return registry;
}

export function resolveGenerationRegistry(value: unknown): GenerationRegistry {
  if (!value || typeof value !== "object") {
    return {};
  }

  const maybeModule = value as {
    default?: unknown;
    registry?: unknown;
  };
  const candidate = maybeModule.default ?? maybeModule.registry ?? maybeModule;

  return isGenerationRegistry(candidate) ? candidate : {};
}

function isGenerationRegistry(value: unknown): value is GenerationRegistry {
  if (!value || typeof value !== "object") {
    return false;
  }

  const registry = value as GenerationRegistry;
  return (
    registry.values === undefined ||
    typeof registry.values === "object" ||
    typeof registry.provideValue === "function" ||
    typeof registry.rules === "object"
  );
}
