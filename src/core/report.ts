import { faker } from "@faker-js/faker";
import type { DriftReport, MappingEntry, ScalarKind, ValueExpressionContext } from "./types";

/**
 * Scalars a mapping can target. Structured nodes and literal-like scalars (`null`, `undefined`,
 * `symbol`) never reach a mapping, so they are not worth reporting on either.
 */
const REPORTABLE_SCALARS = new Set<ScalarKind>([
  "string",
  "number",
  "bigint",
  "boolean",
  "date",
]);

export interface DriftRecorder {
  registerMappings(entries: ReadonlyArray<MappingEntry>): void;
  mappingMatched(index: number): void;
  scalarResolved(context: ValueExpressionContext, value: string, viaUnknownCast: boolean): void;
  scalarFellThrough(context: ValueExpressionContext): void;
  build(): DriftReport;
}

export function createDriftRecorder(): DriftRecorder {
  let entries: ReadonlyArray<MappingEntry> = [];
  const matchedIndexes = new Set<number>();
  const mismatchByKey = new Map<string, DriftReport["mismatches"][number]>();
  const fellThroughByScalar = new Map<ScalarKind, Set<string>>();

  return {
    registerMappings(next) {
      entries = next;
    },

    mappingMatched(index) {
      matchedIndexes.add(index);
    },

    scalarResolved(context, value, viaUnknownCast) {
      const scalar = context.scalar;
      if (!scalar || viaUnknownCast || !REPORTABLE_SCALARS.has(scalar)) {
        return;
      }

      const inferred = inferExpressionScalar(value);
      if (inferred === undefined || inferred === scalar) {
        return;
      }

      // `bigint` accepts a number expression; everything else must agree exactly.
      if (scalar === "bigint" && inferred === "number") {
        return;
      }

      const key = `${context.sourceFile}::${context.path}`;
      if (!mismatchByKey.has(key)) {
        mismatchByKey.set(key, {
          path: context.path,
          entityName: context.entityName,
          sourceFile: context.sourceFile,
          declared: scalar,
          generated: inferred,
          value,
        });
      }
    },

    scalarFellThrough(context) {
      const scalar = context.scalar;
      if (!scalar || !REPORTABLE_SCALARS.has(scalar)) {
        return;
      }

      const paths = fellThroughByScalar.get(scalar) ?? new Set<string>();
      paths.add(context.path);
      fellThroughByScalar.set(scalar, paths);
    },

    build() {
      return {
        mismatches: [...mismatchByKey.values()].sort((left, right) =>
          left.path.localeCompare(right.path),
        ),
        defaults: [...fellThroughByScalar.entries()]
          .map(([scalar, paths]) => ({ scalar, paths: [...paths].sort() }))
          .sort((left, right) => left.scalar.localeCompare(right.scalar)),
        deadMappings: entries
          .map((entry, index) => ({ entry, index }))
          .filter(({ index }) => !matchedIndexes.has(index))
          .map(({ entry, index }) => ({ index, entry })),
      };
    },
  };
}

/**
 * The kind of value a mapping expression actually produces, found by evaluating it against faker.
 *
 * Reading the expression instead would be guesswork — `faker.location.latitude()` returns a number
 * and `faker.date.month()` a string, so neither the namespace nor the method name tells you the
 * type. A mismatch is a hard error, so it may only be raised on something we measured. Anything
 * that throws (a reference to a generated mock, an unbalanced snippet) yields no opinion.
 *
 * The expression is code the project already asked to have written into its mocks, and faker calls
 * are pure, so running one here costs a sample and no more.
 */
export function inferExpressionScalar(expression: string): ScalarKind | undefined {
  const cached = inferenceCache.get(expression);
  if (cached !== undefined) {
    return cached.scalar;
  }

  const scalar = measureExpressionScalar(expression);
  inferenceCache.set(expression, { scalar });
  return scalar;
}

const inferenceCache = new Map<string, { scalar: ScalarKind | undefined }>();

/** Enough samples to notice an expression whose type is not stable, e.g. a mixed `arrayElement`. */
const SAMPLES = 3;

function measureExpressionScalar(expression: string): ScalarKind | undefined {
  let evaluate: (scope: typeof faker) => unknown;

  try {
    // eslint-disable-next-line no-new-func
    evaluate = new Function("faker", `"use strict"; return (${expression});`) as typeof evaluate;
  } catch {
    return undefined;
  }

  let agreed: ScalarKind | undefined;

  for (let sample = 0; sample < SAMPLES; sample += 1) {
    let scalar: ScalarKind | undefined;

    try {
      scalar = toScalarKind(evaluate(faker));
    } catch {
      return undefined;
    }

    if (scalar === undefined || (sample > 0 && scalar !== agreed)) {
      return undefined;
    }

    agreed = scalar;
  }

  return agreed;
}

function toScalarKind(value: unknown): ScalarKind | undefined {
  if (value instanceof Date) {
    return "date";
  }

  switch (typeof value) {
    case "string":
      return "string";
    case "number":
      return "number";
    case "boolean":
      return "boolean";
    case "bigint":
      return "bigint";
    default:
      return undefined;
  }
}

const MAX_LISTED_PATHS = 10;

export function formatMappingMismatches(report: DriftReport): string {
  return [
    `${report.mismatches.length} mapping${report.mismatches.length === 1 ? "" : "s"} generate a value of the wrong type:`,
    ...report.mismatches.map(
      (mismatch) =>
        `  ${mismatch.path} is \`${mismatch.declared}\` but \`${mismatch.value}\` generates \`${mismatch.generated}\` (${mismatch.sourceFile})`,
    ),
    'Fix the mapping, or add `"cast": "unknown"` to it when the deviation is deliberate.',
  ].join("\n");
}

/** The advisory half of the report: everything that is a question rather than an error. */
export function formatDriftReport(report: DriftReport): string {
  const lines: string[] = [];

  for (const group of report.defaults) {
    lines.push(
      `  ${group.paths.length} \`${group.scalar}\` field${group.paths.length === 1 ? "" : "s"} fell through to the type default:`,
    );
    for (const path of group.paths.slice(0, MAX_LISTED_PATHS)) {
      lines.push(`    ${path}`);
    }
    if (group.paths.length > MAX_LISTED_PATHS) {
      lines.push(`    … and ${group.paths.length - MAX_LISTED_PATHS} more`);
    }
  }

  if (report.deadMappings.length > 0) {
    lines.push(`  ${report.deadMappings.length} mapping entries matched nothing:`);
    for (const dead of report.deadMappings) {
      lines.push(`    mappings[${dead.index}] ${describeMappingEntry(dead.entry)}`);
    }
  }

  return lines.length === 0 ? "" : ["typemockr drift report:", ...lines].join("\n");
}

function describeMappingEntry(entry: MappingEntry): string {
  const parts = [
    entry.source === undefined ? undefined : `source ${JSON.stringify(entry.source)}`,
    entry.path === undefined ? undefined : `path ${JSON.stringify(entry.path)}`,
    entry.type === undefined
      ? undefined
      : `type ${JSON.stringify(Array.isArray(entry.type) ? entry.type.join("|") : entry.type)}`,
  ].filter((part): part is string => part !== undefined);

  return `${parts.join(" ")} -> ${entry.value}`;
}
