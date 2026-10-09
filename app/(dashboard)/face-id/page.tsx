import { requireUser } from "@/lib/auth/auth";
import { getEmployeeByUserId } from "@/features/employees/queries";
import {
  FACE_SELF_ENROLLMENT_UNLINKED_MESSAGE,
} from "@/features/employees/face-enrollment";
import { getFaceEnrollmentSummaryInOrganization } from "@/features/employees/face-enrollment.queries";
import { SelfFaceEnrollmentPanel } from "@/features/employees/face-enrollment-self-panel";
import { isFaceRecognitionConfigured } from "@/lib/attendance/face-recognition";

/**
 * Guidance shared by the "no organization" and "no linked employee" states so
 * the page never dead-ends: the mapping is an administrator action, so the
 * employee is told exactly who can fix it.
 */
const UNLINKED_GUIDANCE =
  "Akun perlu ditautkan ke data karyawan oleh administrator sebelum Face ID dapat digunakan. Hubungi administrator atau HR Anda.";

export const dynamic = "force-dynamic";

export default async function FaceIdPage() {
  const user = await requireUser();

  if (!user.organizationId) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-semibold tracking-tight">Face ID</h1>
        <p className="text-sm text-muted-foreground">
          Akun belum memiliki organisasi.
        </p>
        <p className="text-sm text-muted-foreground">{UNLINKED_GUIDANCE}</p>
      </div>
    );
  }

  const organizationId = user.organizationId;

  const employee = await getEmployeeByUserId(user.id, organizationId);

  if (!employee) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-semibold tracking-tight">Face ID</h1>
        <p className="text-sm text-muted-foreground">
          {FACE_SELF_ENROLLMENT_UNLINKED_MESSAGE}
        </p>
        <p className="text-sm text-muted-foreground">{UNLINKED_GUIDANCE}</p>
      </div>
    );
  }

  const faceEnrollmentSummary =
    await getFaceEnrollmentSummaryInOrganization(
      employee.organizationId,
      employee.id
    );

  const faceEngineConfigured = isFaceRecognitionConfigured();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Face ID</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Pendaftaran wajah untuk absensi.
        </p>
      </div>

      <SelfFaceEnrollmentPanel
        employeeName={`${employee.firstName} ${employee.lastName}`.trim()}
        status={faceEnrollmentSummary.status}
        employeeActive={employee.employmentStatus === "active"}
        engineConfigured={faceEngineConfigured}
      />
    </div>
  );
}
