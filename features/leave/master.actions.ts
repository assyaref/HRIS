"use server";

import { and, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { db } from "@/db";
import {
  employees,
  leaveBalances,
  leaveRequests,
  leaveTypes,
} from "@/db/schema";
import { writeAuditLog, type AuditAction } from "@/lib/auth/audit";
import { requireUser } from "@/lib/auth/auth";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { requirePermission } from "@/lib/auth/rbac";

import {
  balanceCoversConsumption,
  generateLeaveBalancesSchema,
  isBalanceDeletable,
  leaveBalanceSchema,
  leaveTypeSchema,
} from "./master.schemas";
import { getLeaveTypeForAdmin, isLeaveTypeCodeTaken } from "./master.queries";

/**
 * Leave master data — server actions (leave types + balances).
 *
 * Rulebook (same as the other modules):
 * 1. `requireUser` + `requirePermission(leave.manage)` on EVERY call. A Super
 *    Administrator passes every permission check and operates in the acting
 *    organization chosen in the shell.
 * 2. Every read/write is pinned to the session organization; ids from the
 *    client are re-checked against it.
 * 3. Every mutation is audited.
 */

export interface LeaveMasterResult {
  ok: boolean;
  message: string;
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function authorize(): Promise<
  { ok: true; userId: string; organizationId: string } | LeaveMasterResult
> {
  const user = await requireUser();
  await requirePermission(user.id, PERMISSIONS.LEAVE_MANAGE);
  if (!user.organizationId) {
    return { ok: false, message: "Akun Anda belum terhubung ke organisasi." };
  }
  return { ok: true, userId: user.id, organizationId: user.organizationId };
}

function isAuthorized(
  value: Awaited<ReturnType<typeof authorize>>
): value is { ok: true; userId: string; organizationId: string } {
  return value.ok && "organizationId" in value;
}

async function audit(
  organizationId: string,
  actorUserId: string,
  action: AuditAction,
  entityType: string,
  entityId: string | null,
  metadata: Record<string, unknown>
) {
  try {
    await writeAuditLog({
      organizationId,
      actorUserId,
      action,
      entityType,
      entityId,
      metadata,
    });
  } catch (error) {
    console.error("[leave-master] audit failed", error);
  }
}

function firstIssue(error: { issues: { message: string }[] }): string {
  return error.issues[0]?.message ?? "Data tidak valid.";
}

function refresh() {
  revalidatePath("/leave/types");
  revalidatePath("/leave");
  revalidatePath("/leave/management");
}

/* ------------------------------------------------------------------ */
/* Leave types                                                         */
/* ------------------------------------------------------------------ */

export async function createLeaveTypeAction(
  input: unknown
): Promise<LeaveMasterResult> {
  const auth = await authorize();
  if (!isAuthorized(auth)) return auth;

  const parsed = leaveTypeSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: firstIssue(parsed.error) };
  const values = parsed.data;

  if (await isLeaveTypeCodeTaken(auth.organizationId, values.code)) {
    return { ok: false, message: `Kode ${values.code} sudah dipakai.` };
  }

  try {
    const inserted = await db
      .insert(leaveTypes)
      .values({
        organizationId: auth.organizationId,
        code: values.code,
        name: values.name,
        description: values.description,
        defaultAllowanceDays: values.defaultAllowanceDays,
        active: true,
      })
      .returning({ id: leaveTypes.id });
    await audit(
      auth.organizationId,
      auth.userId,
      "leave.type.created",
      "leave_type",
      inserted[0]?.id ?? null,
      { code: values.code, name: values.name }
    );
    refresh();
    return { ok: true, message: "Jenis cuti dibuat." };
  } catch (error) {
    console.error("[leave-master] create type failed", error);
    return { ok: false, message: "Jenis cuti gagal dibuat." };
  }
}

export async function updateLeaveTypeAction(
  leaveTypeId: string,
  input: unknown
): Promise<LeaveMasterResult> {
  const auth = await authorize();
  if (!isAuthorized(auth)) return auth;
  if (!UUID_PATTERN.test(leaveTypeId)) {
    return { ok: false, message: "Jenis cuti tidak ditemukan." };
  }

  const existing = await getLeaveTypeForAdmin(auth.organizationId, leaveTypeId);
  if (!existing) return { ok: false, message: "Jenis cuti tidak ditemukan." };

  const parsed = leaveTypeSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: firstIssue(parsed.error) };
  const values = parsed.data;

  if (
    await isLeaveTypeCodeTaken(auth.organizationId, values.code, leaveTypeId)
  ) {
    return { ok: false, message: `Kode ${values.code} sudah dipakai.` };
  }

  try {
    await db
      .update(leaveTypes)
      .set({
        code: values.code,
        name: values.name,
        description: values.description,
        defaultAllowanceDays: values.defaultAllowanceDays,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(leaveTypes.id, leaveTypeId),
          eq(leaveTypes.organizationId, auth.organizationId)
        )
      );
    await audit(
      auth.organizationId,
      auth.userId,
      "leave.type.updated",
      "leave_type",
      leaveTypeId,
      { before: { code: existing.code, name: existing.name }, after: values }
    );
    refresh();
    return { ok: true, message: "Jenis cuti diperbarui." };
  } catch (error) {
    console.error("[leave-master] update type failed", error);
    return { ok: false, message: "Jenis cuti gagal diperbarui." };
  }
}

export async function setLeaveTypeActiveAction(
  leaveTypeId: string,
  active: boolean
): Promise<LeaveMasterResult> {
  const auth = await authorize();
  if (!isAuthorized(auth)) return auth;
  if (!UUID_PATTERN.test(leaveTypeId)) {
    return { ok: false, message: "Jenis cuti tidak ditemukan." };
  }
  const existing = await getLeaveTypeForAdmin(auth.organizationId, leaveTypeId);
  if (!existing) return { ok: false, message: "Jenis cuti tidak ditemukan." };

  await db
    .update(leaveTypes)
    .set({ active: active === true, updatedAt: new Date() })
    .where(
      and(
        eq(leaveTypes.id, leaveTypeId),
        eq(leaveTypes.organizationId, auth.organizationId)
      )
    );
  await audit(
    auth.organizationId,
    auth.userId,
    "leave.type.status_changed",
    "leave_type",
    leaveTypeId,
    { code: existing.code, active: active === true }
  );
  refresh();
  return {
    ok: true,
    message: active ? "Jenis cuti diaktifkan." : "Jenis cuti dinonaktifkan.",
  };
}

export async function deleteLeaveTypeAction(
  leaveTypeId: string
): Promise<LeaveMasterResult> {
  const auth = await authorize();
  if (!isAuthorized(auth)) return auth;
  if (!UUID_PATTERN.test(leaveTypeId)) {
    return { ok: false, message: "Jenis cuti tidak ditemukan." };
  }
  const existing = await getLeaveTypeForAdmin(auth.organizationId, leaveTypeId);
  if (!existing) return { ok: false, message: "Jenis cuti tidak ditemukan." };

  // Requests reference the type without cascade (history must survive), and
  // balances would be cascaded away. Either one means: deactivate instead.
  const [request, balance] = await Promise.all([
    db
      .select({ id: leaveRequests.id })
      .from(leaveRequests)
      .where(eq(leaveRequests.leaveTypeId, leaveTypeId))
      .limit(1),
    db
      .select({ id: leaveBalances.id })
      .from(leaveBalances)
      .where(eq(leaveBalances.leaveTypeId, leaveTypeId))
      .limit(1),
  ]);
  if (request.length > 0 || balance.length > 0) {
    return {
      ok: false,
      message:
        "Jenis cuti sudah dipakai pada pengajuan atau saldo. Nonaktifkan saja agar riwayat tetap utuh.",
    };
  }

  try {
    await db
      .delete(leaveTypes)
      .where(
        and(
          eq(leaveTypes.id, leaveTypeId),
          eq(leaveTypes.organizationId, auth.organizationId)
        )
      );
  } catch (error) {
    console.error("[leave-master] delete type failed", error);
    return {
      ok: false,
      message: "Jenis cuti gagal dihapus. Nonaktifkan saja jika masih dipakai.",
    };
  }
  await audit(
    auth.organizationId,
    auth.userId,
    "leave.type.deleted",
    "leave_type",
    leaveTypeId,
    { code: existing.code, name: existing.name }
  );
  refresh();
  return { ok: true, message: "Jenis cuti dihapus." };
}

/* ------------------------------------------------------------------ */
/* Leave balances                                                      */
/* ------------------------------------------------------------------ */

async function employeeInOrganization(
  organizationId: string,
  employeeId: string
): Promise<boolean> {
  const rows = await db
    .select({ id: employees.id })
    .from(employees)
    .where(
      and(
        eq(employees.id, employeeId),
        eq(employees.organizationId, organizationId)
      )
    )
    .limit(1);
  return rows.length > 0;
}

/**
 * Create or update one employee's balance for a type/year (upsert on the
 * unique employee+type+year triple). `used`/`pending` are never written here —
 * they are owned by the request workflow — and the new total must still cover
 * them so an approved/pending request can never go negative.
 */
export async function saveLeaveBalanceAction(
  input: unknown
): Promise<LeaveMasterResult> {
  const auth = await authorize();
  if (!isAuthorized(auth)) return auth;

  const parsed = leaveBalanceSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: firstIssue(parsed.error) };
  const values = parsed.data;

  const [type, employeeOk] = await Promise.all([
    getLeaveTypeForAdmin(auth.organizationId, values.leaveTypeId),
    employeeInOrganization(auth.organizationId, values.employeeId),
  ]);
  if (!type) return { ok: false, message: "Jenis cuti tidak ditemukan." };
  if (!employeeOk) return { ok: false, message: "Karyawan tidak ditemukan." };

  try {
    const outcome = await db.transaction(async (tx) => {
      const existingRows = await tx
        .select({
          id: leaveBalances.id,
          entitlement: leaveBalances.entitlement,
          adjustment: leaveBalances.adjustment,
          used: leaveBalances.used,
          pending: leaveBalances.pending,
        })
        .from(leaveBalances)
        .where(
          and(
            eq(leaveBalances.organizationId, auth.organizationId),
            eq(leaveBalances.employeeId, values.employeeId),
            eq(leaveBalances.leaveTypeId, values.leaveTypeId),
            eq(leaveBalances.year, values.year)
          )
        )
        .for("update")
        .limit(1);
      const existing = existingRows[0];

      if (existing) {
        if (
          !balanceCoversConsumption({
            entitlement: values.entitlement,
            adjustment: values.adjustment,
            used: existing.used,
            pending: existing.pending,
          })
        ) {
          return {
            kind: "error" as const,
            message: `Saldo baru lebih kecil dari cuti yang sudah terpakai/menunggu (${existing.used + existing.pending} hari).`,
          };
        }
        await tx
          .update(leaveBalances)
          .set({
            entitlement: values.entitlement,
            adjustment: values.adjustment,
            updatedAt: new Date(),
          })
          .where(eq(leaveBalances.id, existing.id));
        return {
          kind: "updated" as const,
          id: existing.id,
          before: {
            entitlement: existing.entitlement,
            adjustment: existing.adjustment,
          },
        };
      }

      const inserted = await tx
        .insert(leaveBalances)
        .values({
          organizationId: auth.organizationId,
          employeeId: values.employeeId,
          leaveTypeId: values.leaveTypeId,
          year: values.year,
          entitlement: values.entitlement,
          adjustment: values.adjustment,
        })
        .returning({ id: leaveBalances.id });
      return { kind: "created" as const, id: inserted[0]?.id ?? null, before: null };
    });

    if (outcome.kind === "error") return { ok: false, message: outcome.message };

    await audit(
      auth.organizationId,
      auth.userId,
      "leave.balance.saved",
      "leave_balance",
      outcome.id,
      {
        employeeId: values.employeeId,
        leaveTypeCode: type.code,
        year: values.year,
        before: outcome.before,
        after: { entitlement: values.entitlement, adjustment: values.adjustment },
      }
    );
    refresh();
    return {
      ok: true,
      message: outcome.kind === "created" ? "Saldo cuti dibuat." : "Saldo cuti diperbarui.",
    };
  } catch (error) {
    console.error("[leave-master] save balance failed", error);
    return { ok: false, message: "Saldo cuti gagal disimpan." };
  }
}

export async function deleteLeaveBalanceAction(
  balanceId: string
): Promise<LeaveMasterResult> {
  const auth = await authorize();
  if (!isAuthorized(auth)) return auth;
  if (!UUID_PATTERN.test(balanceId)) {
    return { ok: false, message: "Saldo cuti tidak ditemukan." };
  }

  const outcome = await db.transaction(async (tx) => {
    const rows = await tx
      .select({
        id: leaveBalances.id,
        employeeId: leaveBalances.employeeId,
        leaveTypeId: leaveBalances.leaveTypeId,
        year: leaveBalances.year,
        entitlement: leaveBalances.entitlement,
        adjustment: leaveBalances.adjustment,
        used: leaveBalances.used,
        pending: leaveBalances.pending,
      })
      .from(leaveBalances)
      .where(
        and(
          eq(leaveBalances.id, balanceId),
          eq(leaveBalances.organizationId, auth.organizationId)
        )
      )
      .for("update")
      .limit(1);
    const row = rows[0];
    if (!row) return { ok: false as const, message: "Saldo cuti tidak ditemukan." };
    if (!isBalanceDeletable(row)) {
      return {
        ok: false as const,
        message:
          "Saldo ini sudah dipakai atau sedang menunggu persetujuan, sehingga tidak dapat dihapus.",
      };
    }
    await tx.delete(leaveBalances).where(eq(leaveBalances.id, row.id));
    return { ok: true as const, row };
  });

  if (!outcome.ok) return { ok: false, message: outcome.message };
  await audit(
    auth.organizationId,
    auth.userId,
    "leave.balance.deleted",
    "leave_balance",
    balanceId,
    {
      employeeId: outcome.row.employeeId,
      leaveTypeId: outcome.row.leaveTypeId,
      year: outcome.row.year,
      entitlement: outcome.row.entitlement,
      adjustment: outcome.row.adjustment,
    }
  );
  refresh();
  return { ok: true, message: "Saldo cuti dihapus." };
}

/**
 * Create the missing balances for every ACTIVE employee for one type/year.
 * Existing balances are left untouched (never overwritten), so it is safe to
 * re-run, e.g. after new hires.
 */
export async function generateLeaveBalancesAction(
  input: unknown
): Promise<LeaveMasterResult> {
  const auth = await authorize();
  if (!isAuthorized(auth)) return auth;

  const parsed = generateLeaveBalancesSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: firstIssue(parsed.error) };
  const values = parsed.data;

  const type = await getLeaveTypeForAdmin(auth.organizationId, values.leaveTypeId);
  if (!type) return { ok: false, message: "Jenis cuti tidak ditemukan." };
  const entitlement = values.entitlement ?? type.defaultAllowanceDays;
  if (entitlement === null || entitlement === undefined) {
    return {
      ok: false,
      message:
        "Jenis cuti ini tidak punya jatah default. Isi jumlah hari terlebih dahulu.",
    };
  }

  const activeEmployees = await db
    .select({ id: employees.id })
    .from(employees)
    .where(
      and(
        eq(employees.organizationId, auth.organizationId),
        eq(employees.employmentStatus, "active")
      )
    );
  if (activeEmployees.length === 0) {
    return { ok: false, message: "Tidak ada karyawan aktif di organisasi ini." };
  }

  const ids = activeEmployees.map((row) => row.id);
  const existing = await db
    .select({ employeeId: leaveBalances.employeeId })
    .from(leaveBalances)
    .where(
      and(
        eq(leaveBalances.organizationId, auth.organizationId),
        eq(leaveBalances.leaveTypeId, values.leaveTypeId),
        eq(leaveBalances.year, values.year),
        inArray(leaveBalances.employeeId, ids)
      )
    );
  const has = new Set(existing.map((row) => row.employeeId));
  const missing = ids.filter((id) => !has.has(id));

  if (missing.length > 0) {
    await db
      .insert(leaveBalances)
      .values(
        missing.map((employeeId) => ({
          organizationId: auth.organizationId,
          employeeId,
          leaveTypeId: values.leaveTypeId,
          year: values.year,
          entitlement,
        }))
      )
      .onConflictDoNothing();
  }

  await audit(
    auth.organizationId,
    auth.userId,
    "leave.balance.generated",
    "leave_type",
    values.leaveTypeId,
    {
      leaveTypeCode: type.code,
      year: values.year,
      entitlement,
      created: missing.length,
      skipped: ids.length - missing.length,
    }
  );
  refresh();
  return {
    ok: true,
    message:
      missing.length > 0
        ? `${missing.length} saldo dibuat (${ids.length - missing.length} sudah ada, tidak diubah).`
        : "Semua karyawan aktif sudah punya saldo untuk jenis dan tahun ini.",
  };
}
