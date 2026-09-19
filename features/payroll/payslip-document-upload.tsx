"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";

import {
  replacePayslipPdfAction,
  uploadPayslipPdfAction,
} from "./payslip-document.actions";
import {
  buildPayslipPdfUploadDecision,
  PAYSLIP_DOCUMENT_REPLACE_REASON_MAX_LENGTH,
  type PayslipDocumentSource,
} from "./payslip-document.guard";

export interface PayslipDocumentUploadDocument {
  originalFilename: string;
  fileSize: number;
  sha256: string;
  version: number;
  source: PayslipDocumentSource;
  createdAt: string | Date;
}

interface PayslipDocumentUploadProps {
  payslipId: string;
  payslipNumber: string;
  /** Current document, when one exists. Absence means "upload" mode. */
  document?: PayslipDocumentUploadDocument | null;
}

function formatFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return "0 KB";
  }

  if (bytes >= 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

export function PayslipDocumentUpload({
  payslipId,
  payslipNumber,
  document = null,
}: PayslipDocumentUploadProps) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);

  const hasDocument = Boolean(document);

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [reason, setReason] = useState("");
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState(false);

  function selectFile() {
    setMessage(null);
    setError(false);
    inputRef.current?.click();
  }

  function handleFileChange(
    event: React.ChangeEvent<HTMLInputElement>,
  ) {
    const file = event.target.files?.[0] ?? null;

    setMessage(null);
    setError(false);
    setSelectedFile(file);

    if (!file) {
      return;
    }

    const decision = buildPayslipPdfUploadDecision({
      mimeType: file.type,
      filename: file.name,
      size: file.size,
    });

    if (!decision.allowed) {
      setSelectedFile(null);
      setError(true);
      setMessage(decision.message);
      event.target.value = "";
      return;
    }
  }

  function submit() {
    setMessage(null);
    setError(false);

    if (!selectedFile) {
      setError(true);
      setMessage("Please select a PDF payslip.");
      return;
    }

    const trimmedReason = reason.trim();

    if (hasDocument) {
      if (trimmedReason.length === 0) {
        setError(true);
        setMessage("A reason for replacing the payslip PDF is required.");
        return;
      }

      if (trimmedReason.length > PAYSLIP_DOCUMENT_REPLACE_REASON_MAX_LENGTH) {
        setError(true);
        setMessage(
          `The replacement reason must not exceed ${PAYSLIP_DOCUMENT_REPLACE_REASON_MAX_LENGTH} characters.`,
        );
        return;
      }
    }

    const formData = new FormData();
    formData.set("payslipId", payslipId);
    formData.set("file", selectedFile);

    if (hasDocument) {
      formData.set("reason", trimmedReason);
    }

    startTransition(async () => {
      const result = hasDocument
        ? await replacePayslipPdfAction(formData)
        : await uploadPayslipPdfAction(formData);

      setError(!result.ok);
      setMessage(result.message);

      if (result.ok) {
        setSelectedFile(null);
        setReason("");

        if (inputRef.current) {
          inputRef.current.value = "";
        }

        router.refresh();
      }
    });
  }

  return (
    <div className="flex min-w-[220px] flex-col items-end gap-2">
      {hasDocument && document ? (
        <div className="w-full max-w-xs rounded-lg border border-slate-200 bg-slate-50/70 px-3 py-2 text-left">
          <p className="truncate text-xs font-semibold text-slate-800">
            {document.originalFilename}
          </p>
          <p className="mt-0.5 text-[11px] text-slate-500">
            v{document.version} · {document.source} ·{" "}
            {formatFileSize(document.fileSize)}
          </p>
        </div>
      ) : null}

      <input
        ref={inputRef}
        type="file"
        accept="application/pdf,.pdf"
        className="sr-only"
        disabled={pending}
        aria-label={`Select PDF for ${payslipNumber}`}
        onChange={handleFileChange}
      />

      {hasDocument ? (
        <label className="w-full max-w-xs text-left">
          <span className="text-[11px] font-medium text-slate-600">
            Reason for replacement
          </span>
          <textarea
            value={reason}
            disabled={pending}
            maxLength={PAYSLIP_DOCUMENT_REPLACE_REASON_MAX_LENGTH}
            rows={2}
            onChange={(event) => setReason(event.target.value)}
            className="mt-1 w-full resize-none rounded-md border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-800 outline-none focus:border-[#1687F8] focus:ring-1 focus:ring-[#1687F8]/30"
            aria-label={`Reason for replacing ${payslipNumber}`}
          />
        </label>
      ) : null}

      <div className="flex flex-wrap justify-end gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={pending}
          onClick={selectFile}
        >
          {selectedFile ? "Change PDF" : "Choose PDF"}
        </Button>

        {selectedFile ? (
          <Button
            type="button"
            size="sm"
            disabled={pending}
            onClick={submit}
          >
            {pending
              ? hasDocument
                ? "Replacing…"
                : "Uploading…"
              : hasDocument
                ? "Replace PDF"
                : "Upload PDF"}
          </Button>
        ) : null}
      </div>

      {selectedFile ? (
        <p className="max-w-xs truncate text-right text-xs text-muted-foreground">
          {selectedFile.name}
        </p>
      ) : null}

      {message ? (
        <p
          role={error ? "alert" : "status"}
          className={
            error
              ? "max-w-xs text-right text-xs text-destructive"
              : "max-w-xs text-right text-xs text-emerald-600 dark:text-emerald-400"
          }
        >
          {message}
        </p>
      ) : null}
    </div>
  );
}
