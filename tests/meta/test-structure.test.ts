/**
 * Guard against mangled test files (e.g. a bad merge that moves the tail of
 * an `it` below the next `describe`). Such files still parse, but every later
 * suite runs inside a test and is silently cancelled. This walks every test
 * file and fails when a `describe` is nested inside an `it` / `test`.
 */
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";

import ts from "typescript";

const TESTS_ROOT = path.join(process.cwd(), "tests");

function listTestFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return listTestFiles(full);
    return /\.test\.(ts|mts|js|mjs)$/.test(name) ? [full] : [];
  });
}

function nestedSuites(file: string): string[] {
  const source = ts.createSourceFile(
    file,
    readFileSync(file, "utf8"),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS
  );
  const problems: string[] = [];
  const visit = (node: ts.Node, insideTest: boolean) => {
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      ["describe", "it", "test"].includes(node.expression.text)
    ) {
      const kind = node.expression.text;
      if (kind === "describe" && insideTest) {
        const line = source.getLineAndCharacterOfPosition(node.getStart()).line + 1;
        problems.push(`${path.relative(process.cwd(), file)}:${line}`);
      }
      node.arguments.forEach((arg) => visit(arg, insideTest || kind !== "describe"));
      return;
    }
    ts.forEachChild(node, (child) => visit(child, insideTest));
  };
  visit(source, false);
  return problems;
}

describe("test files are well-formed", () => {
  it("never nest a describe() inside an it()/test()", () => {
    const problems = listTestFiles(TESTS_ROOT).flatMap(nestedSuites);
    assert.deepEqual(problems, [], `describe() nested in a test at: ${problems.join(", ")}`);
  });
});
