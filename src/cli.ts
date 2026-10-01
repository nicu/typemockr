import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { loadConfig } from "./core/load";
import { generateMocks } from "./core/generate";
import { formatDriftReport } from "./core/report";
import { formatDrift, formatLeaves, groupDrift, walk } from "./core/walk";

class UsageError extends Error {}

const WALK_USAGE =
  "Usage: typemockr walk|drift --model <path[#Type]> <input.json> [--config file] [--format json|text] [--all] [--type <jsonPath>=<path[#Type]>]...";

export async function main() {
  const command = process.argv[2];
  if (command === "walk" || command === "drift") {
    await runWalk(command, process.argv.slice(3));
    return;
  }

  const configPath = process.argv[2];
  const config = await loadConfig(process.cwd(), configPath);
  const result = await generateMocks(config);
  process.stdout.write(
    `Generated ${result.files.length} file${result.files.length === 1 ? "" : "s"}.\n`,
  );

  const drift = formatDriftReport(result.report);
  if (drift.length > 0) {
    process.stdout.write(`${drift}\n`);
  }
}

async function runWalk(command: "walk" | "drift", args: string[]) {
  const options: Record<string, string> = {};
  const positional: string[] = [];
  const types: Record<string, string> = {};
  let all = false;

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i]!;
    if (arg === "--all") {
      all = true;
    } else if (arg.startsWith("--")) {
      // Only the first `=` separates the flag from its value: `--type=content=Store/X`.
      const equals = arg.indexOf("=");
      const name = equals === -1 ? arg.slice(2) : arg.slice(2, equals);
      const value = equals === -1 ? args[++i] : arg.slice(equals + 1);
      if (value === undefined) {
        throw new UsageError(`Missing value for --${name}.\n${WALK_USAGE}`);
      }
      if (name === "type") {
        const separator = value.lastIndexOf("=");
        if (separator <= 0 || separator === value.length - 1) {
          throw new UsageError(`--type takes <jsonPath>=<path[#Type]>.\n${WALK_USAGE}`);
        }
        types[value.slice(0, separator)] = value.slice(separator + 1);
      } else {
        options[name] = value;
      }
    } else {
      positional.push(arg);
    }
  }

  const unknown = Object.keys(options).filter((name) => !["model", "config", "format"].includes(name));
  if (!options.model || positional.length !== 1 || unknown.length > 0) {
    throw new UsageError(WALK_USAGE);
  }
  const format = options.format ?? "text";
  if (format !== "text" && format !== "json") {
    throw new UsageError(`--format must be "json" or "text".\n${WALK_USAGE}`);
  }

  const input = JSON.parse(readFileSync(resolve(positional[0]!), "utf8")) as unknown;
  const result = await walk({ config: options.config, model: options.model, input, types });

  if (command === "walk") {
    const text = format === "json" ? JSON.stringify(result, null, 2) : formatLeaves(result.leaves);
    process.stdout.write(`${text}\n`);
    return;
  }

  if (format === "json") {
    const groups = groupDrift(result.drift, result.seen);
    process.stdout.write(`${JSON.stringify({ drift: result.drift, groups, inferred: result.inferred }, null, 2)}\n`);
  } else if (result.drift.length > 0) {
    process.stdout.write(`${formatDrift(result.drift, { all, seen: result.seen })}\n`);
  }
  if (result.drift.length > 0) {
    process.exitCode = 1;
  }
}

main().catch((error: unknown) => {
  const message =
    error instanceof UsageError
      ? error.message
      : error instanceof Error
        ? error.stack ?? error.message
        : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
