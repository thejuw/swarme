/**
 * privacy-policy.tsx — Phase 28: Privacy Policy
 *
 * Static legal page at /#/privacy with GDPR/CCPA-compliant sections.
 * Uses Tailwind prose typography for clean readability.
 */

import { useLocation } from "wouter";
import { SwarmeLogo } from "@/components/swarme-logo";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";

export default function PrivacyPolicy() {
  const [, navigate] = useLocation();

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-border/40 bg-background/80 backdrop-blur-md">
        <div className="max-w-3xl mx-auto flex items-center gap-3 px-4 sm:px-6 h-14">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate("/")}
            data-testid="button-privacy-back"
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="flex items-center gap-2">
            <SwarmeLogo className="h-5 w-5 text-foreground" />
            <span className="font-semibold tracking-tight text-sm">Swarme</span>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-12">
        <h1 className="text-2xl font-bold tracking-tight mb-2" data-testid="text-privacy-title">
          Privacy Policy
        </h1>
        <p className="text-sm text-muted-foreground mb-8">
          Last updated: March 15, 2026
        </p>

        <div className="space-y-8 text-sm leading-relaxed text-muted-foreground">
          {/* Section 1 */}
          <section>
            <h2 className="text-base font-semibold text-foreground mb-3">
              1. Information We Collect
            </h2>
            <p>
              We collect information that you provide directly, as well as data generated
              through your use of the Swarme platform:
            </p>
            <ul className="list-disc list-inside mt-3 space-y-1.5">
              <li>
                <span className="text-foreground font-medium">Account information:</span> Email
                address, hashed password, and optional phone number for SMS notifications.
              </li>
              <li>
                <span className="text-foreground font-medium">Store telemetry:</span> Scroll depth,
                click events, heatmap coordinates, session duration, and conversion funnel data
                collected via our edge-deployed analytics script.
              </li>
              <li>
                <span className="text-foreground font-medium">API credentials:</span> Encrypted
                access tokens for connected e-commerce platforms (Shopify, WooCommerce). These are
                stored using AES-256 encryption at rest.
              </li>
              <li>
                <span className="text-foreground font-medium">Usage data:</span> Dashboard
                interactions, feature usage frequency, and agent configuration preferences.
              </li>
            </ul>
          </section>

          {/* Section 2 */}
          <section>
            <h2 className="text-base font-semibold text-foreground mb-3">
              2. How We Use Your Data
            </h2>
            <p>
              Your data is processed to deliver, maintain, and improve the Swarme platform:
            </p>
            <ul className="list-disc list-inside mt-3 space-y-1.5">
              <li>
                <span className="text-foreground font-medium">Edge processing:</span> Store
                telemetry (scroll depth, clicks, CRO metrics) is processed at the edge via
                Cloudflare Workers. Raw telemetry data is aggregated in real-time and only summary
                statistics are persisted — individual visitor data is never stored in our databases.
              </li>
              <li>
                <span className="text-foreground font-medium">AI optimization:</span> Aggregated
                metrics inform our AI agents' content optimization, keyword research, and A/B testing
                recommendations.
              </li>
              <li>
                <span className="text-foreground font-medium">Communications:</span> Email and SMS
                notifications about agent activity, approval requests, and retention campaigns.
              </li>
              <li>
                <span className="text-foreground font-medium">Billing:</span> Email address is
                shared with Stripe for subscription management and payment processing.
              </li>
            </ul>
          </section>

          {/* Section 3 */}
          <section>
            <h2 className="text-base font-semibold text-foreground mb-3">
              3. Third-Party Subprocessors
            </h2>
            <p>
              We use the following third-party services to operate the Swarme platform. Each
              subprocessor has been evaluated for security and compliance:
            </p>
            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="border-b border-border/60">
                    <th className="text-left py-2 pr-4 font-semibold text-foreground">Provider</th>
                    <th className="text-left py-2 pr-4 font-semibold text-foreground">Purpose</th>
                    <th className="text-left py-2 font-semibold text-foreground">Data Shared</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/40">
                  <tr>
                    <td className="py-2.5 pr-4 text-foreground font-medium">Cloudflare</td>
                    <td className="py-2.5 pr-4">Edge compute, CDN, D1 database, DNS</td>
                    <td className="py-2.5">All platform data (processed at edge)</td>
                  </tr>
                  <tr>
                    <td className="py-2.5 pr-4 text-foreground font-medium">Perplexity</td>
                    <td className="py-2.5 pr-4">AI content generation, analysis</td>
                    <td className="py-2.5">Store content, SEO metrics (anonymized)</td>
                  </tr>
                  <tr>
                    <td className="py-2.5 pr-4 text-foreground font-medium">Stripe</td>
                    <td className="py-2.5 pr-4">Payment processing, subscription billing</td>
                    <td className="py-2.5">Email, payment method, billing address</td>
                  </tr>
                  <tr>
                    <td className="py-2.5 pr-4 text-foreground font-medium">Twilio</td>
                    <td className="py-2.5 pr-4">SMS notifications</td>
                    <td className="py-2.5">Phone number, notification content</td>
                  </tr>
                  <tr>
                    <td className="py-2.5 pr-4 text-foreground font-medium">Resend</td>
                    <td className="py-2.5 pr-4">Transactional email delivery</td>
                    <td className="py-2.5">Email address, notification content</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>

          {/* Section 4 */}
          <section>
            <h2 className="text-base font-semibold text-foreground mb-3">
              4. Data Retention
            </h2>
            <p>
              We retain your account data for as long as your account is active. Telemetry
              aggregates are retained for 90 days. Upon account deletion, all personally identifiable
              information is removed within 30 days, and telemetry data is anonymized and retained
              for statistical purposes only.
            </p>
          </section>

          {/* Section 5 */}
          <section>
            <h2 className="text-base font-semibold text-foreground mb-3">
              5. Your Rights (GDPR/CCPA)
            </h2>
            <p>
              Depending on your jurisdiction, you may have the following rights regarding your
              personal data:
            </p>
            <ul className="list-disc list-inside mt-3 space-y-1.5">
              <li>
                <span className="text-foreground font-medium">Right to access:</span> Request a copy
                of all personal data we hold about you.
              </li>
              <li>
                <span className="text-foreground font-medium">Right to rectification:</span> Request
                correction of inaccurate personal data.
              </li>
              <li>
                <span className="text-foreground font-medium">Right to erasure:</span> Request
                deletion of your personal data ("right to be forgotten").
              </li>
              <li>
                <span className="text-foreground font-medium">Right to portability:</span> Receive
                your data in a structured, commonly used, machine-readable format.
              </li>
              <li>
                <span className="text-foreground font-medium">Right to opt out:</span> California
                residents may opt out of the "sale" of personal information under CCPA.
              </li>
            </ul>
            <p className="mt-3">
              To exercise any of these rights, send a request to{" "}
              <span className="text-foreground font-medium">privacy@swarme.io</span>. We will
              respond within 30 days. For GDPR requests, our Data Protection Officer can be reached
              at the same email address.
            </p>
          </section>

          {/* Section 6 */}
          <section>
            <h2 className="text-base font-semibold text-foreground mb-3">
              6. Cookies & Tracking
            </h2>
            <p>
              Swarme uses essential cookies for authentication and session management. Analytics
              cookies are only activated after you grant consent through our cookie banner. We do not
              use third-party advertising cookies. Our telemetry script respects the{" "}
              <code className="text-xs bg-muted px-1 py-0.5 rounded">
                window.userConsentGranted
              </code>{" "}
              flag and will not collect data until consent is given.
            </p>
          </section>

          {/* Section 7 */}
          <section>
            <h2 className="text-base font-semibold text-foreground mb-3">
              7. Changes to This Policy
            </h2>
            <p>
              We may update this Privacy Policy from time to time. We will notify you of material
              changes by posting the updated policy on our website and, where appropriate, by sending
              you an email notification. Your continued use of the Service after changes constitutes
              acceptance of the revised policy.
            </p>
          </section>

          {/* Section 8 */}
          <section>
            <h2 className="text-base font-semibold text-foreground mb-3">
              8. Contact
            </h2>
            <p>
              For questions or concerns about this Privacy Policy, contact us at{" "}
              <span className="text-foreground font-medium">privacy@swarme.io</span>.
            </p>
          </section>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-border/40 py-6 mt-12">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 text-center">
          <p className="text-xs text-muted-foreground">
            &copy; {new Date().getFullYear()} Swarme. All rights reserved.
          </p>
        </div>
      </footer>
    </div>
  );
}
