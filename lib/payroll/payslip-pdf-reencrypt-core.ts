import { createHash, randomBytes, randomUUID } from "node:crypto";
import {
  mkdir,
  readFile,
  rm,
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

function sha256(buffer: Buffer): string {
  return createHash("sha256").update(buffer).digest("hex");
}

function assertPdfMagic(buffer: Buffer): void {
  if (buffer.length < PDF_MAGIC.length) {
    throw new Error("Berkas yang diunggah bukan PDF yang valid.");
  }

  if (!buffer.subarray(0, PDF_MAGIC.length).equals(PDF_MAGIC)) {
    throw new Error("Berkas yang diunggah bukan PDF yang valid.");
  }
}

function assertPdfSize(size: number): void {
  if (size <= 0) {
    throw new Error("Berkas PDF kosong.");
  }

  if (size > MAX_PDF_SIZE_BYTES) {
    throw new Error("Berkas PDF melebihi ukuran maksimal.");
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
      "Nomor karyawan wajib ada sebelum PDF slip gaji dapat diproses."
    );
  }

  if (
    !(identity.birthDate instanceof Date) ||
    Number.isNaN(identity.birthDate.getTime())
  ) {
    throw new Error(
      "Tanggal lahir karyawan diperlukan sebelum PDF slip gaji dapat diproses."
    );
  }
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
      error instanceof Error ? error.message : "Ghostscript gagal.";

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
    throw new Error("Ghostscript tidak menghasilkan PDF terenkripsi.");
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
      throw new Error("Verifikasi kata sandi PDF yang dibuat gagal.");
    }
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === "Generated PDF password verification failed."
    ) {
      throw error;
    }

    throw new Error("Verifikasi kata sandi PDF yang dibuat gagal.");
  }
}

export async function reencryptPayslipPdfCore(input: {
  encryptedPdf: Buffer;
  identity: PayslipPdfIdentity;
}): Promise<{
  encryptedPdf: Buffer;
  fileSize: number;
  sha256: string;
  mimeType: "application/pdf";
}> {
  assertPdfSize(input.encryptedPdf.length);
  assertPdfMagic(input.encryptedPdf);
  assertIdentity(input.identity);

  if (!input.identity.nik) {
    throw new Error(
      "NIK karyawan diperlukan untuk membuka PDF yang dibuat dengan format lama."
    );
  }

  const tempDir = path.join(
    PRIVATE_ROOT,
    `.reencrypt-${randomUUID()}`
  );

  const sourcePath = path.join(
    tempDir,
    "source-encrypted.pdf"
  );
  const plaintextPath = path.join(
    tempDir,
    "plaintext.pdf"
  );
  const encryptedPath = path.join(
    tempDir,
    "encrypted-v2.pdf"
  );

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
