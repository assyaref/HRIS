"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils/cn";

type Point = { label: string; value: number };

/** Initial (server-render) width; replaced by the measured container width. */
const DEFAULT_VIEW_BOX_WIDTH = 430;

interface AttendanceTrendChartProps {
  points: Point[];
  height?: number;
}

/**
 * Responsive SVG line chart for the attendance trend.
 *
 * Renders from real aggregates only — empty series are handled by the
 * parent. Primary-token line, subtle grid, minimal axes, translucent area fill
 * and a hover tooltip. The viewBox tracks the measured container width (and a
 * fixed pixel height), so axis labels render at their true size at every
 * breakpoint instead of being scaled with the container.
 */
export function AttendanceTrendChart({
  points,
  height = 250,
}: AttendanceTrendChartProps) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [viewW, setViewW] = useState(DEFAULT_VIEW_BOX_WIDTH);

  useEffect(() => {
    const el = containerRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(([entry]) => {
      const w = Math.round(entry.contentRect.width);
      if (w > 0) setViewW(w);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  if (points.length === 0) return null;

  const padding = { top: 22, right: 22, bottom: 34, left: 36 };
  const plotW = viewW - padding.left - padding.right;
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
      ref={containerRef}
      className="relative w-full"
      style={{ height }}
    >
      <svg
        width="100%"
        height="100%"
        viewBox={`0 0 ${viewW} ${height}`}
        preserveAspectRatio="xMidYMid meet"
        className="block"
        aria-label="Attendance trend"
        onMouseMove={() => setActiveIndex(null)}
        onMouseLeave={() => setActiveIndex(null)}
      >
        <defs>
          <linearGradient id="attendanceGradient" x1="0" x2="0" y1="0" y2="1">
            <stop style={{ stopColor: "var(--primary)" }} stopOpacity="0.24" offset="0%" />
            <stop style={{ stopColor: "var(--primary)" }} stopOpacity="0.01" offset="100%" />
          </linearGradient>
        </defs>

        <g
          style={{ stroke: "var(--border)" }}
          strokeWidth="1"
          strokeDasharray="4 6"
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
          style={{ stroke: "var(--primary)" }}
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
                  style={{ fill: "var(--primary)" }}
                  fillOpacity="0.14"
                  pointerEvents="none"
                />
              )}
              <circle
                cx={pt.x}
                cy={pt.y}
                r={active ? 4 : 3.5}
                style={{ fill: "var(--card)", stroke: "var(--primary)" }}
                strokeWidth={2}
                pointerEvents="none"
              />
              <text
                x={pt.x}
                y={padding.top + plotH + 20}
                textAnchor="middle"
                style={{ fill: "var(--muted-foreground)" }}
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
          style={{ fill: "var(--muted-foreground)" }}
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
                  left: `${(pt.x / viewW) * 100}%`,
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
