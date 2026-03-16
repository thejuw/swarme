/**
 * terms-of-service.tsx — Phase 28: Terms of Service
 *
 * Static legal page at /#/terms with standard boilerplate.
 * Uses Tailwind prose typography for clean readability.
 */

import { useLocation } from "wouter";
import { SwarmeLogo } from "@/components/swarme-logo";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";

export default function TermsOfService() {
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
            data-testid="button-terms-back"
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
        <h1 className="text-2xl font-bold tracking-tight mb-2" data-testid="text-terms-title">
          Terms of Service
        </h1>
        <p className="text-sm text-muted-foreground mb-8">
          Last updated: March 15, 2026
        </p>

        <div className="space-y-8 text-sm leading-relaxed text-muted-foreground">
          {/* Section 1 */}
          <section>
            <h2 className="text-base font-semibold text-foreground mb-3">
              1. Acceptance of Terms
            </h2>
            <p>
              By accessing or using the Swarme platform ("Service"), you agree to be bound by
              these Terms of Service ("Terms"). If you do not agree to all of these Terms, you may
              not access or use the Service. We reserve the right to update these Terms at any time.
              Your continued use of the Service after any changes constitutes acceptance of the
              revised Terms.
            </p>
          </section>

          {/* Section 2 */}
          <section>
            <h2 className="text-base font-semibold text-foreground mb-3">
              2. AI Autonomy & Limitation of Liability
            </h2>
            <p>
              The Swarme platform utilizes artificial intelligence to suggest and execute changes
              to your website. We do not guarantee specific search engine rankings or revenue
              increases. You are solely responsible for reviewing changes. We are not liable for lost
              profits, data loss, or SEO penalties.
            </p>
            <p className="mt-3">
              All AI-generated content suggestions and optimizations are provided on an "as-is" basis.
              The platform operates autonomously within the parameters you configure, but final
              approval of published content remains your responsibility. Swarme shall not be held
              liable for any direct, indirect, incidental, special, consequential, or punitive damages
              arising from the use of AI-generated recommendations.
            </p>
          </section>

          {/* Section 3 */}
          <section>
            <h2 className="text-base font-semibold text-foreground mb-3">
              3. Data Access & API Usage
            </h2>
            <p>
              When you connect your e-commerce store (Shopify, WooCommerce, or other supported
              platforms), you grant Swarme limited, scoped API access to read and modify content
              as necessary for the Service to function. This includes, but is not limited to:
            </p>
            <ul className="list-disc list-inside mt-3 space-y-1.5">
              <li>Reading product listings, blog posts, and page metadata</li>
              <li>Writing and updating SEO-related fields (titles, descriptions, meta tags)</li>
              <li>Accessing analytics and performance metrics from your store</li>
              <li>Reading theme templates for technical SEO audit purposes</li>
            </ul>
            <p className="mt-3">
              You may revoke API access at any time through your store's application management
              settings. Revoking access will disable the autonomous features of the Service but will
              not delete your account or stored configuration data.
            </p>
          </section>

          {/* Section 4 */}
          <section>
            <h2 className="text-base font-semibold text-foreground mb-3">
              4. Account Responsibilities
            </h2>
            <p>
              You are responsible for maintaining the confidentiality of your account credentials and
              for all activities that occur under your account. You agree to notify us immediately of
              any unauthorized use. Swarme reserves the right to suspend or terminate accounts
              that violate these Terms.
            </p>
          </section>

          {/* Section 5 */}
          <section>
            <h2 className="text-base font-semibold text-foreground mb-3">
              5. Subscription & Billing
            </h2>
            <p>
              The Service is offered on a subscription basis. Billing occurs at the start of each
              billing cycle. You may cancel your subscription at any time; cancellation takes effect
              at the end of the current billing period. Refunds are handled in accordance with our
              refund policy available on the billing settings page.
            </p>
          </section>

          {/* Section 6 */}
          <section>
            <h2 className="text-base font-semibold text-foreground mb-3">
              6. Intellectual Property
            </h2>
            <p>
              All content generated by the AI agents remains your intellectual property once published
              to your store. The Swarme platform, its underlying technology, algorithms, and
              proprietary methods remain the exclusive property of Swarme and its licensors.
            </p>
          </section>

          {/* Section 7 */}
          <section>
            <h2 className="text-base font-semibold text-foreground mb-3">
              7. Governing Law
            </h2>
            <p>
              These Terms shall be governed by and construed in accordance with the laws of the State
              of Texas. Any disputes arising under or in connection with these Terms shall be subject
              to the exclusive jurisdiction of the courts located in the State of Texas.
            </p>
          </section>

          {/* Section 8 */}
          <section>
            <h2 className="text-base font-semibold text-foreground mb-3">
              8. Contact
            </h2>
            <p>
              If you have questions about these Terms, please contact us at{" "}
              <span className="text-foreground font-medium">legal@swarme.io</span>.
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
