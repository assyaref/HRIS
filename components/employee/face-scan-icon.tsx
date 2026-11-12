import { cn } from "@/lib/utils/cn";

/**
 * Animated "Scan Wajah" glyph for the ABSEN button: the same face as
 * `HrisIcon name="face"`, with the corner frame breathing, a glowing scan line
 * sweeping over the face and the eyes blinking now and then. Pure SVG + CSS
 * (`.face-scan*` in globals.css); static when the user prefers reduced motion.
 */
export function FaceScanIcon({ className = "size-9" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cn("face-scan overflow-visible", className)}
      aria-hidden="true"
      data-icon="face-scan"
    >
      <g className="face-scan__frame">
        <path d="M3 7.5V6a3 3 0 0 1 3-3h1.5M16.5 3H18a3 3 0 0 1 3 3v1.5M21 16.5V18a3 3 0 0 1-3 3h-1.5M7.5 21H6a3 3 0 0 1-3-3v-1.5" />
      </g>
      <g className="face-scan__eyes">
        <path d="M9 9.5v1M15 9.5v1" />
      </g>
      <path d="M12 9.5v3.5h-1" />
      <path d="M9.5 16a3.6 3.6 0 0 0 5 0" />
      <g className="face-scan__line">
        <line x1="5" y1="0" x2="19" y2="0" strokeWidth={4} strokeOpacity={0.28} />
        <line x1="5" y1="0" x2="19" y2="0" strokeWidth={1.4} />
      </g>
    </svg>
  );
}
