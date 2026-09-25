"use server";

import { and, eq, ne } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { forbidden } from "next/navigation";

import { db } from "@/db";
import {
  employeeAddresses,
  employeeBankAccounts,
  employeeCustomFieldValues,
  employeeDependents,
  employeeDocuments,
  employeeEducations,
  employeeEmploymentHistory,
  employeeInsurances,
  employees,
  workLocations,
} from "@/db/schema";
import { requireUser } from "@/lib/auth/auth";
import { writeAuditLog } from "@/lib/auth/audit";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { getUserAuthorization, requirePermission } from "@/lib/auth/rbac";
import {
  deleteEmployeeDocumentFile,
  storeEmployeeDocument,
} from "@/lib/employee-documents/storage";

import { getEmployeeInOrganization } from "../queries";
import {
  sanitizeOriginalFilename,
  validateDocumentUpload,
} from "../documents/storage";
import { listActiveFieldDefinitions } from "../../employee-fields/queries";
import { parseCustomFieldValue } from "../../employee-fields/validation";
import { isFieldWritableByRoles } from "../../employee-fields/filtering";

/**
 * Employee Master Data server actions (Employee Master Data 2.0).
 *
 * Per-section CRUD with the same security rules as the core employee actions:
 *  - Every action re-authenticates (`requireUser`) and re-authorizes against
 *    PostgreSQL. Nothing about the caller is trusted from the form body.
 *  - The organization always comes from the authenticated session; a section
 *    must belong to the caller's organization (forbidden otherwise).
 *  - Each section enforces its own capability: personal → `employees.personal.*`,
 *    employment → `employees.employment.*`, address → `employees.address.*`,
 *    insurance → `employees.insurance.*`, bank → `employees.bank.*`, family →
 *    `employees.family.*`, education → `employees.education.*`, documents →
 *    `employees.document.*`.
 *  - Employment changes are snapshot into the append-only history table.
 *  - Bank primary switching is a transaction so the partial unique index
 *    ("one primary per employee") can never produce a conflict.
 */

export interface EmployeeSectionActionState {
  status: "idle" | "error" | "success";
  message?: string;
  fieldErrors?: Record<string, string>;
}

function toStateError(
  message: string | undefined,
  fieldErrors?: Record<string, string>
): EmployeeSectionActionState {
  return { status: "error", message, fieldErrors };
}

function toSuccess(message: string): EmployeeSectionActionState {
  return { status: "success", message };
}

function value(formData: FormData, name: string): string {
  const entry = formData.get(name);
  return typeof entry === "string" ? entry.trim() : "";
}

function optionalValue(formData: FormData, name: string): string | null {
  const entry = value(formData, name);
  return entry === "" ? null : entry;
}

function checked(formData: FormData, name: string): boolean {
  return value(formData, name).toLowerCase() === "on" ||
    value(formData, name).toLowerCase() === "true" ||
    value(formData, name).toLowerCase() === "yes";
}

/** `YYYY-MM-DD` → UTC Date, or null (safe for `<input type="date">`). */
function dateOrNull(raw: string | null | undefined): Date | null {
  if (!raw) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  return new Date(`${raw}T00:00:00.000Z`);
}

function isValidInteger(raw: string | null): boolean {
  return raw !== null && /^-?\d{1,7}$/.test(raw);
}

async function audit(
  organizationId: string,
  userId: string,
  action:
    | "employee.personal.updated"
    | "employee.employment.updated"
    | "employee.address.created"
    | "employee.address.updated"
    | "employee.address.deleted"
    | "employee.insurance.updated"
    | "employee.bank_account.created"
    | "employee.bank_account.updated"
    | "employee.bank_account.deleted"
    | "employee.bank_account.primary_changed"
    | "employee.dependent.created"
    | "employee.dependent.updated"
    | "employee.dependent.deleted"
    | "employee.education.created"
    | "employee.education.updated"
    | "employee.education.deleted"
    | "employee.document.uploaded"
    | "employee.document.deleted"
    | "employee.employment_history.created"
    | "employee.status_changed"
    | "employee_custom_data.updated"
    | "employee_custom_data.deleted",
  entityType: string,
  entityId: string,
  metadata: Record<string, unknown>
): Promise<void> {
  try {
    await writeAuditLog({
      organizationId,
      actorUserId: userId,
      action,
      entityType,
      entityId,
      metadata,
    });
  } catch (error) {
    console.error(`[master-data] audit failed (${action})`, error);
  }
}

function revalidate(employeeId: string): void {
  revalidatePath(`/employees/${employeeId}`);
  revalidatePath("/employees");
}

async function requireEmployeeScope(employeeId: string): Promise<{
  organizationId: string;
  employee: { employeeNumber: string; firstName: string; lastName: string };
}> {
  const user = await requireUser();
  if (!user.organizationId) {
    throw new ActionError("Your account is not assigned to an organization.");
  }
  const organizationId = user.organizationId;
  const employee = await getEmployeeInOrganization(employeeId, organizationId);
  if (!employee) forbidden();
  return {
    organizationId,
    employee: {
      employeeNumber: employee.employeeNumber,
      firstName: employee.firstName,
      lastName: employee.lastName,
    },
  };
}

class ActionError extends Error {}

function handle(error: unknown): EmployeeSectionActionState {
  if (error instanceof ActionError) {
    return toStateError(error.message);
  }
  console.error("[master-data] action failed", error);
  return toStateError(undefined, {
    form: "Could not save your changes. Please try again.",
  });
}

/** Optional value that never exceeds a length cap (keeps column safety). */
function optionalCapped(formData: FormData, name: string, max: number): string | null {
  const raw = optionalValue(formData, name);
  return raw ? raw.slice(0, max) : null;
}

/* ------------------------------------------------------------------ */
/* Personal                                                            */
/* ------------------------------------------------------------------ */

export async function updatePersonalDataAction(
  employeeId: string,
  _prevState: EmployeeSectionActionState,
  formData: FormData
): Promise<EmployeeSectionActionState> {
  try {
    const user = await requireUser();
    await requirePermission(user.id, PERMISSIONS.EMPLOYEES_PERSONAL_UPDATE);
    const { organizationId, employee } = await requireEmployeeScope(employeeId);

    const gender = optionalValue(formData, "gender");
    const maritalStatus = optionalValue(formData, "maritalStatus");
    if (gender && gender.length > 20) throw new ActionError("Gender is too long.");
    if (maritalStatus && maritalStatus.length > 20) {
      throw new ActionError("Marital status is too long.");
    }

    const personalEmail = optionalCapped(formData, "personalEmail", 254);
    if (personalEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(personalEmail)) {
      throw new ActionError("Personal email is invalid.");
    }

    const nik = optionalCapped(formData, "nik", 32);
    if (nik && !/^\d+$/.test(nik)) {
      throw new ActionError("NIK must contain digits only.");
    }

    await db
      .update(employees)
      .set({
        nik,
        birthDate: dateOrNull(optionalValue(formData, "birthDate")),
        nickname: optionalCapped(formData, "nickname", 100),
        birthPlace: optionalCapped(formData, "birthPlace", 200),
        gender,
        religion: optionalCapped(formData, "religion", 50),
        maritalStatus,
        nationality: optionalCapped(formData, "nationality", 50),
        personalEmail,
        phone: optionalCapped(formData, "phone", 30),
        updatedAt: new Date(),
      })
      .where(
        and(eq(employees.id, employeeId), eq(employees.organizationId, organizationId))
      );

    await audit(
      organizationId,
      user.id,
      "employee.personal.updated",
      "employee",
      employeeId,
      { employeeNumber: employee.employeeNumber }
    );
    revalidate(employeeId);
    return toSuccess("Personal details updated.");
  } catch (error) {
    return handle(error);
  }
}

/* ------------------------------------------------------------------ */
/* Employment                                                         */
/* ------------------------------------------------------------------ */

export async function updateEmploymentDataAction(
  employeeId: string,
  _prevState: EmployeeSectionActionState,
  formData: FormData
): Promise<EmployeeSectionActionState> {
  try {
    const user = await requireUser();
    await requirePermission(user.id, PERMISSIONS.EMPLOYEES_EMPLOYMENT_UPDATE);
    const { organizationId, employee } = await requireEmployeeScope(employeeId);

    const workLocationId = optionalValue(formData, "workLocationId");
    if (workLocationId) {
      const location = await db
        .select({ id: workLocations.id })
        .from(workLocations)
        .where(
          and(eq(workLocations.id, workLocationId), eq(workLocations.organizationId, organizationId))
        )
        .limit(1);
      if (!location[0]) throw new ActionError("The selected work location is invalid.");
    }

    const managerId = optionalValue(formData, "managerId");
    if (managerId) {
      const manager = await db
        .select({ id: employees.id })
        .from(employees)
        .where(
          and(eq(employees.id, managerId), eq(employees.organizationId, organizationId), ne(employees.id, employeeId))
        )
        .limit(1);
      if (!manager[0]) throw new ActionError("The selected manager is invalid.");
    }

    const employmentType = optionalCapped(formData, "employmentType", 30);
    const division = optionalCapped(formData, "division", 100);
    const department = optionalCapped(formData, "department", 100);
    const position = optionalCapped(formData, "position", 100);
    const reasonForLeaving = optionalCapped(formData, "reasonForLeaving", 500);
    const contractStart = dateOrNull(optionalValue(formData, "contractStart"));
    const contractEnd = dateOrNull(optionalValue(formData, "contractEnd"));
    const resignationDate = dateOrNull(optionalValue(formData, "resignationDate"));
    const terminationDate = dateOrNull(optionalValue(formData, "terminationDate"));

    if (contractStart && contractEnd && contractEnd < contractStart) {
      throw new ActionError("Contract end cannot be before the start.");
    }

    const nextEmploymentStatus = optionalValue(formData, "employmentStatus");
    if (
      nextEmploymentStatus !== "active" &&
      nextEmploymentStatus !== "inactive" &&
      nextEmploymentStatus !== null
    ) {
      throw new ActionError("Invalid employment status.");
    }
    const employmentStatus = nextEmploymentStatus ?? null;

    const previous = await db
      .select({
        division: employees.division,
        department: employees.department,
        position: employees.position,
        managerId: employees.managerId,
        workLocationId: employees.workLocationId,
        employmentType: employees.employmentType,
        employmentStatus: employees.employmentStatus,
      })
      .from(employees)
      .where(
        and(
          eq(employees.id, employeeId),
          eq(employees.organizationId, organizationId)
        )
      )
      .limit(1);
    const before = previous[0];
    if (!before) throw new ActionError("The employee no longer exists in your organization.");
    const nextStatus = employmentStatus ?? before.employmentStatus;
    if (nextStatus === "inactive" && before.employmentStatus !== "inactive") {
      await requirePermission(user.id, PERMISSIONS.EMPLOYEES_DELETE);
    }
    const employmentChanged = [
      before.division !== division,
      before.department !== department,
      before.position !== position,
      before.managerId !== managerId,
      before.workLocationId !== workLocationId,
      before.employmentType !== employmentType,
      before.employmentStatus !== nextStatus,
    ].some(Boolean);

    await db.transaction(async (tx) => {
      await tx
        .update(employees)
        .set({
          division,
          department,
          position,
          workLocationId,
          managerId,
          employmentType,
          contractStart,
          contractEnd,
          resignationDate,
          terminationDate,
          reasonForLeaving,
          employmentStatus: nextStatus,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(employees.id, employeeId),
            eq(employees.organizationId, organizationId)
          )
        );
      if (employmentChanged) {
        await tx.insert(employeeEmploymentHistory).values({
          organizationId,
          employeeId,
          division,
          department,
          position,
          managerId,
          workLocationId,
          employmentType,
          employmentStatus: nextStatus,
          notes: optionalCapped(formData, "historyNotes", 500),
        });
      }
    });

    if (employmentChanged) {
      await audit(
        organizationId,
        user.id,
        "employee.employment_history.created",
        "employee",
        employeeId,
        { employeeNumber: employee.employeeNumber }
      );
    }

    await audit(
      organizationId,
      user.id,
      "employee.employment.updated",
      "employee",
      employeeId,
      { employeeNumber: employee.employeeNumber }
    );
    revalidate(employeeId);
    return toSuccess("Employment details updated.");
  } catch (error) {
    return handle(error);
  }
}

/* ------------------------------------------------------------------ */
/* Addresses (KTP + Domicile, one row per type)                       */
/* ------------------------------------------------------------------ */

const ADDRESS_TYPES = ["ktp", "domicile"];

export async function saveAddressAction(
  employeeId: string,
  addressId: string | null,
  _prevState: EmployeeSectionActionState,
  formData: FormData
): Promise<EmployeeSectionActionState> {
  try {
    const user = await requireUser();
    await requirePermission(user.id, PERMISSIONS.EMPLOYEES_ADDRESS_UPDATE);
    const { organizationId, employee } = await requireEmployeeScope(employeeId);

    const addressType = value(formData, "type");
    if (!ADDRESS_TYPES.includes(addressType)) {
      throw new ActionError('Address type must be "KTP" or "Domicile".');
    }
    const sameAsKtp = addressType === "domicile" && checked(formData, "sameAsKtp")
      ? true
      : false;

    const body = {
      type: addressType,
      address: optionalCapped(formData, "address", 500),
      rtRw: optionalCapped(formData, "rtRw", 20),
      village: optionalCapped(formData, "village", 120),
      district: optionalCapped(formData, "district", 120),
      city: optionalCapped(formData, "city", 120),
      province: optionalCapped(formData, "province", 120),
      postalCode: optionalCapped(formData, "postalCode", 20),
      sameAsKtp,
    };

    if (addressId) {
      const owned = await db
        .select({ id: employeeAddresses.id })
        .from(employeeAddresses)
        .where(
          and(
            eq(employeeAddresses.id, addressId),
            eq(employeeAddresses.organizationId, organizationId),
            eq(employeeAddresses.employeeId, employeeId)
          )
        )
        .limit(1);
      if (!owned[0]) forbidden();

      await db
        .update(employeeAddresses)
        .set({ ...body, updatedAt: new Date() })
        .where(eq(employeeAddresses.id, addressId));
      await audit(
        organizationId,
        user.id,
        "employee.address.updated",
        "employee_address",
        addressId,
        { employeeNumber: employee.employeeNumber, type: addressType }
      );
    } else {
      const inserted = await db
        .insert(employeeAddresses)
        .values({ organizationId, employeeId, ...body })
        .onConflictDoNothing({
          target: [employeeAddresses.organizationId, employeeAddresses.employeeId, employeeAddresses.type],
        })
        .returning({ id: employeeAddresses.id });
      if (!inserted[0]) {
        throw new ActionError(
          `A "${addressType}" address already exists for this employee.`
        );
      }
      await audit(
        organizationId,
        user.id,
        "employee.address.created",
        "employee_address",
        inserted[0].id,
        { employeeNumber: employee.employeeNumber, type: addressType }
      );
    }

    revalidate(employeeId);
    return toSuccess(addressId ? "Address updated." : "Address added.");
  } catch (error) {
    return handle(error);
  }
}

export async function deleteAddressAction(
  employeeId: string,
  addressId: string
): Promise<EmployeeSectionActionState> {
  try {
    const user = await requireUser();
    await requirePermission(user.id, PERMISSIONS.EMPLOYEES_ADDRESS_UPDATE);
    const { organizationId, employee } = await requireEmployeeScope(employeeId);

    await db
      .delete(employeeAddresses)
      .where(
        and(
          eq(employeeAddresses.id, addressId),
          eq(employeeAddresses.organizationId, organizationId),
          eq(employeeAddresses.employeeId, employeeId)
        )
      );
    await audit(
      organizationId,
      user.id,
      "employee.address.deleted",
      "employee_address",
      addressId,
      { employeeNumber: employee.employeeNumber }
    );
    revalidate(employeeId);
    return toSuccess("Address removed.");
  } catch (error) {
    return handle(error);
  }
}

/* ------------------------------------------------------------------ */
/* Insurance (one row per employee)                                   */
/* ------------------------------------------------------------------ */

export async function saveInsuranceAction(
  employeeId: string,
  _prevState: EmployeeSectionActionState,
  formData: FormData
): Promise<EmployeeSectionActionState> {
  try {
    const user = await requireUser();
    await requirePermission(user.id, PERMISSIONS.EMPLOYEES_INSURANCE_UPDATE);
    const { organizationId, employee } = await requireEmployeeScope(employeeId);

    const body = {
      npwp: optionalCapped(formData, "npwp", 30),
      bpjsKesehatanNumber: optionalCapped(formData, "bpjsKesehatanNumber", 30),
      bpjsKesehatanStatus: optionalCapped(formData, "bpjsKesehatanStatus", 30),
      bpjsKesehatanClass: optionalCapped(formData, "bpjsKesehatanClass", 10),
      bpjsKetenagakerjaanNumber: optionalCapped(formData, "bpjsKetenagakerjaanNumber", 30),
      bpjsKetenagakerjaanStatus: optionalCapped(formData, "bpjsKetenagakerjaanStatus", 30),
    };
    for (const [key, rawValue] of Object.entries(body)) {
      if (rawValue && !/^[a-zA-Z0-9.\-/]+$/.test(rawValue)) {
        throw new ActionError(
          `${key.split(/(?=[A-Z])/).join(" ")} may contain letters, digits, dots, dashes and slashes only.`
        );
      }
    }

    const existing = await db
      .select({ id: employeeInsurances.id })
      .from(employeeInsurances)
      .where(
        and(
          eq(employeeInsurances.organizationId, organizationId),
          eq(employeeInsurances.employeeId, employeeId)
        )
      )
      .limit(1);

    if (existing[0]) {
      await db
        .update(employeeInsurances)
        .set({ ...body, updatedAt: new Date() })
        .where(eq(employeeInsurances.id, existing[0].id));
    } else {
      await db
        .insert(employeeInsurances)
        .values({ organizationId, employeeId, ...body });
    }

    await audit(
      organizationId,
      user.id,
      "employee.insurance.updated",
      "employee",
      employeeId,
      { employeeNumber: employee.employeeNumber }
    );
    revalidate(employeeId);
    return toSuccess("Insurance details saved.");
  } catch (error) {
    return handle(error);
  }
}

/* ------------------------------------------------------------------ */
/* Bank accounts                                                      */
/* ------------------------------------------------------------------ */

export async function saveBankAccountAction(
  employeeId: string,
  bankAccountId: string | null,
  _prevState: EmployeeSectionActionState,
  formData: FormData
): Promise<EmployeeSectionActionState> {
  try {
    const user = await requireUser();
    await requirePermission(user.id, PERMISSIONS.EMPLOYEES_BANK_UPDATE);
    const { organizationId, employee } = await requireEmployeeScope(employeeId);

    const bankName = optionalCapped(formData, "bankName", 100);
    let accountNumber = optionalCapped(formData, "accountNumber", 40);
    const accountHolder = optionalCapped(formData, "accountHolder", 150);
    if (!bankName) throw new ActionError("Bank name is required.");
    // When editing a row whose (masked) account number was not re-entered,
    // keep the stored value instead of failing the save.
    if (!accountNumber && bankAccountId) {
      const existing = await db
        .select({ accountNumber: employeeBankAccounts.accountNumber })
        .from(employeeBankAccounts)
        .where(
          and(
            eq(employeeBankAccounts.id, bankAccountId),
            eq(employeeBankAccounts.organizationId, organizationId),
            eq(employeeBankAccounts.employeeId, employeeId)
          )
        )
        .limit(1);
      accountNumber = existing[0]?.accountNumber ?? null;
    }
    if (!accountNumber || !/^[0-9A-Za-z .\-]+$/.test(accountNumber)) {
      throw new ActionError("Account number may contain letters, digits, spaces, dots and dashes only.");
    }
    if (!accountHolder) throw new ActionError("Account holder is required.");

    const status = optionalValue(formData, "status") === "inactive" ? "inactive" : "active";
    const isPrimary = value(formData, "isPrimary") === "on";

    if (bankAccountId) {
      const owned = await db
        .select({ id: employeeBankAccounts.id })
        .from(employeeBankAccounts)
        .where(
          and(
            eq(employeeBankAccounts.id, bankAccountId),
            eq(employeeBankAccounts.organizationId, organizationId),
            eq(employeeBankAccounts.employeeId, employeeId)
          )
        )
        .limit(1);
      if (!owned[0]) forbidden();

      // Clear all primary flags for this employee, then set this row primary
      // in one transaction so the partial unique index can never conflict.
      if (isPrimary) {
        await db.transaction(async (tx) => {
          await tx
            .update(employeeBankAccounts)
            .set({ isPrimary: false, updatedAt: new Date() })
            .where(
              and(
                eq(employeeBankAccounts.organizationId, organizationId),
                eq(employeeBankAccounts.employeeId, employeeId)
              )
            );
          await tx
            .update(employeeBankAccounts)
            .set({
              bankName,
              accountNumber,
              accountHolder,
              branch: optionalCapped(formData, "branch", 120),
              status,
              isPrimary: true,
              updatedAt: new Date(),
            })
            .where(eq(employeeBankAccounts.id, bankAccountId));
        });
      } else {
        await db
          .update(employeeBankAccounts)
          .set({
            bankName,
            accountNumber,
            accountHolder,
            branch: optionalCapped(formData, "branch", 120),
            status,
            updatedAt: new Date(),
          })
          .where(eq(employeeBankAccounts.id, bankAccountId));
      }
      await audit(
        organizationId,
        user.id,
        "employee.bank_account.updated",
        "employee_bank_account",
        bankAccountId,
        { employeeNumber: employee.employeeNumber, bankName, isPrimary }
      );
    } else {
      const inserted = await db.transaction(async (tx) => {
        if (isPrimary) {
          await tx
            .update(employeeBankAccounts)
            .set({ isPrimary: false, updatedAt: new Date() })
            .where(
              and(
                eq(employeeBankAccounts.organizationId, organizationId),
                eq(employeeBankAccounts.employeeId, employeeId)
              )
            );
        }
        return tx
          .insert(employeeBankAccounts)
          .values({
            organizationId,
            employeeId,
            bankName,
            accountNumber,
            accountHolder,
            branch: optionalCapped(formData, "branch", 120),
            status,
            isPrimary,
          })
          .returning({ id: employeeBankAccounts.id });
      });
      const row = inserted[0];
      if (!row) throw new Error("Bank account insert returned no row.");
      await audit(
        organizationId,
        user.id,
        "employee.bank_account.created",
        "employee_bank_account",
        row.id,
        { employeeNumber: employee.employeeNumber, bankName, isPrimary }
      );
    }

    revalidate(employeeId);
    return toSuccess(bankAccountId ? "Bank account updated." : "Bank account added.");
  } catch (error) {
    return handle(error);
  }
}

export async function setPrimaryBankAccountAction(
  employeeId: string,
  bankAccountId: string
): Promise<EmployeeSectionActionState> {
  try {
    const user = await requireUser();
    await requirePermission(user.id, PERMISSIONS.EMPLOYEES_BANK_UPDATE);
    const { organizationId, employee } = await requireEmployeeScope(employeeId);

    const owned = await db
      .select({ id: employeeBankAccounts.id, bankName: employeeBankAccounts.bankName })
      .from(employeeBankAccounts)
      .where(
        and(
          eq(employeeBankAccounts.id, bankAccountId),
          eq(employeeBankAccounts.organizationId, organizationId),
          eq(employeeBankAccounts.employeeId, employeeId)
        )
      )
      .limit(1);
    if (!owned[0]) forbidden();

    await db.transaction(async (tx) => {
      await tx
        .update(employeeBankAccounts)
        .set({ isPrimary: false, updatedAt: new Date() })
        .where(
          and(
            eq(employeeBankAccounts.organizationId, organizationId),
            eq(employeeBankAccounts.employeeId, employeeId)
          )
        );
      await tx
        .update(employeeBankAccounts)
        .set({ isPrimary: true, updatedAt: new Date() })
        .where(eq(employeeBankAccounts.id, bankAccountId));
    });

    await audit(
      organizationId,
      user.id,
      "employee.bank_account.primary_changed",
      "employee_bank_account",
      bankAccountId,
      { employeeNumber: employee.employeeNumber, bankName: owned[0].bankName }
    );
    revalidate(employeeId);
    return toSuccess("Primary bank account updated.");
  } catch (error) {
    return handle(error);
  }
}

export async function deleteBankAccountAction(
  employeeId: string,
  bankAccountId: string
): Promise<EmployeeSectionActionState> {
  try {
    const user = await requireUser();
    await requirePermission(user.id, PERMISSIONS.EMPLOYEES_BANK_UPDATE);
    const { organizationId, employee } = await requireEmployeeScope(employeeId);

    await db
      .delete(employeeBankAccounts)
      .where(
        and(
          eq(employeeBankAccounts.id, bankAccountId),
          eq(employeeBankAccounts.organizationId, organizationId),
          eq(employeeBankAccounts.employeeId, employeeId)
        )
      );
    await audit(
      organizationId,
      user.id,
      "employee.bank_account.deleted",
      "employee_bank_account",
      bankAccountId,
      { employeeNumber: employee.employeeNumber }
    );
    revalidate(employeeId);
    return toSuccess("Bank account removed.");
  } catch (error) {
    return handle(error);
  }
}

/* ------------------------------------------------------------------ */
/* Family / dependents                                                */
/* ------------------------------------------------------------------ */

export async function saveDependentAction(
  employeeId: string,
  dependentId: string | null,
  _prevState: EmployeeSectionActionState,
  formData: FormData
): Promise<EmployeeSectionActionState> {
  try {
    const user = await requireUser();
    await requirePermission(user.id, PERMISSIONS.EMPLOYEES_FAMILY_UPDATE);
    const { organizationId, employee } = await requireEmployeeScope(employeeId);

    const name = optionalCapped(formData, "name", 150);
    const relationship = optionalCapped(formData, "relationship", 30);
    if (!name) throw new ActionError("Name is required.");
    if (!relationship) throw new ActionError("Relationship is required.");

    const body = {
      name,
      relationship,
      nik: optionalCapped(formData, "nik", 32),
      birthDate: dateOrNull(optionalValue(formData, "birthDate")),
      gender: optionalCapped(formData, "gender", 20),
      occupation: optionalCapped(formData, "occupation", 120),
      dependentStatus: optionalCapped(formData, "dependentStatus", 30),
      bpjsStatus: optionalCapped(formData, "bpjsStatus", 30),
      notes: optionalCapped(formData, "notes", 500),
    };

    if (dependentId) {
      const owned = await db
        .select({ id: employeeDependents.id, nik: employeeDependents.nik })
        .from(employeeDependents)
        .where(
          and(
            eq(employeeDependents.id, dependentId),
            eq(employeeDependents.organizationId, organizationId),
            eq(employeeDependents.employeeId, employeeId)
          )
        )
        .limit(1);
      if (!owned[0]) forbidden();
      // Preserve the stored NIK when the editor could not reveal it.
      if (!body.nik) body.nik = owned[0].nik;
      await db.update(employeeDependents).set({ ...body, updatedAt: new Date() }).where(eq(employeeDependents.id, dependentId));
      await audit(
        organizationId,
        user.id,
        "employee.dependent.updated",
        "employee_dependent",
        dependentId,
        { employeeNumber: employee.employeeNumber, name }
      );
    } else {
      const inserted = await db
        .insert(employeeDependents)
        .values({ organizationId, employeeId, ...body })
        .returning({ id: employeeDependents.id });
      const row = inserted[0];
      if (!row) throw new Error("Dependent insert returned no row.");
      await audit(
        organizationId,
        user.id,
        "employee.dependent.created",
        "employee_dependent",
        row.id,
        { employeeNumber: employee.employeeNumber, name }
      );
    }

    revalidate(employeeId);
    return toSuccess(dependentId ? "Family member updated." : "Family member added.");
  } catch (error) {
    return handle(error);
  }
}

export async function deleteDependentAction(
  employeeId: string,
  dependentId: string
): Promise<EmployeeSectionActionState> {
  try {
    const user = await requireUser();
    await requirePermission(user.id, PERMISSIONS.EMPLOYEES_FAMILY_UPDATE);
    const { organizationId, employee } = await requireEmployeeScope(employeeId);

    await db
      .delete(employeeDependents)
      .where(
        and(
          eq(employeeDependents.id, dependentId),
          eq(employeeDependents.organizationId, organizationId),
          eq(employeeDependents.employeeId, employeeId)
        )
      );
    await audit(
      organizationId,
      user.id,
      "employee.dependent.deleted",
      "employee_dependent",
      dependentId,
      { employeeNumber: employee.employeeNumber }
    );
    revalidate(employeeId);
    return toSuccess("Family member removed.");
  } catch (error) {
    return handle(error);
  }
}

/* ------------------------------------------------------------------ */
/* Education                                                          */
/* ------------------------------------------------------------------ */

export async function saveEducationAction(
  employeeId: string,
  educationId: string | null,
  _prevState: EmployeeSectionActionState,
  formData: FormData
): Promise<EmployeeSectionActionState> {
  try {
    const user = await requireUser();
    await requirePermission(user.id, PERMISSIONS.EMPLOYEES_EDUCATION_UPDATE);
    const { organizationId, employee } = await requireEmployeeScope(employeeId);

    const educationLevel = optionalCapped(formData, "educationLevel", 40);
    const institution = optionalCapped(formData, "institution", 150);
    if (!educationLevel) throw new ActionError("Education level is required.");
    if (!institution) throw new ActionError("Institution is required.");

    const startYearRaw = optionalValue(formData, "startYear");
    const graduationYearRaw = optionalValue(formData, "graduationYear");
    const startYear = isValidInteger(startYearRaw) ? Number(startYearRaw) : null;
    const graduationYear = isValidInteger(graduationYearRaw) ? Number(graduationYearRaw) : null;
    if (startYear !== null && (startYear < 1900 || startYear > 2200)) {
      throw new ActionError("Start year is out of range.");
    }
    if (graduationYear !== null && (graduationYear < 1900 || graduationYear > 2200)) {
      throw new ActionError("Graduation year is out of range.");
    }

    const body = {
      educationLevel,
      institution,
      major: optionalCapped(formData, "major", 150),
      startYear,
      graduationYear,
      gpaScore: optionalCapped(formData, "gpaScore", 20),
      certificateNumber: optionalCapped(formData, "certificateNumber", 100),
      notes: optionalCapped(formData, "notes", 500),
    };

    if (educationId) {
      const owned = await db
        .select({ id: employeeEducations.id })
        .from(employeeEducations)
        .where(
          and(
            eq(employeeEducations.id, educationId),
            eq(employeeEducations.organizationId, organizationId),
            eq(employeeEducations.employeeId, employeeId)
          )
        )
        .limit(1);
      if (!owned[0]) forbidden();
      await db.update(employeeEducations).set({ ...body, updatedAt: new Date() }).where(eq(employeeEducations.id, educationId));
      await audit(
        organizationId,
        user.id,
        "employee.education.updated",
        "employee_education",
        educationId,
        { employeeNumber: employee.employeeNumber, institution }
      );
    } else {
      const inserted = await db
        .insert(employeeEducations)
        .values({ organizationId, employeeId, ...body })
        .returning({ id: employeeEducations.id });
      const row = inserted[0];
      if (!row) throw new Error("Education insert returned no row.");
      await audit(
        organizationId,
        user.id,
        "employee.education.created",
        "employee_education",
        row.id,
        { employeeNumber: employee.employeeNumber, institution }
      );
    }

    revalidate(employeeId);
    return toSuccess(educationId ? "Education updated." : "Education added.");
  } catch (error) {
    return handle(error);
  }
}

export async function deleteEducationAction(
  employeeId: string,
  educationId: string
): Promise<EmployeeSectionActionState> {
  try {
    const user = await requireUser();
    await requirePermission(user.id, PERMISSIONS.EMPLOYEES_EDUCATION_UPDATE);
    const { organizationId, employee } = await requireEmployeeScope(employeeId);

    await db
      .delete(employeeEducations)
      .where(
        and(
          eq(employeeEducations.id, educationId),
          eq(employeeEducations.organizationId, organizationId),
          eq(employeeEducations.employeeId, employeeId)
        )
      );
    await audit(
      organizationId,
      user.id,
      "employee.education.deleted",
      "employee_education",
      educationId,
      { employeeNumber: employee.employeeNumber }
    );
    revalidate(employeeId);
    return toSuccess("Education record removed.");
  } catch (error) {
    return handle(error);
  }
}

/* ------------------------------------------------------------------ */
/* Documents                                                          */
/* ------------------------------------------------------------------ */

export async function uploadEmployeeDocumentAction(
  employeeId: string,
  _prevState: EmployeeSectionActionState,
  formData: FormData
): Promise<EmployeeSectionActionState> {
  try {
    const user = await requireUser();
    await requirePermission(user.id, PERMISSIONS.EMPLOYEES_DOCUMENT_UPLOAD);
    const { organizationId, employee } = await requireEmployeeScope(employeeId);

    const fileEntry = formData.get("file");
    if (!fileEntry || typeof fileEntry === "string" || !fileEntry.size) {
      return toStateError(undefined, { file: "Choose a file to upload." });
    }

    const documentType = optionalCapped(formData, "documentType", 50);
    if (!documentType) throw new ActionError("Document type is required.");

    const check = validateDocumentUpload({
      filename: fileEntry.name,
      mimeType: fileEntry.type,
      fileSize: fileEntry.size,
    });
    if (!check.ok) {
      return toStateError(undefined, { file: check.error });
    }

    const bytes = Buffer.from(await fileEntry.arrayBuffer());
    const stored = await storeEmployeeDocument({
      organizationId,
      employeeId,
      bytes,
      extension: check.extension,
    });

    const inserted = await db
      .insert(employeeDocuments)
      .values({
        organizationId,
        employeeId,
        documentType,
        documentNumber: optionalCapped(formData, "documentNumber", 100),
        originalFilename: sanitizeOriginalFilename(fileEntry.name),
        storageKey: stored.storageKey,
        mimeType: fileEntry.type,
        fileSize: stored.fileSize,
        uploadedByUserId: user.id,
        expiryDate: dateOrNull(optionalValue(formData, "expiryDate")),
        notes: optionalCapped(formData, "notes", 500),
      })
      .returning({ id: employeeDocuments.id });
    const row = inserted[0];
    if (!row) throw new Error("Document insert returned no row.");

    await audit(
      organizationId,
      user.id,
      "employee.document.uploaded",
      "employee_document",
      row.id,
      {
        employeeNumber: employee.employeeNumber,
        documentType,
        originalFilename: fileEntry.name,
        fileSize: stored.fileSize,
      }
    );
    revalidate(employeeId);
    return toSuccess("Document uploaded.");
  } catch (error) {
    return handle(error);
  }
}

export async function deleteEmployeeDocumentAction(
  employeeId: string,
  documentId: string
): Promise<EmployeeSectionActionState> {
  try {
    const user = await requireUser();
    await requirePermission(user.id, PERMISSIONS.EMPLOYEES_DOCUMENT_DELETE);
    const { organizationId, employee } = await requireEmployeeScope(employeeId);

    const owned = await db
      .select({ id: employeeDocuments.id, storageKey: employeeDocuments.storageKey })
      .from(employeeDocuments)
      .where(
        and(
          eq(employeeDocuments.id, documentId),
          eq(employeeDocuments.organizationId, organizationId),
          eq(employeeDocuments.employeeId, employeeId)
        )
      )
      .limit(1);
    if (!owned[0]) forbidden();

    await db.delete(employeeDocuments).where(eq(employeeDocuments.id, documentId));
    await deleteEmployeeDocumentFile(owned[0].storageKey);

    await audit(
      organizationId,
      user.id,
      "employee.document.deleted",
      "employee_document",
      documentId,
      { employeeNumber: employee.employeeNumber }
    );
    revalidate(employeeId);
    return toSuccess("Document deleted.");
  } catch (error) {
    return handle(error);
  }
}

/* ------------------------------------------------------------------ */
/* Employment status toggle (uses employees.delete for deactivation)  */
/* ------------------------------------------------------------------ */

export async function updateEmployeeStatusAction(
  employeeId: string,
  status: "active" | "inactive"
): Promise<EmployeeSectionActionState> {
  try {
    if (status !== "active" && status !== "inactive") {
      throw new ActionError("Invalid employment status.");
    }
    const user = await requireUser();
    await requirePermission(user.id, PERMISSIONS.EMPLOYEES_UPDATE);
    if (status === "inactive") {
      await requirePermission(user.id, PERMISSIONS.EMPLOYEES_DELETE);
    }
    const { organizationId, employee } = await requireEmployeeScope(employeeId);

    const changed = await db.transaction(async (tx) => {
      const rows = await tx
        .select({
          status: employees.employmentStatus,
          position: employees.position,
          department: employees.department,
          division: employees.division,
          managerId: employees.managerId,
          workLocationId: employees.workLocationId,
          employmentType: employees.employmentType,
        })
        .from(employees)
        .where(
          and(
            eq(employees.id, employeeId),
            eq(employees.organizationId, organizationId)
          )
        )
        .limit(1);
      const current = rows[0];
      if (!current) {
        throw new ActionError("The employee no longer exists in your organization.");
      }
      if (current.status === status) return false;
      const effectiveFrom = new Date();
      await tx
        .update(employees)
        .set({ employmentStatus: status, updatedAt: effectiveFrom })
        .where(
          and(
            eq(employees.id, employeeId),
            eq(employees.organizationId, organizationId)
          )
        );
      await tx.insert(employeeEmploymentHistory).values({
        organizationId,
        employeeId,
        position: current.position,
        department: current.department,
        division: current.division,
        managerId: current.managerId,
        workLocationId: current.workLocationId,
        employmentType: current.employmentType,
        employmentStatus: status,
        effectiveFrom,
        notes: `Status changed to ${status}`,
      });
      return true;
    });

    if (changed) {
      await audit(
        organizationId,
        user.id,
        "employee.status_changed",
        "employee",
        employeeId,
        { employeeNumber: employee.employeeNumber, to: status }
      );
    }

    revalidate(employeeId);
    revalidatePath("/employees");
    return toSuccess(status === "active" ? "Employee activated." : "Employee deactivated.");
  } catch (error) {
    return handle(error);
  }
}

/* ------------------------------------------------------------------ */
/* Custom field values                                                */
/* ------------------------------------------------------------------ */

/**
 * Save the employee's custom field values. `formData` carries one entry per
 * active field key (a `key[]` repeated field is treated as multi-select).
 * Every value is validated against the organization's ACTIVE field
 * definitions (types, required-ness, option membership) before any write.
 * Values upsert on the (org, employee, field) unique key.
 */
export async function updateEmployeeCustomDataAction(
  employeeId: string,
  _prevState: EmployeeSectionActionState,
  formData: FormData
): Promise<EmployeeSectionActionState> {
  try {
    const user = await requireUser();
    await requirePermission(user.id, PERMISSIONS.EMPLOYEE_CUSTOM_DATA_VIEW);
    await requirePermission(user.id, PERMISSIONS.EMPLOYEE_CUSTOM_DATA_UPDATE);
    const { organizationId, employee } = await requireEmployeeScope(employeeId);

    const [{ roleCodes }, allDefinitions] = await Promise.all([
      getUserAuthorization(user.id),
      listActiveFieldDefinitions(organizationId),
    ]);
    const definitions = allDefinitions.filter((definition) =>
      isFieldWritableByRoles(
        definition.visibilityConfig,
        definition.editableByConfig,
        roleCodes
      )
    );
    const writableKeys = new Set(definitions.map((definition) => definition.fieldKey));
    const unauthorizedSubmitted = allDefinitions.some(
      (definition) =>
        !writableKeys.has(definition.fieldKey) &&
        (formData.has(definition.fieldKey) ||
          formData.has(`${definition.fieldKey}[]`))
    );
    if (unauthorizedSubmitted) {
      throw new ActionError(
        "You are not authorized to update one or more submitted custom fields."
      );
    }

    const errors: Record<string, string> = {};
    const writes: Array<{
      fieldDefinitionId: string;
      valueText: string | null;
      valueNumber: string | null;
      valueDate: Date | null;
      valueBoolean: boolean | null;
      valueJson: string[] | null;
    }> = [];

    for (const definition of definitions) {
      const fieldKey = definition.fieldKey;
      if (!formData.has(`${fieldKey}__present`)) {
        continue;
      }
      const raw =
        definition.fieldType === "multiselect"
          ? formData
              .getAll(`${fieldKey}[]`)
              .filter((entry): entry is string => typeof entry === "string")
              .join(", ")
          : definition.fieldType === "checkbox"
            ? formData.has(fieldKey)
              ? "true"
              : "false"
            : value(formData, fieldKey);
      const parsed = parseCustomFieldValue(
        definition.fieldType,
        raw,
        definition.options
      );
      if (!parsed.ok) {
        errors[fieldKey] = parsed.error;
        continue;
      }
      if (
        definition.isRequired &&
        parsed.value.valueText === null &&
        parsed.value.valueNumber === null &&
        parsed.value.valueDate === null &&
        parsed.value.valueBoolean === null &&
        parsed.value.valueJson === null
      ) {
        errors[fieldKey] = "This field is required.";
        continue;
      }
      writes.push({
        fieldDefinitionId: definition.id,
        valueText: parsed.value.valueText,
        valueNumber: parsed.value.valueNumber,
        valueDate: parsed.value.valueDate,
        valueBoolean: parsed.value.valueBoolean,
        valueJson: parsed.value.valueJson,
      });
    }

    if (Object.keys(errors).length > 0) {
      return { status: "error", fieldErrors: errors };
    }
    if (writes.length === 0) {
      return toSuccess("Nothing to save.");
    }

    const updatedAt = new Date();
    await db.transaction(async (tx) => {
      const updated = await tx
        .update(employees)
        .set({ updatedAt })
        .where(
          and(
            eq(employees.id, employeeId),
            eq(employees.organizationId, organizationId)
          )
        )
        .returning({ id: employees.id });
      if (updated.length === 0) {
        throw new ActionError("The employee no longer exists in your organization.");
      }
      for (const write of writes) {
        await tx
          .insert(employeeCustomFieldValues)
          .values({
            organizationId,
            employeeId,
            fieldDefinitionId: write.fieldDefinitionId,
            valueText: write.valueText,
            valueNumber: write.valueNumber,
            valueDate: write.valueDate,
            valueBoolean: write.valueBoolean,
            valueJson: write.valueJson,
          })
          .onConflictDoUpdate({
            target: [
              employeeCustomFieldValues.organizationId,
              employeeCustomFieldValues.employeeId,
              employeeCustomFieldValues.fieldDefinitionId,
            ],
            set: {
              valueText: write.valueText,
              valueNumber: write.valueNumber,
              valueDate: write.valueDate,
              valueBoolean: write.valueBoolean,
              valueJson: write.valueJson,
              updatedAt,
            },
          });
      }
    });

    await audit(
      organizationId,
      user.id,
      "employee_custom_data.updated",
      "employee",
      employeeId,
      {
        employeeNumber: employee.employeeNumber,
        fieldsUpdated: writes.length,
      }
    );
    revalidate(employeeId);
    return toSuccess("Custom data saved.");
  } catch (error) {
    return handle(error);
  }
}

export async function deleteEmployeeCustomDataAction(
  employeeId: string,
  fieldKey: string
): Promise<EmployeeSectionActionState> {
  try {
    const user = await requireUser();
    await requirePermission(user.id, PERMISSIONS.EMPLOYEE_CUSTOM_DATA_VIEW);
    await requirePermission(user.id, PERMISSIONS.EMPLOYEE_CUSTOM_DATA_DELETE);
    const { organizationId, employee } = await requireEmployeeScope(employeeId);
    const [{ roleCodes }, definitions] = await Promise.all([
      getUserAuthorization(user.id),
      listActiveFieldDefinitions(organizationId),
    ]);
    const definition = definitions.find((entry) => entry.fieldKey === fieldKey);
    if (
      !definition ||
      !isFieldWritableByRoles(
        definition.visibilityConfig,
        definition.editableByConfig,
        roleCodes
      )
    ) {
      throw new ActionError("The custom field is unavailable or unauthorized.");
    }

    const updatedAt = new Date();
    await db.transaction(async (tx) => {
      const updated = await tx
        .update(employees)
        .set({ updatedAt })
        .where(
          and(
            eq(employees.id, employeeId),
            eq(employees.organizationId, organizationId)
          )
        )
        .returning({ id: employees.id });
      if (updated.length === 0) {
        throw new ActionError("The employee no longer exists in your organization.");
      }
      await tx
        .delete(employeeCustomFieldValues)
        .where(
          and(
            eq(employeeCustomFieldValues.organizationId, organizationId),
            eq(employeeCustomFieldValues.employeeId, employeeId),
            eq(employeeCustomFieldValues.fieldDefinitionId, definition.id)
          )
        );
    });

    await audit(
      organizationId,
      user.id,
      "employee_custom_data.deleted",
      "employee",
      employeeId,
      { employeeNumber: employee.employeeNumber, fieldKey: definition.fieldKey }
    );
    revalidate(employeeId);
    return toSuccess("Custom value cleared.");
  } catch (error) {
    return handle(error);
  }
}