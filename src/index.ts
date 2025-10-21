import { join } from "node:path";
import { mkdirSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { generateMocks } from "./typemockr";
import { loadConfig } from "./config";

export async function main(): Promise<void> {
  try {
    const cfg = await loadConfig(process.cwd());

    const projectRootDir = cfg.projectRootDir;
    const include = cfg.include ?? [];
    const mappings = cfg.mappings;

    const outputRootDir = cfg.outDir
      ? join(projectRootDir, cfg.outDir)
      : join(projectRootDir, "src", "$mock");
    try {
      await mkdir(outputRootDir, { recursive: true });
    } catch (err) {
      // fallback: mkdirSync as a last resort (shouldn't be necessary on modern Node)
      try {
        mkdirSync(outputRootDir, { recursive: true });
      } catch (e) {
        console.error("Failed to create output directory:", e);
      }
    }

    generateMocks({
      projectRootDir,
      include,
      outputRootDir,
      baseDir: cfg.baseDir,
      mappings,
      mappingProvider: cfg.mappingProvider,
      format: cfg.format,
    });
  } catch (err) {
    console.error("Unexpected error in main():", err);
  }
}

// invoke main once
main();
