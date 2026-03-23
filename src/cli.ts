import { loadConfig } from "./core/load";
import { generateMocks } from "./core/generate";

export async function main() {
  const configPath = process.argv[2];
  const config = await loadConfig(process.cwd(), configPath);
  const result = await generateMocks(config);
  process.stdout.write(
    `Generated ${result.files.length} file${result.files.length === 1 ? "" : "s"}.\n`,
  );
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
