import { describe, expect, test } from "vitest";
import {
  getCaseName,
  listCaseDirs,
  normalizeCase,
  readExpectedAst,
} from "./support/cases";

describe("normalized cases", () => {
  const cases = listCaseDirs().map((caseDir) => [getCaseName(caseDir), caseDir] as const);

  test.each(cases)("%s", (_caseName, caseDir) => {
    expect(normalizeCase(caseDir)).toEqual(readExpectedAst(caseDir));
  });
});
