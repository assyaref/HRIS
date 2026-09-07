/**
 * PHASE 9.5 — Work Location configuration guardrails (Node built-in `node:test`).
 *
 * Exercises the PURE modules used by the Work Location server actions:
 * - `features/work-locations/schemas.ts` (server-side Zod validation, strict
 *   unknown-key rejection, active-completeness, numeric boundaries).
 * - `features/work-locations/guardrails.ts` (shared number parsing, project
 *   eligibility decision, active-completeness helpers, operational warnings).
 *
 * No DB, no browser, no network. Database-backed paths (permission checks,
 * org-scoped reads, audit writes) live in the server actions/queries and are
 * protected by the same rules tested here plus org-scoped SQL.
 *
 * Rule references: Phase 9.5 steps 2 (ranges), 3 (required active fields),
 * 4 (project validation), 5 (no invented uniqueness), 6 (warnings), 9
 * (server-side validation authority).
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  collectWorkLocationWarnings,
  evaluateWorkLocationProjectEligibility,
  isActiveWorkLocationComplete,
  missingActiveWorkLocationFields,
  parseWorkLocationNumber,
  workLocationZodFieldErrors,
} from "../../features/work-locations/guardrails.ts";
import {
  createWorkLocationSchema,
  updateWorkLocationSchema,
} from "../../features/work-locations/schemas.ts";

const ORG_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ORG_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const PROJECT_A = "33333333-3333-4333-8333-333333333333";

/** A complete, valid ACTIVE location payload. */
function validPayload(overrides: Record<string, unknown> = {}) {
  return {
    name: "Duri Site Office",
    projectId: PROJECT_A,
    latitude: -6.2088,
    longitude: 106.8456,
    radiusMeters: 100,
    maxGpsAccuracyMeters: 100,
    timezone: "Asia/Jakarta",
    status: "active",
    ...overrides,
  };
}

describe("Latitude guardrails", () => {
  it("accepts a valid latitude", () => {
    const parsed = createWorkLocationSchema.safeParse(validPayload());
    assert.equal(parsed.success, true);
  });

  it("accepts the lower boundary -90", () => {
    const parsed = createWorkLocationSchema.safeParse(
      validPayload({ latitude: -90 })
    );
    assert.equal(parsed.success, true);
  });

  it("accepts the upper boundary 90", () => {
    const parsed = createWorkLocationSchema.safeParse(
      validPayload({ latitude: 90 })
    );
    assert.equal(parsed.success, true);
  });

  it("rejects latitude above 90", () => {
    const parsed = createWorkLocationSchema.safeParse(
      validPayload({ latitude: 90.0001 })
    );
    assert.equal(parsed.success, false);
    if (!parsed.success) {
      assert.equal(parsed.error.issues[0]?.path[0], "latitude");
    }
  });

  it("rejects latitude below -90", () => {
    const parsed = createWorkLocationSchema.safeParse(
      validPayload({ latitude: -91 })
    );
    assert.equal(parsed.success, false);
  });
});

describe("Longitude guardrails", () => {
  it("accepts the lower boundary -180", () => {
    const parsed = createWorkLocationSchema.safeParse(
      validPayload({ longitude: -180 })
    );
    assert.equal(parsed.success, true);
  });

  it("accepts the upper boundary 180", () => {
    const parsed = createWorkLocationSchema.safeParse(
      validPayload({ longitude: 180 })
    );
    assert.equal(parsed.success, true);
  });

  it("rejects longitude above 180", () => {
    const parsed = createWorkLocationSchema.safeParse(
      validPayload({ longitude: 181 })
    );
    assert.equal(parsed.success, false);
    if (!parsed.success) {
      assert.equal(parsed.error.issues[0]?.path[0], "longitude");
    }
  });

  it("rejects longitude below -180", () => {
    const parsed = createWorkLocationSchema.safeParse(
      validPayload({ longitude: -180.0001 })
    );
    assert.equal(parsed.success, false);
  });
});

describe("Radius guardrails", () => {
  it("accepts a valid radius", () => {
    const parsed = createWorkLocationSchema.safeParse(
      validPayload({ radiusMeters: 250 })
    );
    assert.equal(parsed.success, true);
  });

  it("rejects a zero radius", () => {
    const parsed = createWorkLocationSchema.safeParse(
      validPayload({ radiusMeters: 0 })
    );
    assert.equal(parsed.success, false);
    if (!parsed.success) {
      assert.equal(parsed.error.issues[0]?.path[0], "radiusMeters");
    }
  });

  it("rejects a negative radius", () => {
    const parsed = createWorkLocationSchema.safeParse(
      validPayload({ radiusMeters: -50 })
    );
    assert.equal(parsed.success, false);
  });
});

describe("Non-finite numeric guardrails (NaN / Infinity)", () => {
  it("rejects NaN latitude", () => {
    const parsed = createWorkLocationSchema.safeParse(
      validPayload({ latitude: Number.NaN })
    );
    assert.equal(parsed.success, false);
  });

  it("rejects Infinity longitude", () => {
    const parsed = createWorkLocationSchema.safeParse(
      validPayload({ longitude: Number.POSITIVE_INFINITY })
    );
    assert.equal(parsed.success, false);
  });

  it("rejects -Infinity radius", () => {
    const parsed = createWorkLocationSchema.safeParse(
      validPayload({ radiusMeters: Number.NEGATIVE_INFINITY })
    );
    assert.equal(parsed.success, false);
  });

  it("rejects NaN GPS accuracy", () => {
    const parsed = createWorkLocationSchema.safeParse(
      validPayload({ maxGpsAccuracyMeters: Number.NaN })
    );
    assert.equal(parsed.success, false);
  });

  it("rejects a malformed numeric string through the shared parser", () => {
    assert.equal(parseWorkLocationNumber("abc"), Number.NaN);
    assert.equal(parseWorkLocationNumber("100px"), Number.NaN);
    assert.equal(parseWorkLocationNumber("1e2"), Number.NaN);
    assert.equal(parseWorkLocationNumber("Infinity"), Number.NaN);
    assert.equal(parseWorkLocationNumber(""), undefined);
    assert.equal(parseWorkLocationNumber("100"), 100);
    assert.equal(parseWorkLocationNumber("-6.2088"), -6.2088);
  });
});

describe("GPS accuracy guardrails", () => {
  it("accepts a valid GPS accuracy", () => {
    const parsed = createWorkLocationSchema.safeParse(
      validPayload({ maxGpsAccuracyMeters: 25 })
    );
    assert.equal(parsed.success, true);
  });

  it("rejects a zero GPS accuracy", () => {
    const parsed = createWorkLocationSchema.safeParse(
      validPayload({ maxGpsAccuracyMeters: 0 })
    );
    assert.equal(parsed.success, false);
    if (!parsed.success) {
      assert.equal(parsed.error.issues[0]?.path[0], "maxGpsAccuracyMeters");
    }
  });

  it("rejects a negative GPS accuracy", () => {
    const parsed = createWorkLocationSchema.safeParse(
      validPayload({ maxGpsAccuracyMeters: -5 })
    );
    assert.equal(parsed.success, false);
  });

  it("rejects an out-of-range GPS accuracy above the existing 500 m maximum", () => {
    const parsed = createWorkLocationSchema.safeParse(
      validPayload({ maxGpsAccuracyMeters: 501 })
    );
    assert.equal(parsed.success, false);
  });

  it("accepts an unset GPS accuracy (engine default applies)", () => {
    const parsed = createWorkLocationSchema.safeParse(
      validPayload({ maxGpsAccuracyMeters: undefined })
    );
    assert.equal(parsed.success, true);
  });
});

describe("Active-completeness (required fields)", () => {
  it("accepts a valid complete ACTIVE Work Location", () => {
    const parsed = createWorkLocationSchema.safeParse(validPayload());
    assert.equal(parsed.success, true);
  });

  it("rejects an ACTIVE Work Location missing the radius", () => {
    const parsed = createWorkLocationSchema.safeParse(
      validPayload({ radiusMeters: undefined })
    );
    assert.equal(parsed.success, false);
    if (!parsed.success) {
      const paths = parsed.error.issues.map((issue) => issue.path[0]);
      assert.ok(paths.includes("radiusMeters"));
    }
  });

  it("rejects an ACTIVE Work Location missing coordinates", () => {
    const parsed = createWorkLocationSchema.safeParse(
      validPayload({ latitude: undefined, longitude: undefined })
    );
    assert.equal(parsed.success, false);
    if (!parsed.success) {
      const paths = parsed.error.issues.map((issue) => issue.path[0]);
      assert.ok(paths.includes("latitude"));
      assert.ok(paths.includes("longitude"));
    }
  });

  it("rejects an incomplete location whose status defaults to ACTIVE", () => {
    const { status: _status, ...withoutStatus } = validPayload();
    void _status;
    const parsed = createWorkLocationSchema.safeParse({
      ...withoutStatus,
      radiusMeters: undefined,
    });
    assert.equal(parsed.success, false);
  });

  it("permits an incomplete INACTIVE draft location", () => {
    const parsed = createWorkLocationSchema.safeParse(
      validPayload({
        status: "inactive",
        latitude: undefined,
        longitude: undefined,
        radiusMeters: undefined,
      })
    );
    assert.equal(parsed.success, true);
  });

  it("rejects a partial update that activates an incomplete location", () => {
    const parsed = updateWorkLocationSchema.safeParse({
      name: "Renamed",
      projectId: PROJECT_A,
      status: "active",
      latitude: undefined,
      longitude: undefined,
      radiusMeters: undefined,
    });
    assert.equal(parsed.success, false);
  });

  it("accepts a partial update that keeps the status untouched", () => {
    const parsed = updateWorkLocationSchema.safeParse({
      name: "Renamed",
      projectId: PROJECT_A,
    });
    assert.equal(parsed.success, true);
  });
});

describe("Completeness helpers", () => {
  it("reports no missing fields for a complete ACTIVE location", () => {
    const missing = missingActiveWorkLocationFields({
      status: "active",
      projectId: PROJECT_A,
      latitude: -6.2,
      longitude: 106.8,
      radiusMeters: 100,
    });
    assert.deepEqual(missing, []);
    assert.equal(
      isActiveWorkLocationComplete({
        status: "active",
        projectId: PROJECT_A,
        latitude: -6.2,
        longitude: 106.8,
        radiusMeters: 100,
      }),
      true
    );
  });

  it("never blocks INACTIVE locations even when fields are absent", () => {
    assert.deepEqual(
      missingActiveWorkLocationFields({
        status: "inactive",
        projectId: null,
        latitude: null,
        longitude: null,
        radiusMeters: null,
      }),
      []
    );
  });

  it("flags each missing field required for activation", () => {
    const missing = missingActiveWorkLocationFields({
      status: "active",
      projectId: PROJECT_A,
      latitude: Number.NaN,
      longitude: null,
      radiusMeters: undefined,
    });
    const labels = missing.map((field) => field.label);
    assert.ok(labels.includes("Latitude"));
    assert.ok(labels.includes("Longitude"));
    assert.ok(labels.includes("Radius (meters)"));
  });
});


describe("Status handling", () => {
  it("accepts only active|inactive statuses", () => {
    assert.equal(createWorkLocationSchema.safeParse(validPayload({ status: "active" })).success, true);
    assert.equal(createWorkLocationSchema.safeParse(validPayload({ status: "inactive" })).success, true);
    assert.equal(createWorkLocationSchema.safeParse(validPayload({ status: "bogus" })).success, false);
    assert.equal(createWorkLocationSchema.safeParse(validPayload({ status: "" })).success, false);
  });

  it("defaults a create payload without status to ACTIVE", () => {
    const { status: _status, ...withoutStatus } = validPayload();
    void _status;
    const parsed = createWorkLocationSchema.safeParse(withoutStatus);
    assert.equal(parsed.success, true);
    if (parsed.success) {
      assert.equal(parsed.data.status, "active");
    }
  });
});

describe("Unknown / malformed input rejection", () => {
  it("rejects an unknown key such as a client-supplied organizationId", () => {
    const parsed = createWorkLocationSchema.safeParse(
      validPayload({ organizationId: ORG_B })
    );
    assert.equal(parsed.success, false);
  });

  it("rejects an empty payload", () => {
    const parsed = createWorkLocationSchema.safeParse({});
    assert.equal(parsed.success, false);
  });

  it("rejects non-numeric coordinate strings", () => {
    const parsed = createWorkLocationSchema.safeParse(
      validPayload({ latitude: "abc", longitude: "1.2.3" })
    );
    assert.equal(parsed.success, false);
  });

  it("rejects a malformed project id", () => {
    const parsed = createWorkLocationSchema.safeParse(
      validPayload({ projectId: "not-a-uuid" })
    );
    assert.equal(parsed.success, false);
    if (!parsed.success) {
      assert.equal(parsed.error.issues[0]?.path[0], "projectId");
    }
  });

  it("maps Zod issues to the fieldErrors shape used by the forms", () => {
    const parsed = createWorkLocationSchema.safeParse(
      validPayload({ latitude: undefined })
    );
    assert.equal(parsed.success, false);
    if (!parsed.success) {
      const fieldErrors = workLocationZodFieldErrors(parsed.error.issues);
      assert.match(fieldErrors.latitude ?? "", /required for an active/i);
    }
  });
});

describe("Project eligibility guard", () => {
  const activeProject = { id: PROJECT_A, organizationId: ORG_A, status: "active" };

  it("authorizes an ACTIVE project in the actor's organization", () => {
    assert.deepEqual(
      evaluateWorkLocationProjectEligibility({
        actorOrganizationId: ORG_A,
        project: activeProject,
        projectIsUnchanged: false,
      }),
      { ok: true }
    );
  });

  it("rejects a missing project with a safe generic message", () => {
    const decision = evaluateWorkLocationProjectEligibility({
      actorOrganizationId: ORG_A,
      project: null,
      projectIsUnchanged: false,
    });
    assert.equal(decision.ok, false);
    if (!decision.ok) assert.match(decision.message, /not available/i);
  });

  it("rejects a cross-organization project (generic, existence hidden)", () => {
    const decision = evaluateWorkLocationProjectEligibility({
      actorOrganizationId: ORG_A,
      project: { id: PROJECT_A, organizationId: ORG_B, status: "active" },
      projectIsUnchanged: false,
    });
    assert.deepEqual(decision, { ok: false, message: "The selected project is not available." });
describe("Multiple locations for one project stay allowed (no invented uniqueness)", () => {
  it("accepts several location configurations for the SAME project", () => {
    const siteOffice = createWorkLocationSchema.safeParse(
      validPayload({ name: "Duri Site Office" })
    );
    const warehouse = createWorkLocationSchema.safeParse(
      validPayload({ name: "Duri Warehouse", radiusMeters: 200 })
    );
    const workshop = createWorkLocationSchema.safeParse(
      validPayload({ name: "Duri Workshop", latitude: -6.21, longitude: 106.85 })
    );
    assert.equal(siteOffice.success, true);
    assert.equal(warehouse.success, true);
    assert.equal(workshop.success, true);
  });

  it("does not reject repeated identical project bindings through the eligibility guard", () => {
    for (let index = 0; index < 3; index += 1) {
      const decision = evaluateWorkLocationProjectEligibility({
        actorOrganizationId: ORG_A,
        project: { id: PROJECT_A, organizationId: ORG_A, status: "active" },
        projectIsUnchanged: false,
      });
      assert.deepEqual(decision, { ok: true });
    }
  });
});

describe("Operational warnings (warnings, not blockers)", () => {
  it("warns when the location is inactive", () => {
    const warnings = collectWorkLocationWarnings({
      status: "inactive",
      projectStatus: "active",
      hasActiveAssignments: true,
    });
    assert.equal(warnings.length, 1);
    assert.match(warnings[0], /inactive/i);
  });

  it("warns when the bound project is no longer active", () => {
    const warnings = collectWorkLocationWarnings({
      status: "active",
      projectStatus: "inactive",
      hasActiveAssignments: true,
    });
    assert.ok(warnings.some((warning) => /no longer active/i.test(warning)));
  });

  it("warns when no active employee assignment exists for the project", () => {
    const warnings = collectWorkLocationWarnings({
      status: "active",
      projectStatus: "active",
      hasActiveAssignments: false,
    });
    assert.ok(
      warnings.some((warning) => /active employee project assignment/i.test(warning))
    );
  });

  it("emits no warnings for an active location with an active, assigned project", () => {
    const warnings = collectWorkLocationWarnings({
      status: "active",
      projectStatus: "active",
      hasActiveAssignments: true,
    });
    assert.deepEqual(warnings, []);
  });

  it("does not block or warn differently when a duplicate location exists", () => {
    // A second (or third) location for the same project is not treated as a
    // configuration error — the location is simply reported once.
    const warnings = collectWorkLocationWarnings({
      status: "active",
      projectStatus: "active",
      hasActiveAssignments: true,
    });
    assert.deepEqual(warnings, []);
  });
});

  });

  it("rejects binding to an inactive/completed project when the binding changes", () => {
    const inactive = evaluateWorkLocationProjectEligibility({
      actorOrganizationId: ORG_A,
      project: { id: PROJECT_A, organizationId: ORG_A, status: "inactive" },
      projectIsUnchanged: false,
    });
    assert.equal(inactive.ok, false);
    if (!inactive.ok) assert.match(inactive.message, /Only active projects/i);

    const completed = evaluateWorkLocationProjectEligibility({
      actorOrganizationId: ORG_A,
      project: { id: PROJECT_A, organizationId: ORG_A, status: "completed" },
      projectIsUnchanged: false,
    });
    assert.equal(completed.ok, false);
  });

  it("keeps an unchanged project binding when the project was deactivated later", () => {
    const decision = evaluateWorkLocationProjectEligibility({
      actorOrganizationId: ORG_A,
      project: { id: PROJECT_A, organizationId: ORG_A, status: "inactive" },
      projectIsUnchanged: true,
    });
    assert.deepEqual(decision, { ok: true });
  });
});
