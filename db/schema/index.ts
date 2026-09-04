/**
 * Database schema barrel.
 *
 * Each module owns a focused slice of the HRIS domain. Importing this module
 * is safe anywhere; the connection layer (`db/index.ts`) is `server-only`.
 */
export * from "./organizations";
export * from "./users";
export * from "./employees";
export * from "./projects";
export * from "./locations";
export * from "./assignments";
export * from "./attendance";
export * from "./leave";
export * from "./permission_requests";
export * from "./payroll";
export * from "./roles";
export * from "./permissions";
export * from "./role_permissions";
export * from "./user_roles";
export * from "./sessions";
export * from "./audit";
