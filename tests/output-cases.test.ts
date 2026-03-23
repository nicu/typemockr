import { describe, expect, test } from "vitest";
import {
  getCaseName,
  listCaseDirs,
  readExpectedOutputs,
  renderCase,
} from "./support/cases";

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
});
