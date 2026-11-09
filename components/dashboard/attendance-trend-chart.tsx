"use client";

import { useState } from "react";
import { cn } from "@/lib/utils/cn";

type Point = { label: string; value: number };

const VIEW_BOX_WIDTH = 430;

interface AttendanceTrendChartProps {
  points: Point[];
  height?: number;
}

/**
 * Responsive SVG line chart for the attendance trend.
 *
 * Renders from real aggregates only — empty series are handled by the
 * parent. Soft blue line, subtle grid, minimal axes, translucent area fill
 * and a hover tooltip. Uses a fixed viewBox with percentage-positioned
 * overlay so it stays correct server-side and at any container width.
 */
export function AttendanceTrendChart({
  points,
  height = 250,
}: AttendanceTrendChartProps) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  if (points.length === 0) return null;

  const padding = { top: 22, right: 22, bottom: 34, left: 36 };
  const plotW = VIEW_BOX_WIDTH - padding.left - padding.right;
  const plotH = height - padding.top - padding.bottom;
  const max = Math.max(...points.map((p) => p.value), 1);
  const xStep = points.length > 1 ? plotW / (points.length - 1) : plotW;

  const linePoints = points
    .map((p, i) => {
      const x = padding.left + i * xStep;
      const y = padding.top + plotH - (p.value / max) * plotH;
      return `${x},${y}`;
    })
    .join(" ");

  const areaPoints = [
    `L${padding.left + (points.length - 1) * xStep},${padding.top + plotH}`,
    `L${padding.left},${padding.top + plotH}`,
    linePoints,
  ].join(" ");

  const getPoint = (i: number) => {
    const p = points[i];
    const x = padding.left + i * xStep;
    const y = padding.top + plotH - (p.value / max) * plotH;
    return { x, y, p };
  };

  return (
    <div
      className="relative w-full"
      style={{ aspectRatio: `${VIEW_BOX_WIDTH / height}` }}
    >
      <svg
        width="100%"
        height="100%"
        viewBox={`0 0 ${VIEW_BOX_WIDTH} ${height}`}
        preserveAspectRatio="xMidYMid meet"
        className="block"
        aria-label="Attendance trend"
        onMouseMove={() => setActiveIndex(null)}
        onMouseLeave={() => setActiveIndex(null)}
      >
        <defs>
          <linearGradient id="attendanceGradient" x1="0" x2="0" y1="0" y2="1">
            <stop stopColor="#526FAE" stopOpacity="0.30" offset="0%" />
            <stop stopColor="#526FAE" stopOpacity="0.02" offset="100%" />
          </linearGradient>
        </defs>

        <g
          stroke="#C5C8D3"
          strokeWidth="1"
          strokeDasharray="4 6"
          opacity="0.5"
          pointerEvents="none"
        >
          {[0, Math.round(max / 2), max].map((v, i) => {
            const y =
              padding.top + plotH - (v / max) * plotH;
            return (
              <line
                key={i}
                x1={padding.left}
                y1={y}
                x2={padding.left + plotW}
                y2={y}
              />
            );
          })}
        </g>

        <path
          d={`M${linePoints} ${areaPoints} Z`}
          fill="url(#attendanceGradient)"
          pointerEvents="none"
        />
        <polyline
          points={linePoints}
          fill="none"
          stroke="#526FAE"
          strokeWidth={2.5}
          strokeLinecap="round"
          strokeLinejoin="round"
          pointerEvents="none"
        />
        {points.map((p, i) => {
          const pt = getPoint(i);
          const active = activeIndex === i;
          return (
            <g
              key={i}
              className="cursor-pointer"
              onMouseMove={(e) => {
                e.stopPropagation();
                setActiveIndex(i);
              }}
              onMouseLeave={() => setActiveIndex(null)}
            >
              {active && (
                <circle
                  cx={pt.x}
                  cy={pt.y}
                  r={6}
                  fill="#526FAE"
                  fillOpacity="0.12"
                  pointerEvents="none"
                />
              )}
              <circle
                cx={pt.x}
                cy={pt.y}
                r={active ? 4 : 3.5}
                fill="#FFFFFF"
                stroke="#526FAE"
                strokeWidth={2}
                pointerEvents="none"
              />
              <text
                x={pt.x}
                y={padding.top + plotH + 20}
                textAnchor="middle"
                fill="#747986"
                fontSize="11"
                fontFamily="var(--font-geist-sans), sans-serif"
                pointerEvents="none"
              >
                {p.label}
              </text>
            </g>
          );
        })}
        <g
          fill="#747986"
          fontSize="11"
          fontFamily="var(--font-geist-sans), sans-serif"
          textAnchor="end"
          pointerEvents="none"
        >
          {[0, Math.round(max / 2), max].map((v, i) => {
            const y = padding.top + plotH - (v / max) * plotH;
            return (
              <text key={i} x={padding.left - 8} y={y + 4}>
                {v}
              </text>
            );
          })}
        </g>

        {activeIndex !== null ? (
          (() => {
            const pt = getPoint(activeIndex);
            return (
              <div
                className={cn(
                  "absolute flex items-center gap-1.5 rounded-[8px] border border-border bg-card px-2.5 py-1.5 text-xs font-semibold text-foreground shadow-card pointer-events-none",
                  "-translate-y-full mb-2"
                )}
                style={{
                  left: `${(pt.x / VIEW_BOX_WIDTH) * 100}%`,
                  top: `${(pt.y / height) * 100}%`,
                  transform: "translateX(-50%)",
                }}
              >
                <span className="text-muted-foreground font-normal">
                  {pt.p.label}
                </span>
                <span>{pt.p.value}</span>
              </div>
            );
          })()
        ) : null}
      </svg>
    </div>
  );
}
