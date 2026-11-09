/**
 * Office tower illustration used by the greeting hero (desktop band and the
 * round mobile badge). Pure inline SVG — no image asset, scales crisply, and
 * works in light and dark themes because it carries its own sky.
 *
 * `variant="band"` draws the wide scene (sky blob, tower, trees) for the
 * desktop hero; `variant="badge"` crops the same scene into a circle.
 * `idPrefix` keeps gradient/pattern ids unique when rendered twice.
 */
export function BuildingIllustration({
  variant = "band",
  idPrefix = "bld",
  className,
}: {
  variant?: "band" | "badge";
  idPrefix?: string;
  className?: string;
}) {
  const id = (name: string) => `${idPrefix}-${name}`;
  const url = (name: string) => `url(#${id(name)})`;
  const badge = variant === "badge";

  return (
    <svg
      viewBox={badge ? "125 8 210 214" : "0 0 420 220"}
      className={className}
      role="img"
      aria-label="Ilustrasi gedung kantor"
      preserveAspectRatio={badge ? "xMidYMid slice" : "xMaxYMax meet"}
    >
      <defs>
        <linearGradient id={id("sky")} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#CFE6FF" />
          <stop offset="0.7" stopColor="#EEF6FF" />
          <stop offset="1" stopColor="#FFFFFF" />
        </linearGradient>
        <linearGradient id={id("glass")} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#3D7FE0" />
          <stop offset="0.55" stopColor="#1F4FA8" />
          <stop offset="1" stopColor="#173B7E" />
        </linearGradient>
        <linearGradient id={id("glass-side")} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#DCE7F5" />
          <stop offset="1" stopColor="#B9C9DE" />
        </linearGradient>
        <linearGradient id={id("glass-low")} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#5A93E6" />
          <stop offset="1" stopColor="#2A5DB5" />
        </linearGradient>
        <linearGradient id={id("shine")} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#FFFFFF" stopOpacity="0" />
          <stop offset="0.5" stopColor="#FFFFFF" stopOpacity="0.35" />
          <stop offset="1" stopColor="#FFFFFF" stopOpacity="0" />
        </linearGradient>
        <pattern
          id={id("win")}
          width="9"
          height="11"
          patternUnits="userSpaceOnUse"
        >
          <rect width="9" height="11" fill={url("glass")} />
          <rect x="0" y="0" width="1.2" height="11" fill="#E7F0FB" opacity="0.9" />
          <rect x="0" y="0" width="9" height="1.2" fill="#E7F0FB" opacity="0.9" />
        </pattern>
        <pattern
          id={id("win-side")}
          width="7"
          height="11"
          patternUnits="userSpaceOnUse"
        >
          <rect width="7" height="11" fill={url("glass-side")} />
          <rect x="0" y="0" width="1" height="11" fill="#8FA4C2" opacity="0.7" />
          <rect x="0" y="0" width="7" height="1" fill="#8FA4C2" opacity="0.7" />
        </pattern>
        <pattern
          id={id("win-low")}
          width="10"
          height="10"
          patternUnits="userSpaceOnUse"
        >
          <rect width="10" height="10" fill={url("glass-low")} />
          <rect x="0" y="0" width="1.2" height="10" fill="#EAF2FC" opacity="0.9" />
          <rect x="0" y="0" width="10" height="1.2" fill="#EAF2FC" opacity="0.9" />
        </pattern>
        {badge ? (
          <clipPath id={id("clip")}>
            <circle cx="230" cy="115" r="107" />
          </clipPath>
        ) : null}
      </defs>

      <g clipPath={badge ? url("clip") : undefined}>
        {/* Sky */}
        {badge ? (
          <rect x="110" y="0" width="240" height="240" fill={url("sky")} />
        ) : (
          <path
            d="M70 220C70 120 140 40 250 22c60-10 120 0 170 18v180z"
            fill={url("sky")}
          />
        )}

        {/* Clouds */}
        <g fill="#FFFFFF" opacity="0.9">
          <ellipse cx="128" cy="78" rx="22" ry="7" />
          <ellipse cx="142" cy="73" rx="14" ry="8" />
          <ellipse cx="350" cy="62" rx="24" ry="7" />
          <ellipse cx="362" cy="57" rx="13" ry="7" />
        </g>

        {/* Back slab */}
        <rect x="282" y="74" width="34" height="146" fill="#C9D8EC" />
        <rect x="282" y="74" width="34" height="146" fill={url("win-side")} opacity="0.65" />

        {/* Tower — side face */}
        <path d="M262 22h20l8 8v190h-28z" fill={url("win-side")} />
        {/* Tower — front glass face */}
        <rect x="196" y="22" width="66" height="198" fill={url("win")} />
        <rect x="196" y="22" width="66" height="198" fill={url("shine")} opacity="0.5" />
        {/* Crown + white frame */}
        <rect x="192" y="14" width="74" height="10" rx="1.5" fill="#F4F8FD" />
        <rect x="262" y="14" width="28" height="10" fill="#DCE5F1" />
        <rect x="192" y="22" width="5" height="198" fill="#F4F8FD" />
        <rect x="226" y="22" width="3" height="198" fill="#F4F8FD" opacity="0.9" />

        {/* Low wing */}
        <rect x="140" y="132" width="60" height="88" fill={url("win-low")} />
        <rect x="136" y="126" width="68" height="8" rx="1.5" fill="#F4F8FD" />
        <rect x="140" y="132" width="60" height="88" fill={url("shine")} opacity="0.35" />

        {/* Entrance */}
        <rect x="214" y="196" width="30" height="24" fill="#0F2E66" />
        <rect x="210" y="192" width="38" height="5" fill="#F4F8FD" />

        {/* Ground */}
        <path d="M60 212c80-10 250-12 360-4v12H60z" fill="#7CC36B" />
        <path d="M60 216c90-6 260-6 360 0v4H60z" fill="#5FAE52" />

        {/* Trees — left cluster */}
        <g>
          <rect x="112" y="186" width="3" height="22" fill="#6B4F2A" />
          <circle cx="113" cy="180" r="15" fill="#3F9A45" />
          <circle cx="102" cy="190" r="11" fill="#4FB052" />
          <circle cx="124" cy="188" r="12" fill="#2F8A3B" />
          <circle cx="86" cy="200" r="10" fill="#3F9A45" />
          <circle cx="140" cy="200" r="9" fill="#4FB052" />
          <circle cx="160" cy="204" r="8" fill="#2F8A3B" />
          <circle cx="178" cy="206" r="7" fill="#4FB052" />
        </g>

        {/* Trees — right cluster */}
        <g>
          <rect x="331" y="180" width="3" height="28" fill="#6B4F2A" />
          <circle cx="332" cy="172" r="17" fill="#3F9A45" />
          <circle cx="318" cy="186" r="12" fill="#2F8A3B" />
          <circle cx="348" cy="184" r="13" fill="#4FB052" />
          <circle cx="370" cy="196" r="12" fill="#3F9A45" />
          <circle cx="392" cy="200" r="11" fill="#2F8A3B" />
          <circle cx="300" cy="204" r="8" fill="#4FB052" />
          <circle cx="410" cy="204" r="10" fill="#4FB052" />
        </g>
      </g>
    </svg>
  );
}
