import type {
  employeeAddresses,
  employeeBankAccounts,
  employeeDependents,
  employeeDocuments,
  employeeEducations,
  employeeEmploymentHistory,
  employeeInsurances,
} from "@/db/schema";

export type EmployeeAddress = typeof employeeAddresses.$inferSelect;
export type EmployeeInsuranceRecord = typeof employeeInsurances.$inferSelect;
export type EmployeeBankAccount = typeof employeeBankAccounts.$inferSelect;
export type EmployeeDependent = typeof employeeDependents.$inferSelect;
export type EmployeeEducation = typeof employeeEducations.$inferSelect;
export type EmployeeDocument = typeof employeeDocuments.$inferSelect;
export type EmploymentHistoryRow =
  typeof employeeEmploymentHistory.$inferSelect;
