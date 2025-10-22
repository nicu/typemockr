import fs from "fs";
import path from "path";

import type {
  ASTArrayProperty,
  ASTConstantProperty,
  ASTEntity,
  ASTFunctionProperty,
  ASTIntersectionProperty,
  ASTObjectProperty,
  ASTPrimitiveProperty,
  ASTProperty,
  ASTPropertyValue,
  ASTRecordProperty,
  ASTReferenceProperty,
  ASTUnionProperty,
} from "./ast-types";
import { getOutputPathsForSourceFile } from "./typemockr";
import {
  setMappings,
  setMappingProvider,
  getFakerGenerator,
  inferMapping,
  type GenerationContext,
} from "./generator";

function generatePrimitive(
  prop: ASTPrimitiveProperty,
  path: string,
  includeTypes: boolean,
  context?: GenerationContext
) {
  const gen = getFakerGenerator(prop.value, path, context);
  // Return the raw generator expression. Avoid applying a blanket `as Type[...]` here
  // because it can produce incorrectly-placed assertions (inside helpers). When
  // a typed assertion is required for composed base defaults we apply it at the
  // call site where the entire expression can be wrapped.
  return gen;
}

function generateConstantValue(
  prop: ASTConstantProperty,
  path: string,
  includeTypes: boolean,
  isUnionOrEnum = false
) {
  let value =
    typeof prop.value === "string" ? `"${prop.value}"` : prop.value.toString();

  // Only add type assertion if this is part of a union/enum
  if (includeTypes && isUnionOrEnum) {
    const [entity, ...propPath] = path.split(".");
    if (entity && propPath.length) {
      const accessKeys = propPath.map((key) => `["${key}"]`).join("");
      return `${value} as ${entity}${accessKeys}`;
    }
  }

  // For single constant properties, add 'as const' to preserve literal type
  if (includeTypes) value = `${value} as const`;
  return value;
}

function generateArrayValue(
  prop: ASTArrayProperty,
  path: string,
  includeTypes: boolean,
  context?: GenerationContext
) {
  const [type] = prop.value;
  if (!type) return "[]";
  // Always use faker.helpers.multiple(() => MockX()) for arrays of references
  if (type.type === "reference") {
    // If the reference is an import() expression, extract the type name
    const refVal = (type as any).value as string;
    const match = refVal.match(/\.([A-Za-z0-9_]+)$/);
    const typeName = match?.[1] ?? refVal;

    // Handle special case for __type (anonymous object types with index signatures)
    // These represent types like { [key: string]: string } which can't be meaningfully mocked
    if (typeName === "__type") {
      // Return a typed empty array so it's mutable and matches the property type
      if (includeTypes) {
        const [entity, ...propPath] = path.split(".");
        const accessKeys = propPath.length
          ? `["${propPath.join('"]["')}"]`
          : "";
        return `[] as ${entity}${accessKeys}`;
      }
      return "[]";
    }

    // If this edge is marked recursive and the enclosing entity supports depth, guard by depth
    if ((type as any).recursiveEdge && context?.entityHasRecursion) {
      const passOpts =
        (typeName && context?.typesWithOptions?.has(typeName)) ||
        typeName === context?.entityName;
      const inner = passOpts
        ? `Mock${typeName}({}, { depth: depth + 1, maxDepth })`
        : `Mock${typeName}()`;
      if (includeTypes) {
        return `depth >= maxDepth ? ([] as ${typeName}[]) : faker.helpers.multiple(() => ${inner})`;
      }
      return `depth >= maxDepth ? [] : faker.helpers.multiple(() => ${inner})`;
    }

    // If referencing a generic type parameter, use the provided generic mock callback
    if (
      typeName &&
      context?.genericParamSet &&
      context.genericParamSet.has(typeName)
    ) {
      return `faker.helpers.multiple(() => mock${typeName}())`;
    }

    return `faker.helpers.multiple(() => Mock${typeName}())`;
  }
  const value = generateValue(type, path, includeTypes, context);
  const wrapped = value.trim().startsWith("{") ? `(${value})` : value;
  return `faker.helpers.multiple(() => ${wrapped})`;
}

function generateRecordValue(
  prop: ASTRecordProperty,
  path: string,
  includeTypes: boolean
) {
  // Log that we encountered a record type
  console.warn(
    `Encountered Record type at path: ${path}, returning empty object {}`
  );

  if (includeTypes) {
    const [entity, ...propPath] = path.split(".");
    if (entity && propPath.length) {
      const accessKeys = propPath.map((key) => `["${key}"]`).join("");
      return `{} as ${entity}${accessKeys}`;
    }
  }
  return "{}";
}

function generateReferenceValue(
  prop: ASTReferenceProperty,
  context?: GenerationContext
) {
  // If the reference is an import() expression, extract the type name
  const refVal = prop.value as string;
  const match = refVal.match(/\.([A-Za-z0-9_]+)$/);
  const typeName = match?.[1] ?? refVal;
  // Special case for anonymous index-signature/object types
  if (typeName === "__type") {
    // Cast to the expected type when available via path context
    return "{}";
  }
  // If referencing a generic type parameter, use the provided generic mock callback
  if (context?.genericParamSet && context.genericParamSet.has(typeName)) {
    return `mock${typeName}()`;
  }
  // Only pass options when we know the target mock accepts __options (to avoid signature mismatches like enums)
  if ((prop as any).recursiveEdge && context?.entityHasRecursion) {
    const passOpts =
      context?.typesWithOptions?.has(typeName) ||
      typeName === context?.entityName;
    if (passOpts) {
      return `Mock${typeName}({}, { depth: depth + 1, maxDepth })`;
    }
  }
  return `Mock${typeName}()`;
}

function generateUnionValue(
  prop: ASTUnionProperty,
  path: string,
  includeTypes: boolean,
  context?: GenerationContext
) {
  // Handle empty unions - return undefined
  if (prop.value.length === 0) {
    return "undefined";
  }

  // If all values are references, emit MockX() for each
  const allReferences = prop.value.every((v) => v.type === "reference");
  if (allReferences) {
    const values = prop.value
      .map((val) => {
        const valStr = (val as any).value as string;
        const match = valStr.match(/\.([A-Za-z0-9_]+)$/);
        const typeName = match?.[1] ?? valStr;
        if ((val as any).recursiveEdge && context?.entityHasRecursion) {
          const passOpts =
            (typeName && context?.typesWithOptions?.has(typeName)) ||
            typeName === context?.entityName;
          return passOpts
            ? `Mock${typeName}({}, { depth: depth + 1, maxDepth })`
            : `Mock${typeName}()`;
        }
        return `Mock${typeName}()`;
      })
      .join(", ");
    return `faker.helpers.arrayElement([${values}])`;
  }

  // If all values are string constants, use as Type["prop"]
  const allStringLiterals = prop.value.every(
    (v) => v.type === "constant" && typeof (v as any).value === "string"
  );
  // If this is a union of only one string, just emit the string
  if (allStringLiterals && prop.value.length === 1) {
    return `"${(prop.value[0] as any).value}"`;
  }
  if (allStringLiterals && includeTypes) {
    const [entity, ...propPath] = path.split(".");
    const accessKeys = propPath.length ? `[\"${propPath.join(']["')}\"]` : "";
    const values = prop.value
      .map((val) => {
        const v = (val as any).value;
        return `"${v}" as ${entity}${accessKeys}`;
      })
      .join(", ");
    return `faker.helpers.arrayElement([${values}])`;
  }

  // fallback: default behavior
  const values = prop.value
    .map((val) => generateValue(val, path, includeTypes, context))
    .join(", ");
  return `faker.helpers.arrayElement([${values}])`;
}

function generateIntersectionValue(
  prop: ASTIntersectionProperty,
  path: string,
  includeTypes: boolean,
  context?: GenerationContext
) {
  const properties = prop.value
    .map((item) => {
      const value = generateValue(item, path, includeTypes, context);

      if (item.type === "reference") {
        // spread the reference types
        return `...${value}`;
      }

      if (item.type === "object" || item.type === "record") {
        // remove the curly braces
        if (value.at(0) === "{" && value.at(-1) === "}") {
          return value.substring(1, value.length - 1);
        }
      }

      return value;
    })
    .join(", ");

  return `{ ${properties} }`;
}

function generateObjectValue(
  prop: ASTObjectProperty,
  path: string,
  includeTypes: boolean,
  context?: GenerationContext
) {
  // If the object is a reference property, use MockX() instead of expanding
  const first = prop.value[0];
  if (prop.value.length === 1 && first && first.type === "reference") {
    const ref = first as any as ASTReferenceProperty;
    const match = ref.value.match(/\.([A-Za-z0-9_]+)$/);
    const typeName = match?.[1] ?? ref.value;
    if ((ref as any).recursiveEdge && context?.entityHasRecursion) {
      const passOpts =
        (typeName && context?.typesWithOptions?.has(typeName)) ||
        typeName === context?.entityName;
      return passOpts
        ? `Mock${typeName}({}, { depth: depth + 1, maxDepth })`
        : `Mock${typeName}()`;
    }
    return `Mock${typeName}()`;
  }
  const properties = prop.value
    .map((item) =>
      generateProperty(item, item.name, path, includeTypes, context)
    )
    .join(", ");
  return `{ ${properties} }`;
}

function generateFunctionValue(_prop: ASTFunctionProperty) {
  // Log that we encountered a function type and will omit it
  console.warn("Encountered function type in AST, omitting from mock output.");
  // Return undefined to signal omission
  return undefined as any;
}

function generateValue(
  prop: ASTPropertyValue,
  path: string,
  includeTypes: boolean,
  context?: GenerationContext
): string {
  switch (prop.type) {
    case "primitive":
      return generatePrimitive(prop, path, includeTypes, context);
    case "constant":
      return generateConstantValue(prop, path, includeTypes);
    case "reference":
      return generateReferenceValue(prop, context);
    case "union":
      return generateUnionValue(prop, path, includeTypes, context);
    case "intersection":
      return generateIntersectionValue(prop, path, includeTypes, context);
    case "record":
      return generateRecordValue(prop, path, includeTypes);
    case "array":
      return generateArrayValue(prop, path, includeTypes, context);
    case "object":
      return generateObjectValue(prop, path, includeTypes, context);
    case "function": {
      // Omit function properties from the mock output
      generateFunctionValue(prop); // still logs
      return undefined as any;
    }
    default:
      console.warn(
        `Encountered unknown AST property type: ${prop.type} at path: ${path}`
      );
      return `"/* TODO ${prop.type} */"`;
  }
}

function generateProperty(
  prop: ASTProperty,
  name: string,
  path: string,
  includeTypes: boolean,
  context?: GenerationContext
) {
  let value = generateValue(prop, `${path}.${name}`, includeTypes, context);
  // If we produced a bare {} for a typed property, assert it to the property's type path for stronger typing
  if (includeTypes && typeof value === "string" && value.trim() === "{}") {
    const fullPath = `${path}.${name}`;
    const [entity, ...propPathParts] = fullPath.split(".");
    if (entity && propPathParts.length) {
      const accessKeys = propPathParts.map((k) => `["${k}"]`).join("");
      value = `{} as ${entity}${accessKeys}`;
    }
  }
  if (prop.optional) {
    const wrapped = value.trim().startsWith("{") ? `(${value})` : value;
    // return `"${name}": faker.helpers.maybe(() => ${wrapped}, { probability: 0.8 })`;
    return `"${name}": faker.helpers.maybe(() => ${wrapped})`;
  }
  return `"${name}": ${value}`;
}

// Helper: remove unused __options signature and destructuring when depth/maxDepth aren't referenced
function stripUnusedOptionsFromText(text: string) {
  // If the body references depth/maxDepth or __options, keep as-is
  if (/\bdepth\b|\bmaxDepth\b|__options/.test(text)) return text;

  // Remove `, __options` (with possible type annotations) from function signatures
  text = text.replace(
    /function (Mock[A-Za-z0-9_]+)\(([^)]*?),?\s*__options\s*(?:[:=][^,)]*)?(,?\s*)?\)/g,
    (_m, fn, args, trailing) => {
      // Remove trailing comma if present
      const newArgs = args.replace(/,\s*$/, "");
      return `function ${fn}(${newArgs})`;
    }
  );

  // Remove the destructuring line `const { depth = 0, maxDepth = 2 } = __options;`
  text = text.replace(
    /\n?\s*const\s*\{\s*depth\s*=\s*0,\s*maxDepth\s*=\s*2\s*\}\s*=\s*__options;?/g,
    ""
  );

  return text;
}

// Accept typeToFileMap as an optional argument
export function generate(
  projectRootDir: string,
  outputRootDir: string,
  baseDir: string[],
  data: Array<ASTEntity>,
  includeTypes = false,
  useExport = false,
  currentMockFilePath?: string,
  typeToFileMap?: Map<string, string>,
  mappings?: Record<string, string[]>,
  mappingProvider?: string,
  format: "ts" | "js" = "ts"
) {
  // Initialize the inferGenerator with provided mappings (or fallback legacy file)
  setMappings(mappings);
  // If the consumer provided a mappingProvider path (relative to cwd/project root), try to require it.
  if (mappingProvider) {
    try {
      // Resolve relative to process.cwd() so consumer can set e.g. "./typemockr-provider.ts"
      const providerPath = path.isAbsolute(mappingProvider)
        ? mappingProvider
        : path.join(process.cwd(), mappingProvider);
      // Use require to load CommonJS or transpiled JS. If it's TS, consumer should compile or provide JS.
      // Use optional try/catch to avoid crashing the generator if not present.
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const mod = require(providerPath);
      const fn =
        mod && (mod.default || mod.mappingProvider || mod.getMapping || mod);
      if (typeof fn === "function") {
        setMappingProvider(fn as any);
      }
    } catch (err) {
      // Ignore load errors; fall back to mappings only.
      // But log to help users debug misconfigured provider paths
      console.error(
        `Failed to load mappingProvider from ${mappingProvider}:`,
        err
      );
    }
  }
  // 1. Collect generic type parameters from all entities
  const genericTypeParams = new Set<string>();
  data.forEach((item) => {
    const generics = (item as any).generics || [];
    generics.forEach((g: any) => genericTypeParams.add(g.name));
  });

  // Pre-scan: for each name, determine the highest-precedence kind to emit once
  const precedence: Record<string, number> = {
    instance: 7,
    enum: 6,
    alias: 5,
    union: 4,
    array: 3,
    primitive: 3,
    constant: 2,
    placeholder: 1,
  } as const;
  const nameToBestKind = new Map<string, string>();
  data.forEach((item) => {
    const prev = nameToBestKind.get(item.name);
    const currKind = (item as any).type as string;
    if (!prev) {
      nameToBestKind.set(item.name, currKind);
    } else {
      const prevRank = precedence[prev] ?? 0;
      const currRank = precedence[currKind] ?? 0;
      if (currRank > prevRank) nameToBestKind.set(item.name, currKind);
    }
  });

  // 2. Collect referenced types with their location information
  const referencedTypes = new Set<string>();
  const referencedTypeLocations = new Map<string, string>(); // typeName -> sourceFilePath
  function collectReferences(prop: ASTPropertyValue) {
    if (prop.type === "reference") {
      // Skip generic type parameters and __type references (anonymous object types)
      if (!genericTypeParams.has(prop.value) && prop.value !== "__type") {
        referencedTypes.add(prop.value);
        // If the reference has location information, store it
        if ("location" in prop && prop.location?.file) {
          referencedTypeLocations.set(prop.value, prop.location.file);
        }
      }
    } else if ("value" in prop && Array.isArray(prop.value)) {
      prop.value.forEach(collectReferences);
    } else if (
      "value" in prop &&
      typeof prop.value === "object" &&
      prop.value !== null
    ) {
      collectReferences(prop.value as any);
    }
  }
  data.forEach((entity) => {
    if ("properties" in entity && Array.isArray(entity.properties)) {
      entity.properties.forEach((prop: any) => collectReferences(prop));
    }
  });
  // Ensure we only emit inline TypeScript annotations when format === 'ts'
  includeTypes = Boolean(includeTypes && format === "ts");

  const body = data
    .filter((item) => {
      // Emit only the highest-precedence definition per name to avoid duplicates
      const best = nameToBestKind.get(item.name);
      return best === (item as any).type;
    })
    .map((item) => {
      // Build a set of type names in this file whose mocks accept __options (recursive entities)
      const typesWithOptions = new Set<string>();
      data.forEach((e) => {
        if ((e as any).hasRecursion) typesWithOptions.add(e.name);
      });

      const context: GenerationContext = {
        sourceFile: (item as any)?.location?.file,
        mockFile: currentMockFilePath,
        entityName: item.name,
        entityHasRecursion: (item as any).hasRecursion === true,
        // Propagate generic parameter names for this entity only
        genericParamSet: new Set<string>(
          ((item as any).generics || []).map((g: any) => g.name)
        ),
        typesWithOptions,
      };
      // Extract generic parameters for proper type handling
      const generics = (item as any).generics || [];
      const genericTypes =
        generics.length > 0
          ? `<${generics.map((g: any) => g.name).join(", ")}>`
          : "";

      const overridesType = includeTypes
        ? `: Partial<${item.name}${genericTypes}>`
        : "";
      const resultType = includeTypes ? `: ${item.name}${genericTypes}` : "";
      const exportKeyword = useExport ? `export ` : "";
      const anyType = includeTypes ? `: any` : "";

      const output = [];
      // if (item.isExported) {
      switch (item.type) {
        case "alias":
          {
            const values = item.entities
              .map((entity) => {
                const match = entity.match(/\.([A-Za-z0-9_]+)$/);
                const typeName = match ? match[1] : entity;
                // Pass depth if this alias is recursive
                if ((item as any).hasRecursion) {
                  return `Mock${typeName}({}, { depth: depth + 1, maxDepth })`;
                }
                return `Mock${typeName}()`;
              })
              .join(", ");

            if ((item as any).hasRecursion) {
              if (includeTypes) {
                output.push(
                  `${exportKeyword}function Mock${item.name}(overrides${overridesType} = {}, __options: { depth?: number; maxDepth?: number } = {})${resultType} {`
                );
                output.push(`  const { depth = 0, maxDepth = 2 } = __options;`);
              } else {
                output.push(
                  `${exportKeyword}function Mock${item.name}(overrides = {}, __options = {}) {`
                );
                output.push(`  const { depth = 0, maxDepth = 2 } = __options;`);
              }
            } else {
              if (includeTypes) {
                output.push(
                  `${exportKeyword}function Mock${item.name}(overrides${overridesType} = {})${resultType} {`
                );
              } else {
                output.push(
                  `${exportKeyword}function Mock${item.name}(overrides = {}) {`
                );
              }
            }
            output.push(`  const result = faker.helpers.arrayElement([`);
            output.push(`    faker.helpers.arrayElement([${values}])`);
            output.push(`  ]);`);
            output.push(`  return { ...result, ...overrides }`);
            output.push(`}`);

            output.push("");
          }
          return output.join("\n");

        case "union":
          {
            // If all values are references or intersections, emit MockX() or intersection for each
            const allRefsOrIntersections = item.values.every(
              (v) => v.type === "reference" || v.type === "intersection"
            );
            if (allRefsOrIntersections) {
              const values = item.values
                .map((val) => {
                  if (val.type === "reference") {
                    if (
                      (val as any).recursiveEdge &&
                      context?.entityHasRecursion
                    ) {
                      return `Mock${val.value}({}, { depth: depth + 1, maxDepth })`;
                    }
                    return `Mock${val.value}()`;
                  } else if (val.type === "intersection") {
                    // For intersection, recursively generate the value
                    return generateIntersectionValue(
                      val,
                      item.name,
                      includeTypes,
                      context
                    );
                  }
                  return "undefined";
                })
                .join(", ");
              if ((item as any).hasRecursion) {
                if (includeTypes) {
                  output.push(
                    `${exportKeyword}function Mock${item.name}(overrides${overridesType}, __options: { depth?: number; maxDepth?: number } = {})${resultType} {`
                  );
                  output.push(
                    `  const { depth = 0, maxDepth = 2 } = __options;`
                  );
                } else {
                  output.push(
                    `${exportKeyword}function Mock${item.name}(overrides, __options = {}) {`
                  );
                  output.push(
                    `  const { depth = 0, maxDepth = 2 } = __options;`
                  );
                }
              } else {
                if (includeTypes) {
                  output.push(
                    `${exportKeyword}function Mock${item.name}(overrides${overridesType})${resultType} {`
                  );
                } else {
                  output.push(
                    `${exportKeyword}function Mock${item.name}(overrides) {`
                  );
                }
              }
              output.push(
                `  return overrides ?? faker.helpers.arrayElement([${values}]);`
              );
              output.push(`}`);
              output.push("");
              return output.join("\n");
            }
            // Otherwise, treat as constants (string/number/boolean)
            const values = item.values
              .map((value) => {
                return generateConstantValue(
                  value as ASTConstantProperty,
                  item.name,
                  includeTypes,
                  true // isUnionOrEnum
                );
              })
              .join(", ");

            output.push(
              `${exportKeyword}function Mock${item.name}(overrides${overridesType})${resultType} {`
            );
            output.push(
              `  return overrides ?? faker.helpers.arrayElement([${values}]);`
            );
            output.push(`}`);
            output.push("");
          }
          return output.join("\n");

        case "instance":
          {
            // Extract generic parameters
            const generics = (item as any).generics || [];
            const genericParams =
              generics.length > 0
                ? `<${generics.map((g: any) => `${g.name} = any`).join(", ")}>`
                : "";

            const genericTypes =
              generics.length > 0
                ? `<${generics.map((g: any) => g.name).join(", ")}>`
                : "";

            // For each inherited base, extract the class name from import() expressions
            function extractBaseName(entity: any) {
              const expr = typeof entity === "string" ? entity : entity?.expr;
              if (!expr) return "";
              // Handle complex generic inheritance like: import("...").GenericOrderItemSummaryBase<import("...").GenericProductSummary>
              // We want to extract just "GenericOrderItemSummaryBase" from the first import().ClassName part
              const complexImportMatch = expr.match(
                /import\([^)]+\)\.([A-Za-z_$][A-Za-z0-9_$]*)/
              );
              if (complexImportMatch) {
                return complexImportMatch[1];
              }
              // Handles: import("path").ClassName or just ClassName
              const match = expr.match(/\.([A-Za-z0-9_]+)$/);
              return match ? match[1] : expr;
            }

            // Build inherit calls; if item.inherits[].properties exists, use it to compose defaults
            const inherits = (item.inherits || []).map((entity: any) => {
              const baseName = extractBaseName(entity);

              // If we have aggregated properties for this inherited base, compose a defaults object
              // using the child's dotted path (item.name.prop) and include only those props
              // for which a name->faker mapping exists (inferGenerator returns non-null).
              let defaultsObj = "";
              const inhProps: ASTProperty[] | undefined = entity?.properties;
              if (Array.isArray(inhProps) && inhProps.length > 0) {
                const parts: string[] = [];
                for (const bp of inhProps) {
                  // Check if the child's dotted path has a name->faker mapping
                  const dotted = `${item.name}.${bp.name}`;
                  const mapping = inferMapping(dotted);
                  if (!mapping) continue; // skip properties without a mapping

                  // Only compose simple primitive/constant/string-union properties into defaults.
                  // This avoids pulling complex referenced mocks (MockMoney) into child files.
                  let val: string | undefined;
                  if (bp.type === "primitive") {
                    val = generatePrimitive(
                      bp as ASTPrimitiveProperty,
                      dotted,
                      true,
                      context
                    );
                  } else if (bp.type === "constant") {
                    val = generateConstantValue(
                      bp as ASTConstantProperty,
                      dotted,
                      true
                    );
                  } else if (bp.type === "union") {
                    const allStringLiterals = (
                      bp as ASTUnionProperty
                    ).value.every(
                      (v) =>
                        v.type === "constant" &&
                        typeof (v as any).value === "string"
                    );
                    if (allStringLiterals) {
                      val = generateUnionValue(
                        bp as ASTUnionProperty,
                        dotted,
                        true,
                        context
                      );
                    } else {
                      continue;
                    }
                  } else {
                    // skip references, objects, arrays, etc. to avoid cross-file Mock calls
                    continue;
                  }

                  // If the generated value calls other mocks, register them for imports
                  if (typeof val === "string") {
                    const mockRefRegex = /Mock([A-Za-z0-9_]+)\s*\(/g;
                    for (const m of val.matchAll(mockRefRegex)) {
                      const refName = m[1];
                      if (refName) {
                        referencedTypes.add(refName);
                        if (!referencedTypeLocations.has(refName)) {
                          const src = typeToFileMap?.get(refName);
                          if (src) referencedTypeLocations.set(refName, src);
                        }
                      }
                    }
                  }

                  // Previously we asserted each composed property to the child's
                  // type (e.g. `(expr) as Entity["prop"]`). That produced two
                  // problems: (1) object-literal excess property checks when the
                  // child's imported base type didn't structurally match the
                  // properties we composed, and (2) generic-type-name assertions
                  // like `GenericX` without type args. Instead, avoid per-property
                  // assertions and cast the entire defaults object to `any` when
                  // passing it into the base Mock() below. This keeps the
                  // generated code safe from cross-package structural checks.

                  parts.push(`"${bp.name}": ${val}`);
                }
                if (parts.length) defaultsObj = `{ ${parts.join(", ")} }`;
              }

              // Extract generic type parameters from the inheritance expression
              const entityExpr =
                typeof entity === "string" ? entity : entity?.expr;
              const genericParamsMatch = entityExpr?.match(/<([^>]+)>/);
              if (genericParamsMatch) {
                const genericParams = genericParamsMatch[1];

                // Handle import() expressions in generic parameters and extract type names
                const extractGenericTypeName = (param: string) => {
                  const importMatch = param.match(
                    /import\([^)]+\)\.([A-Za-z_$][A-Za-z0-9_$]*)/
                  );
                  if (importMatch) return importMatch[1];
                  return param.trim();
                };

                const genericTypeNames = genericParams
                  .split(",")
                  .map((param: string) => extractGenericTypeName(param));
                const paramNames = genericTypeNames.map((typeName: string) => {
                  referencedTypes.add(typeName);
                  return `() => Mock${typeName}()`;
                });

                // Build a typed Partial for the base using the extracted generic type names
                const baseTypeWithArgs = `${baseName}<${genericTypeNames.join(
                  ", "
                )}>`;
                const defaultsArg = defaultsObj
                  ? `, ${
                      includeTypes
                        ? `${defaultsObj} as Partial<${baseTypeWithArgs}>`
                        : `${defaultsObj}`
                    }`
                  : "";
                return `...Mock${baseName}(${paramNames.join(
                  ", "
                )}${defaultsArg})`;
              }

              // No generics - call without parameters, but include defaults if present
              if (defaultsObj) {
                if (includeTypes)
                  return `...Mock${baseName}(${defaultsObj} as Partial<${baseName}>)`;
                return `...Mock${baseName}(${defaultsObj})`;
              }
              return `...Mock${baseName}()`;
            });

            // Add import for each base mock if not already in referencedTypes
            if (item.inherits) {
              item.inherits.forEach((base) => {
                const baseName = extractBaseName(base);
                referencedTypes.add(baseName);
              });
            }

            // Create a function to generate mock values with generic awareness
            function generateMockValue(
              prop: ASTProperty,
              generics: any[]
            ): string {
              // Check if the property type is a generic parameter
              if (prop.type === "reference") {
                const propValue = (prop as any).value;
                const isGeneric = generics.some(
                  (g: any) => g.name === propValue
                );

                if (isGeneric) {
                  // For generic type parameters, call the mock function parameter
                  return `mock${propValue}()`;
                }
              }

              // Use existing generateValue function for non-generic properties
              return generateValue(
                prop,
                `${item.name}.${prop.name}`,
                includeTypes,
                context
              );
            }

            const properties = item.properties.map((prop) => {
              const mockValue = generateMockValue(prop, generics);
              if (prop.optional) {
                const wrapped = mockValue.trim().startsWith("{")
                  ? `(${mockValue})`
                  : mockValue;
                // return `    "${prop.name}": faker.helpers.maybe(() => ${wrapped}, { probability: 0.8 })`;
                return `    "${prop.name}": faker.helpers.maybe(() => ${wrapped})`;
              }
              return `    "${prop.name}": ${mockValue}`;
            });

            // Generate parameters for generic classes
            const mockGenericParams =
              generics.length > 0
                ? generics
                    .map((g: any) =>
                      includeTypes
                        ? `mock${g.name}: () => ${g.name} = () => ({} as ${g.name})`
                        : `mock${g.name}: () => ${g.name} = () => ({})`
                    )
                    .join(", ") + ", "
                : "";

            if (context.entityHasRecursion) {
              if (includeTypes) {
                output.push(
                  `${exportKeyword}function Mock${item.name}${genericParams}(${mockGenericParams}overrides${overridesType} = {}, __options: { depth?: number; maxDepth?: number } = {})${resultType} {`
                );
                output.push(`  const { depth = 0, maxDepth = 2 } = __options;`);
              } else {
                output.push(
                  `${exportKeyword}function Mock${item.name}${genericParams}(${mockGenericParams}overrides = {}, __options = {}) {`
                );
                output.push(`  const { depth = 0, maxDepth = 2 } = __options;`);
              }
            } else {
              if (includeTypes) {
                output.push(
                  `${exportKeyword}function Mock${item.name}${genericParams}(${mockGenericParams}overrides${overridesType} = {})${resultType} {`
                );
              } else {
                output.push(
                  `${exportKeyword}function Mock${item.name}${genericParams}(${mockGenericParams}overrides = {}) {`
                );
              }
            }
            // For classes, by default we previously created a prototype-based instance
            // (Object.create(Class.prototype)) which requires importing the class at runtime.
            // In JS mode we avoid runtime imports and instead return plain objects.
            const isClass = (item as any).instanceKind === "class";
            if (isClass && format !== "js") {
              // Keep prototype-based instance for TS/runtime mode
              output.push(`  const base = {`);
              if (inherits?.length) {
                output.push(`    ${inherits.join(",\n    ")},`);
              }
              output.push(`    ${properties.join(",\n    ")}`);
              output.push(`  };`);
              output.push(
                `  const instance = Object.create(${item.name}.prototype);`
              );
              output.push(`  Object.assign(instance, base, overrides);`);
              if (includeTypes) {
                output.push(`  return instance as ${item.name}${genericTypes}`);
              } else {
                output.push(`  return instance`);
              }
            } else {
              // Emit plain object for JS mode or non-class instances
              output.push(`  const result = {`);
              if (inherits?.length) {
                output.push(`    ${inherits.join(",\n    ")},`);
              }
              output.push(`    ${properties.join(",\n    ")}`);
              output.push(`  };`);
              output.push(`  return { ...result, ...overrides }`);
            }
            output.push(`}`);

            output.push("");
          }
          return output.join("\n");

        case "placeholder":
          {
            console.warn(
              `Encountered placeholder type for ${item.name}, returning minimal object.`
            );
            output.push(
              `${exportKeyword}function Mock${item.name}(overrides${anyType})${resultType} {`
            );
            output.push(`  return {`);
            output.push(
              `    /* TODO this is a placeholder because the original type or interface couldn't be parsed. */`
            );
            output.push(`    ...overrides`);
            output.push(`  };`);
            output.push(`}`);
            output.push("");
          }
          return output.join("\n");

        case "constant":
          {
            const value = generateConstantValue(
              item.value as ASTConstantProperty,
              item.name,
              includeTypes
            );

            output.push(
              `${exportKeyword}function Mock${item.name}()${resultType} {`
            );
            output.push(`  return ${value};`);
            output.push(`}`);

            output.push("");
          }
          return output.join("\n");

        case "primitive":
          {
            const value = generatePrimitive(
              item.value as ASTPrimitiveProperty,
              "",
              includeTypes,
              context
            );

            output.push(
              `${exportKeyword}function Mock${item.name}()${resultType} {`
            );
            output.push(`  return ${value}`);
            output.push(`}`);

            output.push("");
          }
          return output.join("\n");

        case "array":
          {
            const value = generateArrayValue(
              item.value,
              "",
              includeTypes,
              context
            );
            if ((item as any).hasRecursion) {
              output.push(
                `${exportKeyword}function Mock${item.name}(overrides${
                  resultType ? `?${resultType}` : ""
                }, __options: { depth?: number; maxDepth?: number } = {})${resultType} {`
              );
              output.push(`  const { depth = 0, maxDepth = 2 } = __options;`);
            } else {
              output.push(
                `${exportKeyword}function Mock${item.name}(overrides${
                  resultType ? `?${resultType}` : ""
                })${resultType} {`
              );
            }
            output.push(`  const result = ${value}`);
            output.push(`  return overrides ?? result;`);
            output.push(`}`);

            output.push("");
          }
          return output.join("\n");

        case "enum":
          {
            // item.values is an array of enum member names
            const values = (item.values || [])
              .map((v) => {
                if (format === "js") {
                  // Emit the member name or string literal so no runtime import is required
                  return `"${v}"`;
                }
                return `${item.name}.${v}`;
              })
              .join(", ");
            output.push(
              `${exportKeyword}function Mock${item.name}()${resultType} {`
            );
            if (format === "js") {
              output.push(`  return faker.helpers.arrayElement([${values}]);`);
            } else {
              output.push(`  return faker.helpers.arrayElement([${values}]);`);
            }
            output.push(`}`);
            output.push("");
          }
          return output.join("\n");
      }
      // }
      // If for some reason no case handled this item, return an empty string to satisfy map's return.
      return "";
    });
  // Now compute import statements (do this after body generation so referencedTypes is complete)
  // Ensure any MockX() usages accidentally introduced into the generated body are captured
  // so the import assembly will include their imports.
  try {
    const bodyText = body.join("\n");
    for (const m of bodyText.matchAll(/Mock([A-Za-z0-9_]+)\s*\(/g)) {
      const name = m[1];
      if (name) {
        referencedTypes.add(name);
        if (!referencedTypeLocations.has(name) && typeToFileMap?.get(name)) {
          referencedTypeLocations.set(name, typeToFileMap.get(name)!);
        }
      }
    }
  } catch {}
  let importStmts = "import { faker } from '@faker-js/faker';\n";
  if (currentMockFilePath && data.length > 0) {
    const mockDir = path.dirname(currentMockFilePath);
    const nameToEntityKind = new Map<string, string>();
    data.forEach((entity) =>
      nameToEntityKind.set(entity.name, (entity as any).type)
    );
    const nameToEntity = new Map<string, any>();
    data.forEach((entity) => nameToEntity.set(entity.name, entity as any));

    const typeImports = new Map();
    data.forEach((entity) => {
      const typeName = entity.name;
      const srcFile = entity?.location?.file;
      if (srcFile) typeImports.set(typeName, srcFile);
    });
    for (const typeName of Array.from(referencedTypes)) {
      const srcFile =
        referencedTypeLocations.get(typeName) ||
        (typeToFileMap ? typeToFileMap.get(typeName) : undefined);
      if (srcFile && !typeImports.has(typeName))
        typeImports.set(typeName, srcFile);
    }

    const INPUT_PROJECT_PATH = process.cwd();
    const fileToGroups = new Map<
      string,
      { typeOnly: Set<string>; value: Set<string> }
    >();
    for (const [typeName, srcFile] of Array.from(typeImports.entries())) {
      if (!fileToGroups.has(srcFile))
        fileToGroups.set(srcFile, { typeOnly: new Set(), value: new Set() });
      const groups = fileToGroups.get(srcFile)!;
      const kind = nameToEntityKind.get(typeName);
      if (kind === "enum") {
        // Enums are runtime values in TS mode, but when generating JS we prefer
        // to avoid runtime imports of the original enum. Treat enums as type-only
        // in JS output to prevent Node from attempting to import the source enum.
        if (format === "ts") groups.value.add(typeName);
        else groups.typeOnly.add(typeName);
      } else if (kind === "instance") {
        const ent = nameToEntity.get(typeName);
        // Classes previously required runtime imports to create prototype-based instances.
        // In JS mode we avoid runtime class imports and emit plain objects instead,
        // so treat classes as type-only unless we're emitting TS runtime.
        if (ent?.instanceKind === "class") {
          if (format === "ts") groups.value.add(typeName);
          else groups.typeOnly.add(typeName);
        } else {
          groups.typeOnly.add(typeName);
        }
      } else {
        groups.typeOnly.add(typeName);
      }
    }
    const importLines: string[] = [];
    for (const [srcFile, groups] of Array.from(fileToGroups.entries())) {
      const mockToRoot = path.relative(mockDir, INPUT_PROJECT_PATH);
      const rootToSrc = path.relative(INPUT_PROJECT_PATH, srcFile);
      let relTypePath = path.join(mockToRoot, rootToSrc).replace(/\\/g, "/");
      relTypePath = relTypePath.replace(/\.(d\.)?(ts|js)$/, "");
      if (!relTypePath.startsWith(".")) relTypePath = "./" + relTypePath;
      if (groups.typeOnly.size) {
        // In TS mode emit `import type`
        if (format === "ts") {
          const names = Array.from(groups.typeOnly).sort().join(", ");
          importLines.push(`import type { ${names} } from '${relTypePath}';`);
        }
      }
      if (groups.value.size) {
        const names = Array.from(groups.value).sort().join(", ");
        importLines.push(`import { ${names} } from '${relTypePath}';`);
      }
    }
    if (importLines.length)
      importStmts += (importStmts ? "\n" : "") + importLines.join("\n");
  }

  // Import referenced mocks (avoid self-import, duplicates, and same-file types)
  if (currentMockFilePath) {
    const mainType = data[0]?.name;
    const baseMocks = new Map();
    data.forEach((entity) => {
      if (entity.type === "instance" && Array.isArray(entity.inherits)) {
        entity.inherits.forEach((base) => {
          const baseExpr = typeof base === "string" ? base : (base as any).expr;
          const importMatches = [
            ...(baseExpr?.matchAll(
              /import\(["']([^"']+)["']\)\.([A-Za-z_$][A-Za-z0-9_$]*)/g
            ) || []),
          ];
          if (importMatches.length > 0) {
            importMatches.forEach((match) => {
              const absPath = match[1];
              const className = match[2];
              baseMocks.set(className, absPath);
            });
          } else {
            const simpleMatch = baseExpr?.match(
              /^import\(["'](.+)["']\)\.([A-Za-z0-9_]+)/
            );
            if (simpleMatch) {
              const absPath = simpleMatch[1];
              const className = simpleMatch[2];
              baseMocks.set(className, absPath);
            } else if (baseExpr) {
              const className = baseExpr.replace(/^.*\./, "");
              baseMocks.set(className, undefined);
            }
          }
        });
      }
    });
    const allRefs = new Set([
      ...Array.from(referencedTypes),
      ...Array.from(baseMocks.keys()).filter(
        (key) => !genericTypeParams.has(key)
      ),
    ]);
    allRefs.delete(mainType);
    let currentSourceFile = data[0]?.location?.file;
    if (!currentSourceFile && typeToFileMap && mainType)
      currentSourceFile = typeToFileMap.get(mainType as string);
    if (allRefs.size > 0) {
      const sameFileTypeNames = new Set(data.map((entity) => entity.name));
      const relPathToMocks = new Map();
      for (const ref of Array.from(allRefs)) {
        if (sameFileTypeNames.has(ref)) continue;
        let refSourceFile: string | undefined =
          referencedTypeLocations.get(ref) || undefined;
        if (!refSourceFile) refSourceFile = baseMocks.get(ref);
        if (!refSourceFile) refSourceFile = typeToFileMap?.get(ref);
        let relPathComputed: string | undefined;
        if (!refSourceFile) {
          // Try to find the mock file by walking up parent directories from current mock dir
          const candidateNameTs = `${ref}.mock.ts`;
          const candidateName = `${ref}.mock`;
          let found: string | undefined;
          let curDir = path.dirname(currentMockFilePath);
          // Walk up to repository root (limit to 10 levels to avoid pathological cases)
          for (let i = 0; i < 20; i++) {
            const tryPathTs = path.join(curDir, candidateNameTs);
            const tryPath = path.join(curDir, candidateName);
            if (fs.existsSync(tryPathTs)) {
              found = tryPathTs;
              break;
            }
            if (fs.existsSync(tryPath + ".ts")) {
              found = tryPath + ".ts";
              break;
            }
            if (fs.existsSync(tryPath)) {
              found = tryPath;
              break;
            }
            const parent = path.dirname(curDir);
            if (!parent || parent === curDir) break;
            curDir = parent;
          }
          if (found) {
            relPathComputed = path
              .relative(path.dirname(currentMockFilePath), found)
              .replace(/\\/g, "/");
            if (relPathComputed && !relPathComputed.startsWith("."))
              relPathComputed = "./" + relPathComputed;
            if (relPathComputed)
              relPathComputed = relPathComputed.replace(/\.ts$|\.js$/, "");
          } else {
            const mockFile = candidateName;
            relPathComputed = path
              .relative(
                path.dirname(currentMockFilePath),
                path.join(path.dirname(currentMockFilePath), mockFile)
              )
              .replace(/\\/g, "/");
            if (relPathComputed && !relPathComputed.startsWith("."))
              relPathComputed = "./" + relPathComputed;
            if (relPathComputed)
              relPathComputed = relPathComputed.replace(/\.ts$|\.js$/, "");
          }
          // For JS output, ensure we import the generated .js mock file with extension
          if (format === "js" && relPathComputed) {
            if (!relPathComputed.endsWith(".js"))
              relPathComputed = relPathComputed + ".js";
          }
        } else {
          const { mockPath: refMockPath } = getOutputPathsForSourceFile({
            sourceFile: {
              getFilePath: () => refSourceFile!,
            } as any,
            projectRootDir,
            outputRootDir,
            baseDir,
          });
          relPathComputed = path
            .relative(path.dirname(currentMockFilePath), refMockPath)
            .replace(/\\/g, "/");
          if (relPathComputed && !relPathComputed.startsWith("."))
            relPathComputed = "./" + relPathComputed;
          if (relPathComputed)
            relPathComputed = relPathComputed.replace(/\.ts$|\.js$/, "");
          if (format === "js" && relPathComputed) {
            if (!relPathComputed.endsWith(".js"))
              relPathComputed = relPathComputed + ".js";
          }
        }
        if (!relPathComputed) continue;
        if (!relPathToMocks.has(relPathComputed))
          relPathToMocks.set(relPathComputed, new Set());
        relPathToMocks.get(relPathComputed)!.add(`Mock${ref}`);
      }
      const groupedMockImportLines = Array.from(relPathToMocks.entries())
        .map(([relPath, names]) => {
          const list = Array.from(names).sort().join(", ");
          return `import { ${list} } from '${relPath}';`;
        })
        .join("\n");
      if (groupedMockImportLines)
        importStmts += (importStmts ? "\n" : "") + groupedMockImportLines;
    }
  }

  // Fallback: if any MockX() usages remain undiscovered by the above, add simple same-dir imports
  if (currentMockFilePath) {
    try {
      const mockDir = path.dirname(currentMockFilePath);
      const existingImports = new Set<string>(
        (importStmts || "")
          .split("\n")
          .filter(Boolean)
          .map((ln) => ln.trim())
      );
      const manualLines: string[] = [];
      const sameFileTypeNames = new Set(data.map((entity) => entity.name));
      for (const ref of Array.from(referencedTypes)) {
        if (!ref) continue;
        if (sameFileTypeNames.has(ref)) continue; // don't import mocks defined in this file
        // Try to locate the mock file by walking up directories if needed
        const resolvedPath = path.join(mockDir, `${ref}.mock`);
        let resolved = path.join(mockDir, `${ref}.mock.ts`);
        if (
          !fs.existsSync(resolved) &&
          !fs.existsSync(resolvedPath + ".ts") &&
          !fs.existsSync(resolvedPath)
        ) {
          // search upwards
          let cur = mockDir;
          for (let i = 0; i < 20; i++) {
            const tryTs = path.join(cur, `${ref}.mock.ts`);
            const tryNoExt = path.join(cur, `${ref}.mock`);
            if (fs.existsSync(tryTs)) {
              resolved = tryTs;
              break;
            }
            if (fs.existsSync(tryNoExt + ".ts")) {
              resolved = tryNoExt + ".ts";
              break;
            }
            if (fs.existsSync(tryNoExt)) {
              resolved = tryNoExt;
              break;
            }
            const parent = path.dirname(cur);
            if (!parent || parent === cur) break;
            cur = parent;
          }
        }
        const rel = path.relative(mockDir, resolved).replace(/\\/g, "/");
        // normalize and strip extensions for consistent handling
        let relNoExt = rel.replace(/\.ts$|\.js$/, "");
        if (!relNoExt.startsWith(".")) relNoExt = "./" + relNoExt;
        const finalRel = format === "js" ? relNoExt + ".js" : relNoExt;
        const imp = `import { Mock${ref} } from '${finalRel}'`;
        // Normalize to ./' prefix
        let normalized = imp.replace(/'\.\//, "'./");
        if (
          !Array.from(existingImports).some((e) => e.includes(`Mock${ref}`))
        ) {
          manualLines.push(normalized + ";");
        }
      }
      if (manualLines.length)
        importStmts += (importStmts ? "\n" : "") + manualLines.join("\n");
    } catch {}
  }

  let finalBody = body.join("\n");

  // Use helper to strip unused options across entire final body
  finalBody = stripUnusedOptionsFromText(finalBody);

  return (importStmts ? importStmts + "\n\n" : "") + finalBody;
}
