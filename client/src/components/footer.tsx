/**
 * footer.tsx — Enterprise Footer Component
 *
 * 5-column responsive grid footer inspired by Stripe/Vercel/GitHub.
 * Fetches link structure and social URLs from /api/public/footer.
 * Falls back to hardcoded defaults when the API is unavailable.
 */

import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { SwarmeLogo } from "@/components/swarme-logo";

// ── Social Icons (inline SVGs for zero-dependency) ──────────

function XIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden="true">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  );
}

function LinkedInIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden="true">
      <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
    </svg>
  );
}

function DiscordIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden="true">
      <path d="M20.317 4.3698a19.7913 19.7913 0 00-4.8851-1.5152.0741.0741 0 00-.0785.0371c-.211.3753-.4447.8648-.6083 1.2495-1.8447-.2762-3.68-.2762-5.4868 0-.1636-.3933-.4058-.8742-.6177-1.2495a.077.077 0 00-.0785-.037 19.7363 19.7363 0 00-4.8852 1.515.0699.0699 0 00-.0321.0277C.5334 9.0458-.319 13.5799.0992 18.0578a.0824.0824 0 00.0312.0561c2.0528 1.5076 4.0413 2.4228 5.9929 3.0294a.0777.0777 0 00.0842-.0276c.4616-.6304.8731-1.2952 1.226-1.9942a.076.076 0 00-.0416-.1057c-.6528-.2476-1.2743-.5495-1.8722-.8923a.077.077 0 01-.0076-.1277c.1258-.0943.2517-.1923.3718-.2914a.0743.0743 0 01.0776-.0105c3.9278 1.7933 8.18 1.7933 12.0614 0a.0739.0739 0 01.0785.0095c.1202.099.246.1981.3728.2924a.077.077 0 01-.0066.1276 12.2986 12.2986 0 01-1.873.8914.0766.0766 0 00-.0407.1067c.3604.698.7719 1.3628 1.225 1.9932a.076.076 0 00.0842.0286c1.961-.6067 3.9495-1.5219 6.0023-3.0294a.077.077 0 00.0313-.0552c.5004-5.177-.8382-9.6739-3.5485-13.6604a.061.061 0 00-.0312-.0286zM8.02 15.3312c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9555-2.4189 2.157-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.9555 2.4189-2.1569 2.4189zm7.9748 0c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9554-2.4189 2.1569-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.946 2.4189-2.1568 2.4189z" />
    </svg>
  );
}

// ── Types ────────────────────────────────────────────────────

interface FooterLink {
  label: string;
  href: string;
  external?: boolean;
  visible?: boolean;
}

interface FooterColumn {
  title: string;
  links: FooterLink[];
}

interface FooterConfig {
  columns: FooterColumn[];
  company_info: {
    mission: string;
    support_email: string;
    address: string;
    social: {
      x: string;
      linkedin: string;
      discord: string;
    };
  };
}

// ── Defaults ────────────────────────────────────────────────

const DEFAULT_FOOTER: FooterConfig = {
  columns: [
    {
      title: "Product",
      links: [
        { label: "Features", href: "/#features" },
        { label: "Integrations", href: "/developers" },
        { label: "Pricing", href: "/#pricing" },
        { label: "Developer Hub", href: "/developers" },
        { label: "Changelog", href: "/developers" },
      ],
    },
    {
      title: "Resources",
      links: [
        { label: "Help Center", href: "/help" },
        { label: "Documentation", href: "/docs" },
        { label: "System Status", href: "https://status.swarme.io", external: true },
        { label: "Community", href: "https://discord.gg/swarme", external: true },
      ],
    },
    {
      title: "Company",
      links: [
        { label: "About Us", href: "/about" },
        { label: "Blog", href: "/about" },
        { label: "Contact Us", href: "/contact" },
        { label: "Careers", href: "/about" },
      ],
    },
    {
      title: "Legal & Security",
      links: [
        { label: "Security & Compliance", href: "/security" },
        { label: "Terms of Service", href: "/terms" },
        { label: "Privacy Policy", href: "/privacy" },
        { label: "Cookie Settings", href: "/privacy" },
      ],
    },
  ],
  company_info: {
    mission: "The autonomous SEO platform. 12 AI agents operating at the edge, 24/7.",
    support_email: "support@swarme.io",
    address: "San Francisco, CA",
    social: {
      x: "https://x.com/swarme",
      linkedin: "https://linkedin.com/company/swarme",
      discord: "https://discord.gg/swarme",
    },
  },
};

// ── Component ───────────────────────────────────────────────

export function Footer() {
  const { data } = useQuery<{ success: boolean; footer: FooterConfig }>({
    queryKey: ["/api/public/footer"],
    staleTime: 300_000,
  });

  const footer = data?.footer ?? DEFAULT_FOOTER;
  const { columns, company_info } = footer;

  return (
    <footer
      className="bg-[#0a0a0f] border-t border-white/[0.06] text-sm"
      data-testid="enterprise-footer"
    >
      <div className="max-w-7xl mx-auto px-6 py-16">
        {/* ── Main grid ──────────────────────── */}
        <div className="grid grid-cols-2 md:grid-cols-6 gap-10 md:gap-8">
          {/* Brand column (spans 2) */}
          <div className="col-span-2">
            <div className="flex items-center gap-2.5 mb-4">
              <SwarmeLogo className="h-6 w-6 text-white" />
              <span className="text-white font-semibold tracking-tight text-base">
                Swarme
              </span>
            </div>
            <p className="text-slate-400 text-[13px] leading-relaxed max-w-xs mb-6">
              {company_info.mission}
            </p>
            {/* Social links */}
            <div className="flex items-center gap-3">
              {company_info.social.x && (
                <a
                  href={company_info.social.x}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-slate-500 hover:text-white transition-colors"
                  aria-label="Follow us on X"
                  data-testid="social-x"
                >
                  <XIcon className="h-4 w-4" />
                </a>
              )}
              {company_info.social.linkedin && (
                <a
                  href={company_info.social.linkedin}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-slate-500 hover:text-white transition-colors"
                  aria-label="Follow us on LinkedIn"
                  data-testid="social-linkedin"
                >
                  <LinkedInIcon className="h-4 w-4" />
                </a>
              )}
              {company_info.social.discord && (
                <a
                  href={company_info.social.discord}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-slate-500 hover:text-white transition-colors"
                  aria-label="Join our Discord"
                  data-testid="social-discord"
                >
                  <DiscordIcon className="h-4 w-4" />
                </a>
              )}
            </div>
          </div>

          {/* Dynamic link columns */}
          {columns.map((col) => (
            <div key={col.title}>
              <h3 className="text-white font-medium text-xs uppercase tracking-wider mb-4">
                {col.title}
              </h3>
              <ul className="space-y-2.5">
                {col.links
                  .filter((l) => l.visible !== false)
                  .map((link) =>
                    link.external ? (
                      <li key={link.label}>
                        <a
                          href={link.href}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-slate-400 hover:text-white transition-colors text-[13px]"
                        >
                          {link.label}
                        </a>
                      </li>
                    ) : (
                      <li key={link.label}>
                        <Link
                          href={link.href}
                          className="text-slate-400 hover:text-white transition-colors text-[13px]"
                        >
                          {link.label}
                        </Link>
                      </li>
                    )
                  )}
              </ul>
            </div>
          ))}
        </div>

        {/* ── Bottom bar ─────────────────────── */}
        <div className="mt-14 pt-6 border-t border-white/[0.06] flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="text-slate-500 text-xs">
            &copy; {new Date().getFullYear()} Swarme, Inc. All rights reserved.
          </p>
          <p className="text-slate-600 text-xs">
            {company_info.address}
            {company_info.support_email && (
              <>
                {" · "}
                <a
                  href={`mailto:${company_info.support_email}`}
                  className="text-slate-500 hover:text-white transition-colors"
                >
                  {company_info.support_email}
                </a>
              </>
            )}
          </p>
        </div>
      </div>
    </footer>
  );
}
