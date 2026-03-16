/**
 * contact.tsx — Public Contact page
 *
 * Contact form + support channels info.
 * Matches legal pages pattern: sticky header + prose layout + Footer.
 */

import { useState } from "react";
import { useLocation } from "wouter";
import { SwarmeLogo } from "@/components/swarme-logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Footer } from "@/components/footer";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Mail, MessageSquare, Clock } from "lucide-react";

export default function ContactPage() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSubmitting(true);
    setTimeout(() => {
      setSubmitting(false);
      toast({ title: "Message sent", description: "We'll get back to you within 24 hours." });
      (e.target as HTMLFormElement).reset();
    }, 1200);
  };

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-border/40 bg-background/80 backdrop-blur-md">
        <div className="max-w-3xl mx-auto flex items-center gap-3 px-4 sm:px-6 h-14">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate("/")}
            data-testid="button-contact-back"
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
      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-12 flex-1">
        <h1 className="text-2xl font-bold tracking-tight mb-2" data-testid="text-contact-title">
          Contact Us
        </h1>
        <p className="text-sm text-muted-foreground mb-10">
          Have a question or need help? We'd love to hear from you.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-10">
          {/* Contact Form */}
          <div className="md:col-span-2">
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Name</Label>
                  <Input
                    className="h-9 text-sm"
                    placeholder="Your name"
                    required
                    data-testid="input-contact-name"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Email</Label>
                  <Input
                    type="email"
                    className="h-9 text-sm"
                    placeholder="you@company.com"
                    required
                    data-testid="input-contact-email"
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Subject</Label>
                <Input
                  className="h-9 text-sm"
                  placeholder="How can we help?"
                  required
                  data-testid="input-contact-subject"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Message</Label>
                <Textarea
                  className="text-sm min-h-[120px] resize-none"
                  placeholder="Tell us more..."
                  required
                  data-testid="input-contact-message"
                />
              </div>
              <Button
                type="submit"
                className="h-9 text-sm"
                disabled={submitting}
                data-testid="button-contact-submit"
              >
                {submitting ? "Sending..." : "Send Message"}
              </Button>
            </form>
          </div>

          {/* Sidebar info */}
          <div className="space-y-6 text-sm text-muted-foreground">
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-foreground">
                <Mail className="h-4 w-4 text-primary" />
                <span className="font-medium text-sm">Email</span>
              </div>
              <p className="text-xs">
                <a href="mailto:support@swarme.io" className="text-primary hover:underline">
                  support@swarme.io
                </a>
              </p>
              <p className="text-xs">General inquiries and billing questions.</p>
            </div>

            <div className="space-y-2">
              <div className="flex items-center gap-2 text-foreground">
                <MessageSquare className="h-4 w-4 text-primary" />
                <span className="font-medium text-sm">Discord Community</span>
              </div>
              <p className="text-xs">
                <a
                  href="https://discord.gg/swarme"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline"
                >
                  discord.gg/swarme
                </a>
              </p>
              <p className="text-xs">Real-time help from the team and community.</p>
            </div>

            <div className="space-y-2">
              <div className="flex items-center gap-2 text-foreground">
                <Clock className="h-4 w-4 text-primary" />
                <span className="font-medium text-sm">Response Time</span>
              </div>
              <p className="text-xs">
                We typically respond within 24 hours on business days. Enterprise
                customers receive priority support with a 4-hour SLA.
              </p>
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <div style={{ background: "#0d1117" }}>
        <Footer />
      </div>
    </div>
  );
}
