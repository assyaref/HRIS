import { requireUser } from "@/lib/auth/auth";
import { getEmployeeByUserId } from "@/features/employees/queries";
import { getFaceEnrollmentSummaryInOrganization } from "@/features/employees/face-enrollment.queries";
import { SelfFaceEnrollmentPanel } from "@/features/employees/face-enrollment-self-panel";
import { isFaceRecognitionConfigured } from "@/lib/attendance/face-recognition";

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
      </div>
    );
  }

  const employee = await getEmployeeByUserId(
    user.id,
    user.organizationId
  );

  if (!employee) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-semibold tracking-tight">Face ID</h1>
        <p className="text-sm text-muted-foreground">
          Akun belum terhubung dengan data karyawan.
        </p>
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
