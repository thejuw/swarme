/**
 * footer.tsx — Phase 28: Landing Page Footer
 *
 * Clean, minimalist footer with copyright, legal links (Terms/Privacy),
 * and Perplexity Computer attribution. Uses wouter Link for hash routing.
 */

import { Link } from "wouter";
import { SwarmeLogo } from "@/components/swarme-logo";

export function Footer() {
  return (
    <footer className="border-t border-border/40 py-6" data-testid="landing-footer">
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
          {/* Left: Brand + copyright */}
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <SwarmeLogo className="h-4 w-4" />
            <span>&copy; {new Date().getFullYear()} Edge-Swarm. All rights reserved.</span>
          </div>

          {/* Center: Legal links */}
          <div className="flex items-center gap-4 text-sm">
            <Link
              href="/terms"
              className="text-muted-foreground hover:text-foreground transition-colors"
              data-testid="link-footer-terms"
            >
              Terms of Service
            </Link>
            <Link
              href="/privacy"
              className="text-muted-foreground hover:text-foreground transition-colors"
              data-testid="link-footer-privacy"
            >
              Privacy Policy
            </Link>
          </div>

          {/* Right: Attribution */}
          <a
            href="https://www.perplexity.ai/computer"
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            Created with Perplexity Computer
          </a>
        </div>
      </div>
    </footer>
  );
}
