import "server-only";

import { createHash, randomBytes, randomUUID } from "node:crypto";
import {
  access,
  mkdir,
  readFile,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

import {
  buildPayslipPassword,
  buildPayslipPasswordV1,
} from "./payslip-pdf-password.ts";

const execFileAsync = promisify(execFile);

const PRIVATE_ROOT = "/opt/hris-private/payslips";
const MAX_PDF_SIZE_BYTES = 20 * 1024 * 1024;

const PDF_MAGIC = Buffer.from("%PDF-");

const GS_TIMEOUT_MS = 60_000;

export interface PayslipPdfIdentity {
  /**
   * Legacy NIK, required only to decrypt PDFs encrypted under the pre-employee
   * number password contracts. Never used to build a current password.
   */
  nik: string | null;
  /** Employee number — the base of the current password contract. */
  employeeNumber: string | null;
  birthDate: Date | null;
}

export interface PayslipPdfMetadata {
  storageKey: string;
  fileSize: number;
  sha256: string;
  mimeType: "application/pdf";
}

export interface PayslipPdfValidation {
  fileSize: number;
  sha256: string;
}

function assertPdfMagic(buffer: Buffer): void {
  if (buffer.length < PDF_MAGIC.length) {
    throw new Error("Uploaded file is not a valid PDF.");
  }

  if (!buffer.subarray(0, PDF_MAGIC.length).equals(PDF_MAGIC)) {
    throw new Error("Uploaded file is not a valid PDF.");
  }
}

function assertPdfSize(size: number): void {
  if (!Number.isInteger(size) || size <= 0) {
    throw new Error("PDF file is empty.");
  }

  if (size > MAX_PDF_SIZE_BYTES) {
    throw new Error("PDF file exceeds the 20 MB limit.");
  }
}

function assertIdentity(
  identity: PayslipPdfIdentity
): asserts identity is {
  nik: string | null;
  employeeNumber: string;
  birthDate: Date;
} {
  if (!identity.employeeNumber) {
    throw new Error(
      "Employee number is required before a payslip PDF can be published."
    );
  }

  if (!identity.birthDate) {
    throw new Error(
      "Employee birth date is required before a payslip PDF can be published."
    );
  }

  if (Number.isNaN(identity.birthDate.getTime())) {
    throw new Error("Employee birth date is invalid.");
  }
}

function assertLegacyIdentity(
  identity: PayslipPdfIdentity
): asserts identity is PayslipPdfIdentity & { nik: string } {
  if (!identity.nik) {
    throw new Error(
      "Employee NIK is required to decrypt a PDF created under the legacy contract."
    );
  }
}

function sha256(buffer: Buffer): string {
  return createHash("sha256").update(buffer).digest("hex");
}

async function runGhostscript(args: string[]): Promise<void> {
  try {
    await execFileAsync("gs", args, {
      timeout: GS_TIMEOUT_MS,
      maxBuffer: 1024 * 1024,
      windowsHide: true,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Ghostscript failed.";

    throw new Error(`PDF processing failed: ${message}`);
  }
}

async function validatePdfWithGhostscript(
  inputPath: string
): Promise<void> {
  await runGhostscript([
    "-q",
    "-dSAFER",
    "-dBATCH",
    "-dNOPAUSE",
    "-sDEVICE=nullpage",
    inputPath,
  ]);
}

function assertEncryptedPdf(buffer: Buffer): void {
  const content = buffer.toString("latin1");

  if (
    !content.includes("/Encrypt") ||
    !content.includes("/Filter /Standard")
  ) {
    throw new Error("Ghostscript did not produce an encrypted PDF.");
  }
}

function buildStorageKey(): string {
  return `${randomUUID()}.pdf`;
}

function resolveStoragePath(storageKey: string): string {
  const normalized = storageKey.replaceAll("\\", "/");

  if (!/^[0-9a-f-]{36}\.pdf$/i.test(normalized)) {
    throw new Error("Invalid payslip storage key.");
  }

  const resolved = path.resolve(PRIVATE_ROOT, normalized);

  if (
    resolved !== PRIVATE_ROOT &&
    !resolved.startsWith(`${PRIVATE_ROOT}${path.sep}`)
  ) {
    throw new Error("Invalid payslip storage path.");
  }

  return resolved;
}

/**
 * Validates an uploaded PDF without persisting it as a payslip.
 */
export async function validatePayslipPdf(
  input: Buffer
): Promise<PayslipPdfValidation> {
  assertPdfSize(input.length);
  assertPdfMagic(input);

  const tempDir = path.join(
    PRIVATE_ROOT,
    `.validation-${randomUUID()}`
  );
  const inputPath = path.join(tempDir, "input.pdf");

  await mkdir(tempDir, {
    recursive: true,
    mode: 0o700,
  });

  try {
    await writeFile(inputPath, input, {
      mode: 0o600,
    });

    await validatePdfWithGhostscript(inputPath);

    return {
      fileSize: input.length,
      sha256: sha256(input),
    };
  } finally {
    await rm(tempDir, {
      recursive: true,
      force: true,
    });
  }
}

/**
 * Renders server-authored payslip PostScript into a plaintext PDF buffer.
 *
 * Ghostscript only ever touches a server-created temporary workspace owned by
 * this function; the caller's PostScript is treated as untrusted-by-assumption
 * and is written with restrictive permissions inside a private directory
 * (never a shared temp path). The returned buffer is plaintext and must only
 * be consumed by the encryption pipeline or cleared immediately.
 */
export async function renderPostScriptToPdf(
  postScript: string
): Promise<Buffer> {
  const tempDir = path.join(
    PRIVATE_ROOT,
    `.render-${randomUUID()}`
  );
  const inputPath = path.join(tempDir, "input.ps");
  const outputPath = path.join(tempDir, "output.pdf");

  await mkdir(tempDir, {
    recursive: true,
    mode: 0o700,
  });

  try {
    await writeFile(inputPath, postScript, {
      mode: 0o600,
    });

    await runGhostscript([
      "-q",
      "-dSAFER",
      "-dBATCH",
      "-dNOPAUSE",
      "-sDEVICE=pdfwrite",
      `-sOutputFile=${outputPath}`,
      inputPath,
    ]);

    const pdfBuffer = await readFile(outputPath);

    assertPdfSize(pdfBuffer.length);
    assertPdfMagic(pdfBuffer);

    return pdfBuffer;
  } finally {
    await rm(tempDir, {
      recursive: true,
      force: true,
    });
  }
}

/**
 * Encrypts and atomically stores a payslip PDF.
 *
 * The plaintext PDF only exists in the temporary workspace.
 * The final storage contains only the encrypted PDF.
 *
 * The generated password is intentionally not part of the return value.
 */
export async function encryptAndStorePayslipPdf(input: {
  pdf: Buffer;
  identity: PayslipPdfIdentity;
}): Promise<PayslipPdfMetadata> {
  assertPdfSize(input.pdf.length);
  assertPdfMagic(input.pdf);
  assertIdentity(input.identity);

  const tempDir = path.join(
    PRIVATE_ROOT,
    `.upload-${randomUUID()}`
  );

  const sourcePath = path.join(tempDir, "source.pdf");
  const encryptedPath = path.join(tempDir, "encrypted.pdf");

  await mkdir(tempDir, {
    recursive: true,
    mode: 0o700,
  });

  try {
    await writeFile(sourcePath, input.pdf, {
      mode: 0o600,
    });

    // Reject malformed PDFs and password-protected input PDFs before
    // encryption. The uploaded PDF must be readable without a password.
    await validatePdfWithGhostscript(sourcePath);

    const password = buildPayslipPassword(
      input.identity.employeeNumber,
      input.identity.birthDate
    );

    // Owner password is random and independent from the employee password.
    // Neither password is returned, persisted, logged, or audited.
    const ownerPassword = randomBytes(32).toString("hex");

    await runGhostscript([
      "-q",
      "-dSAFER",
      "-dBATCH",
      "-dNOPAUSE",
      "-sDEVICE=pdfwrite",
      `-sOutputFile=${encryptedPath}`,
      `-sOwnerPassword=${ownerPassword}`,
      `-sUserPassword=${password}`,
      "-dEncryptionR=3",
      "-dKeyLength=128",
      sourcePath,
    ]);

    const encryptedBuffer = await readFile(encryptedPath);

    assertPdfSize(encryptedBuffer.length);
    assertPdfMagic(encryptedBuffer);
    assertEncryptedPdf(encryptedBuffer);

    // Validate that Ghostscript can process the encrypted PDF with the
    // generated user password. Ghostscript may return exit code 0 even when
    // reporting an authentication error, so this is supplemented by checking
    // its diagnostic output separately below.
    await verifyEncryptedPdfPassword(
      encryptedPath,
      password
    );

    const finalStorageKey = buildStorageKey();
    const finalPath = resolveStoragePath(finalStorageKey);

    await mkdir(PRIVATE_ROOT, {
      recursive: true,
      mode: 0o700,
    });

    // Atomic move from the same filesystem.
    await rename(encryptedPath, finalPath);

    const finalStat = await stat(finalPath);

    if (finalStat.size <= 0) {
      throw new Error("Stored payslip PDF is empty.");
    }

    return {
      storageKey: finalStorageKey,
      fileSize: finalStat.size,
      sha256: sha256(encryptedBuffer),
      mimeType: "application/pdf",
    };
  } finally {
    await rm(tempDir, {
      recursive: true,
      force: true,
    });
  }
}

async function verifyEncryptedPdfPassword(
  encryptedPath: string,
  password: string
): Promise<void> {
  try {
    const result = await execFileAsync(
      "gs",
      [
        "-q",
        "-dBATCH",
        "-dNOPAUSE",
        `-sPDFPassword=${password}`,
        "-sDEVICE=nullpage",
        encryptedPath,
      ],
      {
        timeout: GS_TIMEOUT_MS,
        maxBuffer: 1024 * 1024,
        windowsHide: true,
      }
    );

    const combinedOutput =
      `${result.stdout ?? ""}\n${result.stderr ?? ""}`.toLowerCase();

    if (
      combinedOutput.includes("password did not work") ||
      combinedOutput.includes("cannot decrypt pdf") ||
      combinedOutput.includes("requires a password")
    ) {
      throw new Error("Generated PDF password verification failed.");
    }
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === "Generated PDF password verification failed."
    ) {
      throw error;
    }

    throw new Error("Generated PDF password verification failed.");
  }
}

/**
 * Re-encrypts an existing stored payslip PDF from the legacy password
 * contract V1 (NIK + DD + YYYY) to the current password contract V2
 * (employee number + DD + MM + YYYY).
 *
 * Security contract:
 * - Existing storageKey is preserved.
 * - Existing production file is never modified by this function.
 * - Plaintext exists only inside a private temporary workspace.
 * - The old password is used only to decrypt the source PDF.
 * - The new password is used only to encrypt the replacement PDF.
 * - Neither password is persisted, logged, returned, or audited.
 *
 * This function intentionally returns the newly encrypted PDF buffer and
 * metadata rather than replacing a production file. Production replacement
 * must be performed by a higher-level transactional workflow.
 */
export async function reencryptPayslipPdf(
  input: {
    encryptedPdf: Buffer;
    identity: PayslipPdfIdentity;
  }
): Promise<{
  encryptedPdf: Buffer;
  fileSize: number;
  sha256: string;
  mimeType: "application/pdf";
}> {
  assertPdfSize(input.encryptedPdf.length);
  assertPdfMagic(input.encryptedPdf);
  assertIdentity(input.identity);
  assertLegacyIdentity(input.identity);

  const tempDir = path.join(
    PRIVATE_ROOT,
    `.reencrypt-${randomUUID()}`
  );

  const sourcePath = path.join(tempDir, "source-encrypted.pdf");
  const plaintextPath = path.join(tempDir, "plaintext.pdf");
  const encryptedPath = path.join(tempDir, "encrypted-v2.pdf");

  await mkdir(tempDir, {
    recursive: true,
    mode: 0o700,
  });

  try {
    await writeFile(sourcePath, input.encryptedPdf, {
      mode: 0o600,
    });

    const oldPassword = buildPayslipPasswordV1(
      input.identity.nik,
      input.identity.birthDate
    );

    const newPassword = buildPayslipPassword(
      input.identity.employeeNumber,
      input.identity.birthDate
    );

    await runGhostscript([
      "-q",
      "-dSAFER",
      "-dBATCH",
      "-dNOPAUSE",
      "-sDEVICE=pdfwrite",
      `-sPDFPassword=${oldPassword}`,
      `-sOutputFile=${plaintextPath}`,
      sourcePath,
    ]);

    const plaintextBuffer = await readFile(plaintextPath);

    assertPdfSize(plaintextBuffer.length);
    assertPdfMagic(plaintextBuffer);

    await validatePdfWithGhostscript(plaintextPath);

    const ownerPassword = randomBytes(32).toString("hex");

    await runGhostscript([
      "-q",
      "-dSAFER",
      "-dBATCH",
      "-dNOPAUSE",
      "-sDEVICE=pdfwrite",
      `-sOutputFile=${encryptedPath}`,
      `-sOwnerPassword=${ownerPassword}`,
      `-sUserPassword=${newPassword}`,
      "-dEncryptionR=3",
      "-dKeyLength=128",
      plaintextPath,
    ]);

    const encryptedBuffer = await readFile(encryptedPath);

    assertPdfSize(encryptedBuffer.length);
    assertPdfMagic(encryptedBuffer);
    assertEncryptedPdf(encryptedBuffer);

    await verifyEncryptedPdfPassword(
      encryptedPath,
      newPassword
    );

    return {
      encryptedPdf: encryptedBuffer,
      fileSize: encryptedBuffer.length,
      sha256: sha256(encryptedBuffer),
      mimeType: "application/pdf",
    };
  } finally {
    await rm(tempDir, {
      recursive: true,
      force: true,
    });
  }
}

/**
 * Reads a stored payslip PDF after validating its server-generated key.
 */
export async function readStoredPayslipPdf(
  storageKey: string
): Promise<Buffer> {
  const filePath = resolveStoragePath(storageKey);

  await access(filePath);

  return readFile(filePath);
}

/**
 * Removes a stored payslip PDF after a database operation fails.
 */
export async function removeStoredPayslipPdf(
  storageKey: string
): Promise<void> {
  const filePath = resolveStoragePath(storageKey);

  await rm(filePath, {
    force: true,
  });
}
