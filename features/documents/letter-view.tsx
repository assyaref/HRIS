import { longDate, type LetterContent } from "./pkwt";

/**
 * Printable letter generated from a template (plain-text paragraphs; line
 * breaks inside a paragraph are kept). Same paper style as the PKWT.
 */
export function LetterView({
  content,
  documentNumber,
  issuedDate,
  organizationName,
  voided,
}: {
  content: LetterContent;
  documentNumber: string;
  issuedDate: string;
  organizationName: string;
  voided: boolean;
}) {
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
      <h1 className="mt-6 text-center text-[16px] font-bold uppercase underline">{content.title}</h1>
      <p className="text-center">Nomor: {documentNumber}</p>
      <div className="mt-6 space-y-3">
        {content.paragraphs.map((p, i) => (
          <p key={i} className="text-justify whitespace-pre-line">
            {p}
          </p>
        ))}
      </div>
      <div className="mt-10 flex justify-end break-inside-avoid">
        <div className="min-w-[220px] text-center">
          <p>
            {content.city ? `${content.city}, ` : ""}
            {longDate(issuedDate)}
          </p>
          <p>{organizationName}</p>
          <div className="h-24" />
          <p className="font-bold underline">{content.signatoryName}</p>
          <p>{content.signatoryTitle}</p>
        </div>
      </div>
    </article>
  );
}
