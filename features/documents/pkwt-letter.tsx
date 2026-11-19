import type { ReactNode } from "react";

import { contractMonths, terbilang } from "./numbering";
import { longDate, rupiah, type PkwtContent } from "./pkwt";

function Row({ label, value }: { label: string; value: string }) {
  return (
    <tr>
      <td className="w-44 py-0.5 align-top">{label}</td>
      <td className="w-3 py-0.5 align-top">:</td>
      <td className="py-0.5 align-top">{value}</td>
    </tr>
  );
}

/**
 * Printable PKWT (Perjanjian Kerja Waktu Tertentu) built from the snapshot
 * taken when the number was issued. A general template: the organization
 * reviews it with its own legal terms before signing.
 */
export function PkwtLetter({
  content,
  documentNumber,
  issuedDate,
  organizationName,
  voided,
}: {
  content: PkwtContent;
  documentNumber: string;
  issuedDate: string;
  organizationName: string;
  voided: boolean;
}) {
  const months = contractMonths(content.contractStart, content.contractEnd);
  const e = content.employee;
  const articles: { title: string; body: ReactNode }[] = [
    {
      title: "Jabatan dan Tempat Kerja",
      body: (
        <>
          PIHAK PERTAMA mempekerjakan PIHAK KEDUA sebagai <b>{content.position}</b>
          {content.department ? <> pada {content.department}</> : null}, dengan tempat kerja di {content.workLocation}. PIHAK KEDUA
          bersedia melaksanakan tugas sesuai uraian jabatan dan arahan atasan.
        </>
      ),
    },
    {
      title: "Jangka Waktu Perjanjian",
      body: (
        <>
          Perjanjian ini berlaku selama {months} ({terbilang(months)}) bulan, terhitung sejak tanggal{" "}
          <b>{longDate(content.contractStart)}</b> sampai dengan <b>{longDate(content.contractEnd)}</b>, dan berakhir dengan
          sendirinya pada tanggal tersebut kecuali diperpanjang atau diperbarui dengan perjanjian tertulis.
        </>
      ),
    },
    {
      title: "Upah",
      body:
        content.salary !== null ? (
          <>
            PIHAK KEDUA menerima upah pokok sebesar <b>{rupiah(content.salary)}</b> ({terbilang(content.salary)} rupiah) per
            bulan, dibayarkan sesuai jadwal penggajian perusahaan, dikurangi potongan sesuai peraturan perundang-undangan.
          </>
        ) : (
          <>Upah dan tunjangan PIHAK KEDUA diatur sesuai ketentuan penggajian perusahaan dan peraturan perundang-undangan.</>
        ),
    },
    {
      title: "Waktu Kerja",
      body: (
        <>
          {content.workingHours ? <>Waktu kerja: {content.workingHours}. </> : null}
          Waktu kerja, istirahat dan lembur mengikuti peraturan perusahaan dan peraturan perundang-undangan yang berlaku.
        </>
      ),
    },
    {
      title: "Hak dan Kewajiban",
      body: (
        <>
          PIHAK KEDUA wajib mematuhi peraturan perusahaan, menjaga kerahasiaan informasi perusahaan, dan melaksanakan pekerjaan
          dengan baik. PIHAK KEDUA berhak atas jaminan sosial ketenagakerjaan dan kesehatan, cuti, serta hak lain sesuai
          peraturan perundang-undangan.
        </>
      ),
    },
    {
      title: "Berakhirnya Perjanjian",
      body: (
        <>
          Apabila salah satu pihak mengakhiri perjanjian sebelum jangka waktu berakhir, berlaku ketentuan peraturan
          perundang-undangan ketenagakerjaan, termasuk kompensasi PKWT yang menjadi hak PIHAK KEDUA.
        </>
      ),
    },
    {
      title: "Penutup",
      body: (
        <>
          Hal-hal yang belum diatur dalam perjanjian ini tunduk pada peraturan perusahaan dan peraturan perundang-undangan.
          Perjanjian ini dibuat dalam rangkap 2 (dua) bermeterai cukup, masing-masing mempunyai kekuatan hukum yang sama.
        </>
      ),
    },
  ];

  return (
    <article className="hris-letter relative mx-auto max-w-[210mm] bg-white px-[18mm] py-[16mm] font-serif text-[13.5px] leading-relaxed text-black shadow-[0_8px_30px_rgb(0_0_0/0.08)]">
      {voided ? (
        <div aria-hidden className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <span className="-rotate-12 rounded-xl border-4 border-red-500/60 px-6 py-2 text-5xl font-bold text-red-500/60">DIBATALKAN</span>
        </div>
      ) : null}
      <header className="border-b-2 border-black pb-3 text-center">
        <p className="text-[18px] font-bold tracking-wide uppercase">{organizationName}</p>
      </header>
      <h1 className="mt-6 text-center text-[16px] font-bold uppercase underline">Perjanjian Kerja Waktu Tertentu</h1>
      <p className="text-center">Nomor: {documentNumber}</p>

      <p className="mt-6">Yang bertanda tangan di bawah ini:</p>
      <table className="mt-2 ml-4">
        <tbody>
          <Row label="Nama" value={content.signatoryName} />
          <Row label="Jabatan" value={content.signatoryTitle} />
        </tbody>
      </table>
      <p className="mt-1">
        bertindak untuk dan atas nama <b>{organizationName}</b>, selanjutnya disebut <b>PIHAK PERTAMA</b>.
      </p>
      <table className="mt-3 ml-4">
        <tbody>
          <Row label="Nama" value={e.name} />
          <Row label="No. Induk Karyawan" value={e.employeeNumber} />
          <Row label="NIK" value={e.nik ?? "—"} />
          <Row
            label="Tempat, tanggal lahir"
            value={[e.birthPlace, e.birthDate ? longDate(e.birthDate) : null].filter(Boolean).join(", ") || "—"}
          />
          <Row label="Jenis kelamin" value={e.gender === "Male" ? "Laki-laki" : e.gender === "Female" ? "Perempuan" : "—"} />
          <Row label="Alamat" value={e.address ?? "—"} />
        </tbody>
      </table>
      <p className="mt-1">
        bertindak untuk dan atas nama diri sendiri, selanjutnya disebut <b>PIHAK KEDUA</b>.
      </p>
      <p className="mt-3">Kedua belah pihak sepakat mengadakan Perjanjian Kerja Waktu Tertentu dengan ketentuan sebagai berikut:</p>

      {articles.map((article, index) => (
        <section key={article.title} className="mt-4 break-inside-avoid">
          <h2 className="text-center font-bold">
            Pasal {index + 1}
            <br />
            {article.title}
          </h2>
          <p className="mt-1 text-justify">{article.body}</p>
        </section>
      ))}

      <p className="mt-6">
        {content.city ? `${content.city}, ` : ""}
        {longDate(issuedDate)}
      </p>
      <div className="mt-4 grid grid-cols-2 gap-8 text-center break-inside-avoid">
        <div>
          <p>PIHAK PERTAMA</p>
          <div className="h-24" />
          <p className="font-bold underline">{content.signatoryName}</p>
          <p>{content.signatoryTitle}</p>
        </div>
        <div>
          <p>PIHAK KEDUA</p>
          <div className="h-24" />
          <p className="font-bold underline">{e.name}</p>
          <p>{content.position}</p>
        </div>
      </div>
    </article>
  );
}
