import { execFile } from "node:child_process";
import { cp, mkdir, mkdtemp, rm, symlink } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";
import {
  createProject,
  generateMocks,
  loadConfig,
  normalizeProject,
  renderMocks,
} from "../src/index";

const execFileAsync = promisify(execFile);
const require = createRequire(import.meta.url);

export const REPO_ROOT = resolve(new URL("..", import.meta.url).pathname);
const FIXTURES_ROOT = resolve(new URL("./fixtures", import.meta.url).pathname);
const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";

let buildPromise: Promise<void> | undefined;

export interface FixtureProject {
  rootDir: string;
  cleanup(): Promise<void>;
}

export async function createFixtureProject(
  fixtureName = "project",
): Promise<FixtureProject> {
  const rootDir = await mkdtemp(join(tmpdir(), "typemockr-"));
  await cp(join(FIXTURES_ROOT, fixtureName), rootDir, { recursive: true });
  await mkdir(join(rootDir, "node_modules"), { recursive: true });
  await mkdir(join(rootDir, "node_modules", "@faker-js"), { recursive: true });
  await symlink(REPO_ROOT, join(rootDir, "node_modules", "typemockr"), "dir");
  await symlink(
    join(REPO_ROOT, "node_modules", "@faker-js", "faker"),
    join(rootDir, "node_modules", "@faker-js", "faker"),
    "dir",
  );

  return {
    rootDir,
    cleanup: () => rm(rootDir, { recursive: true, force: true }),
  };
}

export async function loadFixtureConfig(rootDir: string) {
  return loadConfig(rootDir);
}

export async function normalizeFixture(rootDir: string) {
  const config = await loadFixtureConfig(rootDir);
  return normalizeProject(createProject(config));
}

export async function generateFixture(rootDir: string) {
  const config = await loadFixtureConfig(rootDir);
  return generateMocks(config);
}

export async function renderFixture(rootDir: string) {
  const config = await loadFixtureConfig(rootDir);
  return renderMocks(config);
}

export async function ensurePackageBuilt() {
  buildPromise ??= execFileAsync(npmCommand, ["run", "build"], {
    cwd: REPO_ROOT,
  }).then(() => undefined);

  await buildPromise;
}

export async function compileFixture(rootDir: string) {
  await ensurePackageBuilt();
  const tscBin = require.resolve("typescript/bin/tsc");
  await execFileAsync(process.execPath, [tscBin, "--project", "tsconfig.json"], {
    cwd: rootDir,
  });
}

export async function importBuiltModule<T = unknown>(
  rootDir: string,
  relativePath: string,
): Promise<T> {
  const moduleUrl = pathToFileURL(join(rootDir, ".build", relativePath)).href;
  return (await import(moduleUrl)) as T;
}
