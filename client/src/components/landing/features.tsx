/**
 * features.tsx — Phase 30: Bento Grid Feature Highlight
 *
 * Modern bento box layout with 3 hero cards + 3 supporting cards.
 * Each card has a radial gradient that follows the cursor on hover
 * (glass-morphism glow effect). Featured cards include mini
 * animated illustrations.
 */

import { useRef, useState, useCallback } from "react";
import { motion } from "framer-motion";
import {
  Eye,
  TrendingUp,
  Share2,
  Cpu,
  RefreshCw,
  Languages,
} from "lucide-react";

// ── Cursor glow card wrapper ──────────────────────

interface GlowCardProps {
  children: React.ReactNode;
  className?: string;
  accentColor?: string;
}

function GlowCard({
  children,
  className = "",
  accentColor = "88,166,255",
}: GlowCardProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const [isHovered, setIsHovered] = useState(false);

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!cardRef.current) return;
      const rect = cardRef.current.getBoundingClientRect();
      setMousePos({
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
      });
    },
    [],
  );

  return (
    <motion.div
      ref={cardRef}
      onMouseMove={handleMouseMove}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className={`relative rounded-xl border border-gh-border overflow-hidden group ${className}`}
      style={{ background: "#0d1117" }}
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-60px" }}
      transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
    >
      {/* Radial glow following cursor */}
      <div
        className="absolute inset-0 pointer-events-none transition-opacity duration-300"
        style={{
          opacity: isHovered ? 1 : 0,
          background: `radial-gradient(600px circle at ${mousePos.x}px ${mousePos.y}px, rgba(${accentColor}, 0.06), transparent 40%)`,
        }}
      />
      {/* Glowing border highlight */}
      <div
        className="absolute inset-0 pointer-events-none rounded-xl transition-opacity duration-300"
        style={{
          opacity: isHovered ? 1 : 0,
          background: `radial-gradient(400px circle at ${mousePos.x}px ${mousePos.y}px, rgba(${accentColor}, 0.15), transparent 40%)`,
          mask: "linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)",
          WebkitMask:
            "linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)",
          maskComposite: "exclude",
          WebkitMaskComposite: "xor",
          padding: "1px",
          borderRadius: "0.75rem",
        }}
      />
      <div className="relative z-10">{children}</div>
    </motion.div>
  );
}

// ── Mini animated illustrations ──────────────────

function VisionScanAnimation() {
  return (
    <div className="relative w-full h-28 rounded-lg bg-gh-surface/60 border border-gh-border/50 overflow-hidden mb-4">
      {/* Mock image placeholder */}
      <div className="absolute inset-3 rounded bg-gh-border/30 flex items-center justify-center">
        <div className="grid grid-cols-3 gap-1.5">
          {[...Array(6)].map((_, i) => (
            <div
              key={i}
              className="w-6 h-5 rounded-sm bg-gh-border/50"
            />
          ))}
        </div>
      </div>
      {/* Scanning line */}
      <motion.div
        className="absolute left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-neon-cyan to-transparent"
        animate={{ top: ["10%", "90%", "10%"] }}
        transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
      />
      {/* Detection boxes */}
      <motion.div
        className="absolute top-3 left-3 w-8 h-6 border border-neon-cyan/60 rounded-sm"
        animate={{ opacity: [0, 1, 0] }}
        transition={{ duration: 2, repeat: Infinity, delay: 0.5 }}
      />
      <motion.div
        className="absolute top-3 right-8 w-10 h-7 border border-neon-purple/60 rounded-sm"
        animate={{ opacity: [0, 1, 0] }}
        transition={{ duration: 2, repeat: Infinity, delay: 1.2 }}
      />
    </div>
  );
}

function HeatmapAnimation() {
  return (
    <div className="relative w-full h-28 rounded-lg bg-gh-surface/60 border border-gh-border/50 overflow-hidden mb-4">
      {/* Heatmap dots */}
      {[
        { x: "25%", y: "30%", size: 40, opacity: 0.7, delay: 0 },
        { x: "55%", y: "45%", size: 56, opacity: 0.5, delay: 0.5 },
        { x: "70%", y: "25%", size: 32, opacity: 0.6, delay: 1 },
        { x: "40%", y: "65%", size: 24, opacity: 0.4, delay: 1.5 },
        { x: "15%", y: "55%", size: 28, opacity: 0.5, delay: 0.8 },
      ].map((dot, i) => (
        <motion.div
          key={i}
          className="absolute rounded-full"
          style={{
            left: dot.x,
            top: dot.y,
            width: dot.size,
            height: dot.size,
            background: `radial-gradient(circle, rgba(239,68,68,${dot.opacity}), rgba(239,68,68,0.1), transparent)`,
            transform: "translate(-50%, -50%)",
          }}
          animate={{
            scale: [0.8, 1.2, 0.8],
            opacity: [dot.opacity * 0.6, dot.opacity, dot.opacity * 0.6],
          }}
          transition={{
            duration: 2.5,
            repeat: Infinity,
            delay: dot.delay,
            ease: "easeInOut",
          }}
        />
      ))}
      {/* CRO label */}
      <div className="absolute bottom-2 right-2 px-2 py-0.5 rounded bg-gh-bg/80 border border-gh-border/60">
        <span className="text-[10px] font-mono text-neon-emerald">
          +14% CTR
        </span>
      </div>
    </div>
  );
}

function OmnichannelIcons() {
  return (
    <div className="flex items-center gap-3 mb-4">
      {[
        {
          label: "X",
          icon: (
            <svg viewBox="0 0 24 24" className="w-5 h-5 fill-current">
              <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
            </svg>
          ),
          color: "text-white",
        },
        {
          label: "LinkedIn",
          icon: (
            <svg viewBox="0 0 24 24" className="w-5 h-5 fill-current">
              <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
            </svg>
          ),
          color: "text-[#0a66c2]",
        },
        {
          label: "Shopify",
          icon: (
            <svg viewBox="0 0 24 24" className="w-5 h-5 fill-current">
              <path d="M15.337 23.979l7.216-1.561s-2.604-17.613-2.625-17.73c-.018-.116-.114-.192-.211-.192s-1.929-.136-1.929-.136-1.275-1.274-1.439-1.411c-.045-.037-.075-.058-.121-.074l-.914 21.104zm-1.515-17.584a3.24 3.24 0 0 0-.131-.658 1.63 1.63 0 0 0-.0535-.122 2.14 2.14 0 0 0-.965-1.042c-.585-.303-1.378-.211-2.088.305-.71.516-1.37 1.427-1.703 2.691l2.97-.962c-.001-.001-.016-.135-.029-.212zM12.95 4.338c-.083-.391-.238-.776-.478-1.098-.621-.835-1.534-1.24-2.537-1.103a4.09 4.09 0 0 0-.584.121c.196-.29.425-.555.684-.773.745-.627 1.725-.844 2.587-.325.425.256.733.65.949 1.105-.17.006-.353.022-.52.048l-.101.025zm-3.63 1.18c.005-.067.01-.134.018-.198.236-1.776 1.282-3.09 2.569-3.44.122-.033.247-.055.375-.066-.4-.642-.96-1.103-1.676-1.293-1.283-.339-2.594.262-3.471 1.316-.689.831-1.181 1.946-1.337 3.264l3.522-1.583z" />
            </svg>
          ),
          color: "text-[#96bf48]",
        },
      ].map((platform) => (
        <motion.div
          key={platform.label}
          className={`flex items-center justify-center w-10 h-10 rounded-lg border border-gh-border/60 bg-gh-surface/40 ${platform.color}`}
          whileHover={{ scale: 1.1, borderColor: "#58a6ff" }}
          transition={{ type: "spring", stiffness: 400, damping: 20 }}
        >
          {platform.icon}
        </motion.div>
      ))}
      <motion.div
        className="flex items-center justify-center w-10 h-10 rounded-lg border border-gh-border/40 bg-gh-surface/20"
        whileHover={{ scale: 1.05 }}
      >
        <span className="text-xs text-gh-muted font-mono">+5</span>
      </motion.div>
    </div>
  );
}

// ── Main grid ────────────────────────────────────

const BENTO_ITEMS = [
  {
    id: "vision",
    title: "Self-Healing ADA Compliance",
    desc: "Edge-Vision continuously scans every page, patches missing ARIA labels and alt-text in real time, and validates against WCAG 2.2 AA — before your users or auditors notice.",
    icon: Eye,
    accentColor: "88,166,255",
    illustration: <VisionScanAnimation />,
    span: "lg:col-span-2 lg:row-span-2",
  },
  {
    id: "cro",
    title: "Algorithmic Conversion Optimization",
    desc: "Behavioral heatmap tracking identifies high-friction zones. The CRO agent dynamically reorders HTML elements and A/B tests layout variants to maximize conversion rate.",
    icon: TrendingUp,
    accentColor: "137,87,229",
    illustration: <HeatmapAnimation />,
    span: "lg:col-span-1 lg:row-span-2",
  },
  {
    id: "omnichannel",
    title: "Content Atomization",
    desc: "One click transforms any article into platform-native drafts for X and LinkedIn. Human approval required — nothing posts autonomously.",
    icon: Share2,
    accentColor: "46,160,67",
    illustration: <OmnichannelIcons />,
    span: "lg:col-span-1",
  },
  {
    id: "edge",
    title: "Cloudflare Workers Runtime",
    desc: "Sub-200ms execution. Zero cold starts. Your swarm runs on 300+ edge locations worldwide.",
    icon: Cpu,
    accentColor: "88,166,255",
    illustration: null,
    span: "lg:col-span-1",
  },
  {
    id: "decay",
    title: "Content Decay Detection",
    desc: "Daily scans flag pages losing rankings. Refreshed content is queued for human approval before going live.",
    icon: RefreshCw,
    accentColor: "137,87,229",
    illustration: null,
    span: "lg:col-span-1",
  },
];

export function Features() {
  return (
    <section className="py-20" data-testid="features-section">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <motion.div
          className="text-center mb-12"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
        >
          <span className="inline-block px-3 py-1 rounded-full border border-gh-border bg-gh-surface/40 text-xs font-mono text-neon-cyan mb-4">
            Capabilities
          </span>
          <h2 className="text-3xl sm:text-4xl font-bold tracking-tight text-white">
            Everything runs on the edge.
          </h2>
          <p className="mt-3 text-gh-muted max-w-xl mx-auto">
            A fully autonomous pipeline — from crawling to publishing — powered
            by 12 specialized AI agents.
          </p>
        </motion.div>

        {/* Bento grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {BENTO_ITEMS.map((item) => (
            <GlowCard
              key={item.id}
              className={item.span}
              accentColor={item.accentColor}
            >
              <div className="p-6 h-full flex flex-col">
                {item.illustration}
                <div className="flex items-center gap-2.5 mb-2">
                  <div
                    className="p-1.5 rounded-md"
                    style={{
                      background: `rgba(${item.accentColor}, 0.1)`,
                    }}
                  >
                    <item.icon
                      className="h-4 w-4"
                      style={{
                        color: `rgb(${item.accentColor})`,
                      }}
                    />
                  </div>
                  <h3 className="font-semibold text-white text-sm">
                    {item.title}
                  </h3>
                </div>
                <p className="text-sm text-gh-muted leading-relaxed flex-1">
                  {item.desc}
                </p>
              </div>
            </GlowCard>
          ))}
        </div>
      </div>
    </section>
  );
}
