import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

import {
  formatTicketNumber,
  hasUnreadReply,
  isFinished,
  nextSequence,
  statusAfterMessage,
  ticketPrefix,
} from "../../features/helpdesk/rules.ts";

describe("helpdesk rules", () => {
  it("numbers tickets per month", () => {
    assert.equal(formatTicketNumber("2026-11-19", 7), "TKT-2611-0007");
    assert.equal(ticketPrefix("2026-11-19"), "TKT-2611-");
    assert.equal(nextSequence([], "TKT-2611-"), 1);
    assert.equal(nextSequence(["TKT-2611-0002", "TKT-2611-0010", "TKT-2610-0099", "junk"], "TKT-2611-"), 11);
  });

  it("moves status on messages", () => {
    assert.equal(statusAfterMessage("open", true, false), "in_progress");
    assert.equal(statusAfterMessage("in_progress", true, false), "in_progress");
    assert.equal(statusAfterMessage("resolved", false, false), "open");
    assert.equal(statusAfterMessage("closed", false, false), "open");
    assert.equal(statusAfterMessage("open", true, true), "open");
    assert.equal(statusAfterMessage("in_progress", false, false), "in_progress");
    assert.ok(isFinished("resolved") && isFinished("closed") && !isFinished("open"));
  });

  it("flags unseen HR replies only", () => {
    const at = new Date("2026-11-19T03:00:00Z");
    assert.equal(hasUnreadReply({ lastMessageFromAgent: false, lastMessageAt: at, employeeLastReadAt: null }), false);
    assert.equal(hasUnreadReply({ lastMessageFromAgent: true, lastMessageAt: at, employeeLastReadAt: null }), true);
    assert.equal(
      hasUnreadReply({ lastMessageFromAgent: true, lastMessageAt: at, employeeLastReadAt: new Date("2026-11-19T02:00:00Z") }),
      true
    );
    assert.equal(
      hasUnreadReply({ lastMessageFromAgent: true, lastMessageAt: at, employeeLastReadAt: new Date("2026-11-19T04:00:00Z") }),
      false
    );
  });
});

describe("migration 0026 (helpdesk) is additive and RESTRICT-only", () => {
  const root = join(import.meta.dirname, "..", "..");
  const sql = readFileSync(join(root, "db/migrations/0026_helpdesk.sql"), "utf8");
  const journal = JSON.parse(readFileSync(join(root, "db/migrations/meta/_journal.json"), "utf8")) as {
    entries: { idx: number; when: number; tag: string }[];
  };
  const NEW = ["helpdesk_categories", "helpdesk_tickets", "helpdesk_messages"];

  it("creates only the three helpdesk tables", () => {
    assert.deepEqual([...sql.matchAll(/CREATE TABLE "(\w+)"/g)].map((m) => m[1]).sort(), [...NEW].sort());
    for (const m of sql.matchAll(/ALTER TABLE "(\w+)"/g)) assert.ok(NEW.includes(m[1]), m[1]);
    for (const m of sql.matchAll(/INDEX "\w+" ON "(\w+)"/g)) assert.ok(NEW.includes(m[1]), m[1]);
    assert.doesNotMatch(sql, /DROP /);
    assert.deepEqual(
      [...sql.matchAll(/REFERENCES "public"\."employees"\("id"\) ON DELETE (\w+)/g)].map((m) => m[1]),
      ["restrict"]
    );
  });

  it("is journaled with a fresh, increasing when", () => {
    const at = journal.entries.findIndex((e) => e.tag === "0026_helpdesk");
    assert.ok(at > 0);
    assert.equal(journal.entries[at].idx, journal.entries[at - 1].idx + 1);
    assert.ok(journal.entries[at].when > journal.entries[at - 1].when);
  });

  it("deletion plans register tickets as optional", () => {
    for (const p of ["features/employees/queries.ts", "features/employees/test-data-purge.queries.ts"]) {
      assert.match(readFileSync(join(root, p), "utf8"), /optionalTable: "helpdesk_tickets"/);
    }
  });
});

describe("helpdesk guards", () => {
  const root = join(import.meta.dirname, "..", "..");
  const read = (p: string) => readFileSync(join(root, p), "utf8");

  it("agents need employees.view + employees.update everywhere", () => {
    const actions = read("features/helpdesk/actions.ts");
    assert.match(actions, /^"use server";/);
    assert.match(actions, /granted\.has\(PERMISSIONS\.EMPLOYEES_VIEW\) && granted\.has\(PERMISSIONS\.EMPLOYEES_UPDATE\)/);
    for (const name of ["updateTicketAction", "saveCategoryAction", "seedDefaultCategoriesAction", "setCategoryActiveAction"]) {
      const body = actions.slice(actions.indexOf(`export async function ${name}`)).split("\nexport ")[0];
      assert.match(body, /if \(!ctx\.isAgent\) return FORBIDDEN;/, name);
    }
    const management = read("app/(dashboard)/helpdesk/management/page.tsx");
    assert.match(management, /requirePermission\(user\.id, PERMISSIONS\.EMPLOYEES_VIEW\)/);
    assert.match(management, /requirePermission\(user\.id, PERMISSIONS\.EMPLOYEES_UPDATE\)/);
    const nav = read("components/layout/navigation.ts");
    const at = nav.indexOf('href: "/helpdesk/management"');
    const entry = nav.slice(at, nav.indexOf("}", at));
    assert.match(entry, /permission: PERMISSIONS\.EMPLOYEES_UPDATE/);
    assert.match(entry, /anyPermission: \[PERMISSIONS\.EMPLOYEES_VIEW\]/);
  });

  it("internal notes are agent-only and hidden from the owner", () => {
    const actions = read("features/helpdesk/actions.ts");
    assert.match(actions, /if \(internal && !asAgent\) return FORBIDDEN;/);
    const detail = read("app/(dashboard)/helpdesk/[ticketId]/page.tsx");
    assert.match(detail, /listMessages\(organizationId, ticket\.id, isAgent\)/);
    assert.match(detail, /if \(!isOwner && !isAgent\) forbidden\(\);/);
    assert.match(read("features/helpdesk/queries.ts"), /if \(!includeInternal\) where\.push\(eq\(helpdeskMessages\.internal, false\)\)/);
  });

  it("the notification feed only reads new modules once they are ready", () => {
    const feed = read("features/notifications/queries.ts");
    assert.match(feed, /timeReady\s*\? listOvertime/);
    assert.match(feed, /profileReady \? listProfileChanges/);
    assert.match(feed, /helpdeskReady \? listTickets/);
  });
});
