import type { Metadata } from "next";
import { forbidden } from "next/navigation";

import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { requireUser } from "@/lib/auth/auth";
import { isFaceRecognitionConfigured } from "@/lib/attendance/face-recognition";

import {
  FACE_SELF_ENROLLMENT_UNLINKED_MESSAGE,
} from "@/features/employees/face-enrollment";
import {
  getFaceEnrollmentSummaryInOrganization,
} from "@/features/employees/face-enrollment.queries";
import {
  SelfFaceEnrollmentPanel,
} from "@/features/employees/face-enrollment-self-panel";
import { getEmployeeByUserId } from "@/features/employees/queries";

export const metadata: Metadata = {
  title: "Face ID",
};

/**
 * Employee SELF-SERVICE face enrollment page (Phase 10.7C-50D).
 *
 * The employee is resolved exclusively from the authenticated session
 * (user.id → linked employee in the user's own organization); the browser
 * never selects or supplies an employee. A missing organization fails closed
 * and a missing linked employee shows a safe Indonesian message. Enrollment
 * decisions all happen in the self-service server action.
 */
export default async function FaceIdPage() {
  const user = await requireUser();
  if (!user.organizationId) forbidden();
  const organizationId = user.organizationId;

  const employee = await getEmployeeByUserId(user.id, organizationId);
  if (!employee) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
          Face ID
        </h1>
        <EmptyState
          title="Belum ada data karyawan"
          description={FACE_SELF_ENROLLMENT_UNLINKED_MESSAGE}
        />
      </div>
    );
  }

  const summary = await getFaceEnrollmentSummaryInOrganization(
    organizationId,
    employee.id
  );
  const engineConfigured = isFaceRecognitionConfigured();
  const displayName = `${employee.firstName} ${employee.lastName}`;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
          Face ID
        </h1>
        <p className="mt-1 text-sm text-muted-foreground sm:text-base">
          Pendaftaran data wajah Anda untuk verifikasi identitas ({displayName}).
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Face Recognition</CardTitle>
          <CardDescription>
            Daftarkan wajah Anda sekali. Foto tidak disimpan dalam bentuk asli.
          </CardDescription>
        </CardHeader>
        <SelfFaceEnrollmentPanel
          employeeName={displayName}
          status={summary.status}
          employeeActive={employee.employmentStatus === "active"}
          engineConfigured={engineConfigured}
        />
      </Card>
    </div>
  );
}