import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

import { sql } from "drizzle-orm";
import { PgDialect, pgTable, uuid } from "drizzle-orm/pg-core";

import { qualified } from "../../lib/db/qualified.ts";

const root = join(import.meta.dirname, "..", "..");

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === "node_modules" ? [] : files(path);
    return /\.tsx?$/.test(name) ? [path] : [];
  });
}

describe("correlated subqueries", () => {
  it("qualified() renders the outer column with its table", () => {
    const outer = pgTable("outer_t", { id: uuid("id") });
    const inner = pgTable("inner_t", { id: uuid("id"), outerId: uuid("outer_id") });
    const query = new PgDialect().sqlToQuery(
      sql`(SELECT count(*) FROM ${inner} WHERE ${inner.outerId} = ${qualified(outer.id)})`
    ).sql;
    assert.match(query, /= "outer_t"\."id"\)/);
  });

  it("no subquery compares against an unqualified outer id", () => {
    // `(SELECT … WHERE x = ${table.id})` binds "id" to the inner table in a
    // single-table select (Drizzle omits the qualifier) — counts become 0.
    const offenders: string[] = [];
    for (const file of [...files(join(root, "features")), ...files(join(root, "lib")), ...files(join(root, "app"))]) {
      const source = readFileSync(file, "utf8");
      for (const m of source.matchAll(/(\(\s*SELECT|EXISTS\s*\(\s*SELECT)[^`]*?=\s*\$\{[a-zA-Z]+\.id\}/g)) {
        offenders.push(`${file.slice(root.length + 1)}: ${m[0].slice(0, 90)}`);
      }
    }
    assert.deepEqual(offenders, []);
  });
});
