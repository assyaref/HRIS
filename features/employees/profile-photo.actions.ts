"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { db } from "@/db";
import { employees } from "@/db/schema";
import { requireUser } from "@/lib/auth/auth";
import { writeAuditLog } from "@/lib/auth/audit";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { hasPermission } from "@/lib/auth/rbac";
import { isFaceRecognitionConfigured } from "@/lib/attendance/face-recognition";
import {
  deleteEmployeeProfilePhoto,
  hasJpegMagic,
  PROFILE_PHOTO_MAX_BYTES,
  profilePhotoUrlFor,
  readEmployeeProfilePhoto,
  storeEmployeeProfilePhoto,
} from "@/lib/employees/profile-photo-storage";

import { enrollFaceFromImage } from "./face-enrollment.persist";
import { evaluateFaceEnrollmentConsent } from "./face-enrollment";
import { getFaceEnrollmentSummaryInOrganization } from "./face-enrollment.queries";
import { getEmployeeByUserId, getEmployeeInOrganization } from "./queries";

/**
 * Employee profile photo — server actions.
 *
 * Two callers share these actions:
 *  - MANAGEMENT passes `employeeId` and needs `employees.update` in the acting
 *    organization (the employee is resolved org-scoped, never trusted).
 *  - SELF-SERVICE omits `employeeId`; the employee is the caller's own linked
 *    record. A browser cannot steer self-service at another employee.
 *
 * The stored JPEG is the Face ID reference: on upload the caller may opt in
 * (consent + checkbox) to enrol the face from the same picture, and an
 * existing profile photo can enrol Face ID later without a camera session.
 */

export interface ProfilePhotoActionResult {
  ok: boolean;
  message: string;
}

interface ResolvedEmployee {
  id: string;
  organizationId: string;
  employeeNumber: string;
  employmentStatus: string;
  firstName: string;
  lastName: string;
}

async function resolveTarget(
  employeeIdRaw: FormDataEntryValue | string | null
): Promise<
  | { ok: true; actorUserId: string; employee: ResolvedEmployee; self: boolean }
  | { ok: false; message: string }
> {
  const user = await requireUser();
  if (!user.organizationId) {
    return { ok: false, message: "Akun Anda tidak terhubung ke organisasi mana pun." };
  }
  const organizationId = user.organizationId;
  const employeeId =
    typeof employeeIdRaw === "string" && employeeIdRaw.trim() !== ""
      ? employeeIdRaw.trim()
      : null;

  if (employeeId) {
    if (!(await hasPermission(user.id, PERMISSIONS.EMPLOYEES_UPDATE))) {
      return { ok: false, message: "Anda tidak berwenang mengubah foto karyawan." };
    }
    const employee = await getEmployeeInOrganization(employeeId, organizationId);
    if (!employee) return { ok: false, message: "Karyawan tidak ditemukan." };
    return {
      ok: true,
      actorUserId: user.id,
      self: employee.userId === user.id,
      employee: {
        id: employee.id,
        organizationId,
        employeeNumber: employee.employeeNumber,
        employmentStatus: employee.employmentStatus,
        firstName: employee.firstName,
        lastName: employee.lastName,
      },
    };
  }

  const linked = await getEmployeeByUserId(user.id, organizationId);
  if (!linked) {
    return {
      ok: false,
      message: "Akun Anda belum ditautkan ke data karyawan. Hubungi administrator.",
    };
  }
  return {
    ok: true,
    actorUserId: user.id,
    self: true,
    employee: {
      id: linked.id,
      organizationId,
      employeeNumber: linked.employeeNumber,
      employmentStatus: linked.employmentStatus,
      firstName: linked.firstName,
      lastName: linked.lastName,
    },
  };
}

function revalidate(employeeId: string): void {
  revalidatePath(`/employees/${employeeId}`);
  revalidatePath("/employees");
  revalidatePath("/settings/account");
  revalidatePath("/face-id");
  revalidatePath("/", "layout");
}

async function setPhotoUrl(employee: ResolvedEmployee, url: string | null) {
  await db
    .update(employees)
    .set({ profilePhotoUrl: url })
    .where(
      and(
        eq(employees.id, employee.id),
        eq(employees.organizationId, employee.organizationId)
      )
    );
}

/**
 * Upload (replace) the profile photo. Form fields: `employeeId?`, `image`
 * (JPEG ≤ 900 KB — the browser re-encodes any picture to JPEG first),
 * `enrollFace` ("true" to also enrol Face ID), `consent` ("true").
 */
export async function uploadEmployeeProfilePhotoAction(
  _prevState: ProfilePhotoActionResult | undefined,
  formData: FormData
): Promise<ProfilePhotoActionResult> {
  const target = await resolveTarget(formData.get("employeeId"));
  if (!target.ok) return { ok: false, message: target.message };
  const { employee, actorUserId } = target;

  const imageFile = formData.get("image");
  if (!imageFile || typeof imageFile !== "object" || !("arrayBuffer" in imageFile)) {
    return { ok: false, message: "Pilih foto terlebih dahulu." };
  }
  const file = imageFile as File;
  if (file.size <= 0) return { ok: false, message: "Berkas foto kosong." };
  if (file.size > PROFILE_PHOTO_MAX_BYTES) {
    return { ok: false, message: "Ukuran foto maksimal 900 KB." };
  }
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (!hasJpegMagic(bytes)) {
    return { ok: false, message: "Foto harus berformat JPEG." };
  }

  try {
    await storeEmployeeProfilePhoto({
      organizationId: employee.organizationId,
      employeeId: employee.id,
      bytes,
    });
    await setPhotoUrl(employee, profilePhotoUrlFor(employee.id, Date.now()));
  } catch (error) {
    console.error("[employees] profile photo store failed", error);
    return { ok: false, message: "Foto tidak dapat disimpan. Coba lagi." };
  }

  try {
    await writeAuditLog({
      organizationId: employee.organizationId,
      actorUserId,
      action: "employee.photo.updated",
      entityType: "employee",
      entityId: employee.id,
      metadata: { employeeNumber: employee.employeeNumber, size: file.size, self: target.self },
    });
  } catch {
    // Audit is best-effort.
  }

  let message = "Foto profil disimpan.";
  if (formData.get("enrollFace") === "true") {
    const consent = evaluateFaceEnrollmentConsent(formData.get("consent") === "true");
    if (!consent.ok) {
      message = `Foto profil disimpan. Face ID tidak didaftarkan: ${consent.message}`;
    } else if (!isFaceRecognitionConfigured()) {
      message =
        "Foto profil disimpan. Mesin pengenalan wajah belum dikonfigurasi, Face ID belum didaftarkan.";
    } else {
      const summary = await getFaceEnrollmentSummaryInOrganization(
        employee.organizationId,
        employee.id
      );
      const enrolled = await enrollFaceFromImage({
        organizationId: employee.organizationId,
        employee,
        actorUserId,
        imageBuffer: Buffer.from(bytes),
        allowReplacement: summary.hasActive,
      });
      message = enrolled.ok
        ? `Foto profil disimpan. ${enrolled.message}`
        : `Foto profil disimpan. Face ID tidak didaftarkan: ${enrolled.message}`;
    }
  }

  revalidate(employee.id);
  return { ok: true, message };
}

/** Remove the profile photo (the Face ID enrollment, if any, is untouched). */
export async function removeEmployeeProfilePhotoAction(
  employeeId: string | null
): Promise<ProfilePhotoActionResult> {
  const target = await resolveTarget(employeeId);
  if (!target.ok) return { ok: false, message: target.message };
  const { employee, actorUserId } = target;
  try {
    await deleteEmployeeProfilePhoto(employee.organizationId, employee.id);
    await setPhotoUrl(employee, null);
  } catch (error) {
    console.error("[employees] profile photo remove failed", error);
    return { ok: false, message: "Foto tidak dapat dihapus. Coba lagi." };
  }
  try {
    await writeAuditLog({
      organizationId: employee.organizationId,
      actorUserId,
      action: "employee.photo.removed",
      entityType: "employee",
      entityId: employee.id,
      metadata: { employeeNumber: employee.employeeNumber, self: target.self },
    });
  } catch {
    // Audit is best-effort.
  }
  revalidate(employee.id);
  return { ok: true, message: "Foto profil dihapus." };
}

/** Enrol (or refresh) Face ID from the stored profile photo — no camera needed. */
export async function enrollFaceFromProfilePhotoAction(
  employeeId: string | null,
  consent: boolean
): Promise<ProfilePhotoActionResult> {
  const target = await resolveTarget(employeeId);
  if (!target.ok) return { ok: false, message: target.message };
  const { employee, actorUserId } = target;

  const consentDecision = evaluateFaceEnrollmentConsent(consent);
  if (!consentDecision.ok) return { ok: false, message: consentDecision.message };
  if (!isFaceRecognitionConfigured()) {
    return {
      ok: false,
      message: "Mesin pengenalan wajah belum dikonfigurasi pada aplikasi ini.",
    };
  }

  const photo = await readEmployeeProfilePhoto(employee.organizationId, employee.id);
  if (!photo) {
    return { ok: false, message: "Belum ada foto profil. Unggah foto terlebih dahulu." };
  }
  const summary = await getFaceEnrollmentSummaryInOrganization(
    employee.organizationId,
    employee.id
  );
  const result = await enrollFaceFromImage({
    organizationId: employee.organizationId,
    employee,
    actorUserId,
    imageBuffer: photo.bytes,
    allowReplacement: summary.hasActive,
  });
  if (result.ok) revalidate(employee.id);
  return { ok: result.ok, message: result.message };
}
