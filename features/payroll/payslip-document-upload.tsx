"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";

import { uploadPayslipPdfAction } from "./payslip-document.actions";

interface PayslipDocumentUploadProps {
  payslipId: string;
  payslipNumber: string;
}

export function PayslipDocumentUpload({
  payslipId,
  payslipNumber,
}: PayslipDocumentUploadProps) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
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

    if (file.type && file.type !== "application/pdf") {
      setSelectedFile(null);
      setError(true);
      setMessage("Only PDF files are allowed.");
      event.target.value = "";
      return;
    }

    if (file.size > 20 * 1024 * 1024) {
      setSelectedFile(null);
      setError(true);
      setMessage("The payslip PDF must not exceed 20 MB.");
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

    const formData = new FormData();
    formData.set("payslipId", payslipId);
    formData.set("file", selectedFile);

    startTransition(async () => {
      const result = await uploadPayslipPdfAction(formData);

      setError(!result.ok);
      setMessage(result.message);

      if (result.ok) {
        setSelectedFile(null);

        if (inputRef.current) {
          inputRef.current.value = "";
        }

        router.refresh();
      }
    });
  }

  return (
    <div className="flex min-w-[220px] flex-col items-end gap-2">
      <input
        ref={inputRef}
        type="file"
        accept="application/pdf,.pdf"
        className="sr-only"
        disabled={pending}
        aria-label={`Select PDF for ${payslipNumber}`}
        onChange={handleFileChange}
      />

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
            {pending ? "Uploading…" : "Upload PDF"}
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
