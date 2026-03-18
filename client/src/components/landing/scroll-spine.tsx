/**
 * scroll-spine.tsx — Phase 30: Animated SVG pipeline "spine"
 *
 * A central vertical SVG line that runs between feature sections,
 * drawing/lighting up with neon glow as the user scrolls.
 * Uses framer-motion useScroll + useTransform.
 */

import { useRef } from "react";
import { motion, useScroll, useTransform } from "framer-motion";

interface ScrollSpineProps {
  children: React.ReactNode;
}

export function ScrollSpine({ children }: ScrollSpineProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ["start center", "end center"],
  });

  // Map 0->1 scroll into stroke dasharray reveal
  const pathLength = useTransform(scrollYProgress, [0, 1], [0, 1]);
  // Glow intensifies as you scroll
  const glowOpacity = useTransform(scrollYProgress, [0, 0.5, 1], [0.2, 0.8, 1]);

  return (
    <div ref={containerRef} className="relative">
      {/* The SVG spine — centered, behind content */}
      <div className="absolute left-1/2 top-0 bottom-0 -translate-x-1/2 pointer-events-none hidden lg:block">
        <svg
          width="4"
          height="100%"
          viewBox="0 0 4 100"
          preserveAspectRatio="none"
          className="h-full"
        >
          {/* Background track */}
          <line
            x1="2"
            y1="0"
            x2="2"
            y2="100"
            stroke="#30363d"
            strokeWidth="1"
          />
          {/* Animated neon line */}
          <motion.line
            x1="2"
            y1="0"
            x2="2"
            y2="100"
            stroke="url(#spineGradient)"
            strokeWidth="2"
            strokeLinecap="round"
            style={{ pathLength }}
          />
          {/* Gradient definition */}
          <defs>
            <linearGradient
              id="spineGradient"
              x1="0"
              y1="0"
              x2="0"
              y2="1"
            >
              <stop offset="0%" stopColor="#58a6ff" />
              <stop offset="40%" stopColor="#2ea043" />
              <stop offset="70%" stopColor="#8957e5" />
              <stop offset="100%" stopColor="#58a6ff" />
            </linearGradient>
          </defs>
        </svg>
        {/* Glow effect overlay */}
        <motion.div
          className="absolute top-0 left-1/2 -translate-x-1/2 w-[2px] h-full"
          style={{
            opacity: glowOpacity,
            background:
              "linear-gradient(to bottom, #58a6ff, #2ea043, #8957e5, #58a6ff)",
            filter: "blur(6px)",
          }}
        />
      </div>

      {/* Node markers at section intersections */}
      {children}
    </div>
  );
}

/** A glowing dot node placed at section boundaries on the spine */
export function SpineNode({ color = "#2ea043" }: { color?: string }) {
  return (
    <div className="hidden lg:flex justify-center relative z-10 py-4">
      <motion.div
        className="h-3 w-3 rounded-full border-2"
        style={{
          borderColor: color,
          backgroundColor: `${color}33`,
          boxShadow: `0 0 12px ${color}66, 0 0 24px ${color}22`,
        }}
        initial={{ scale: 0 }}
        whileInView={{ scale: 1 }}
        viewport={{ once: true, margin: "-40px" }}
        transition={{ type: "spring", stiffness: 300, damping: 20 }}
      />
    </div>
  );
}
