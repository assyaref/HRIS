import "server-only";

import { createModuleReadiness } from "@/lib/db/module-readiness";

export const DOCUMENTS_MIGRATION = "0027_documents";
export const DOCUMENTS_GUIDE = "docs/documents.md";

/** Whether migration 0027 (letter numbering / PKWT) has been applied. */
export const isDocumentsModuleReady = createModuleReadiness(["document_types", "issued_documents"]);

export const TEMPLATES_MIGRATION = "0028_letter_templates";

/** Whether migration 0028 (letter templates) has been applied. */
export const isLetterTemplatesReady = createModuleReadiness(["letter_templates"]);
