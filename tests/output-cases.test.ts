import { execFile } from "node:child_process";
import { cp, mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { promisify } from "node:util";
import { describe, expect, test } from "vitest";
import { REPO_ROOT } from "./helpers";
import {
  getCaseName,
  listCaseDirs,
  readExpectedOutputs,
  renderCase,
} from "./support/cases";

const execFileAsync = promisify(execFile);
const require = createRequire(import.meta.url);

describe("generated output cases", () => {
  const cases = listCaseDirs().map((caseDir) => [getCaseName(caseDir), caseDir] as const);

  test.each(cases)("%s (ts)", (_caseName, caseDir) => {
    const actual = renderCase(caseDir, "ts");
    expect(actual).toEqual(readExpectedOutputs(caseDir, "ts", Object.keys(actual)));
  });

  test.each(cases)("%s (js)", (_caseName, caseDir) => {
    const actual = renderCase(caseDir, "js");
    expect(actual).toEqual(readExpectedOutputs(caseDir, "js", Object.keys(actual)));
  });

  test("generated TS for every case passes strict tsc", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "typemockr-cases-"));

    try {
      await mkdir(join(rootDir, "node_modules", "@faker-js"), { recursive: true });
      await symlink(
        join(REPO_ROOT, "node_modules", "@faker-js", "faker"),
        join(rootDir, "node_modules", "@faker-js", "faker"),
        "dir",
      );

      for (const [caseName, caseDir] of cases) {
        await cp(join(caseDir, "src"), join(rootDir, caseName, "src"), { recursive: true });
        for (const [relativePath, code] of Object.entries(renderCase(caseDir, "ts"))) {
          const outputFile = join(rootDir, caseName, "$mock", relativePath);
          await mkdir(dirname(outputFile), { recursive: true });
          await writeFile(outputFile, `${code}\n`);
        }
      }

      await writeFile(
        join(rootDir, "tsconfig.json"),
        JSON.stringify({
          compilerOptions: {
            strict: true,
            noEmit: true,
            target: "ES2022",
            module: "ESNext",
            moduleResolution: "Bundler",
            skipLibCheck: true,
          },
          include: ["*/src/**/*.ts", "*/$mock/**/*.ts"],
        }),
      );

      const tscBin = require.resolve("typescript/bin/tsc");
      await expect(
        execFileAsync(process.execPath, [tscBin, "--project", "tsconfig.json"], {
          cwd: rootDir,
        }),
      ).resolves.toBeDefined();
    } finally {
      await rm(rootDir, { recursive: true, force: true });
    }
  });
});
