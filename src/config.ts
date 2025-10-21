import { join } from "node:path";
import { access, readFile } from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import type { RawConfig, Config } from "./types";

export async function loadConfig(
  projectRootDir = process.cwd()
): Promise<Config> {
  const configPath = join(projectRootDir, "typemockr.json");
  let raw: RawConfig | undefined = undefined;
  try {
    await access(configPath, fsConstants.F_OK);
    const txt = await readFile(configPath, "utf8");
    raw = JSON.parse(txt) as RawConfig;
  } catch (err) {
    // missing or invalid config falls back to defaults
    raw = undefined;
  }

  const include = raw?.include ?? [];
  const baseDir = raw?.baseDir ?? [];
  const mappings = raw?.mappings;
  const mappingProvider = raw?.mappingProvider;
  const outDir = raw?.outDir;
  const format = raw?.format;

  const cfg: Config = {
    projectRootDir,
    include,
    baseDir,
    outDir,
    format,
    mappings,
    mappingProvider,
  };
  return cfg;
}
