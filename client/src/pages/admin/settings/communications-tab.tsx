/**
 * Communications Tab — Phase 31.3c
 *
 * Social links editor, newsletter broadcast form, and email template previews.
 */

import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Save, Send, Twitter, Linkedin, Github, Mail, FileCode } from "lucide-react";

interface SiteSettings {
  social_links: { twitter: string; linkedin: string; github: string };
  [key: string]: any;
}

const EMAIL_TEMPLATES = [
  { id: "welcome", name: "Welcome Email", subject: "Welcome to Swarme", description: "Sent to new users after signup" },
  { id: "winback", name: "Win-Back Nudge", subject: "We miss you at Swarme", description: "3-tier re-engagement sequence" },
  { id: "invoice", name: "Invoice Receipt", subject: "Your Swarme Receipt", description: "Sent after successful payment" },
  { id: "magic_link", name: "Magic Login", subject: "Your login link", description: "Passwordless authentication email" },
];

export function CommunicationsTab() {
  const { toast } = useToast();

  // ── Social Links ──
  const settingsQuery = useQuery<{ success: boolean; settings: SiteSettings }>({
    queryKey: ["/api/admin/settings/site"],
  });
  const socialLinks = settingsQuery.data?.settings?.social_links || { twitter: "", linkedin: "", github: "" };
  const [localLinks, setLocalLinks] = useState<Record<string, string>>({});
  const mergedLinks = { ...socialLinks, ...localLinks };

  const saveSocial = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/admin/settings/site", { social_links: mergedLinks });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/settings/site"] });
      setLocalLinks({});
      toast({ title: "Social links saved" });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to save social links.", variant: "destructive" });
    },
  });

  // ── Newsletter ──
  const [nlSubject, setNlSubject] = useState("");
  const [nlBody, setNlBody] = useState("");

  const sendNewsletter = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/admin/communications/newsletter", {
        subject: nlSubject,
        html_body: nlBody,
      });
      return res.json();
    },
    onSuccess: (data: any) => {
      toast({ title: "Newsletter queued", description: `Sent to ${data.recipient_count} active users` });
      setNlSubject("");
      setNlBody("");
    },
    onError: (err: Error) => {
      toast({ title: "Failed", description: err.message, variant: "destructive" });
    },
  });

  return (
    <div className="space-y-8">
      {/* ── Social Links ── */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold">Social Links</h3>
            <p className="text-xs text-muted-foreground mt-0.5">Displayed in site footer and SEO metadata</p>
          </div>
          <Button
            size="sm"
            className="h-8 text-xs gap-1.5"
            onClick={() => saveSocial.mutate()}
            disabled={saveSocial.isPending || Object.keys(localLinks).length === 0}
            data-testid="button-save-social"
          >
            <Save className="h-3 w-3" />
            Save
          </Button>
        </div>
        <div className="grid grid-cols-1 gap-3 max-w-lg">
          {([
            { key: "twitter", icon: Twitter, label: "Twitter / X", placeholder: "https://x.com/..." },
            { key: "linkedin", icon: Linkedin, label: "LinkedIn", placeholder: "https://linkedin.com/company/..." },
            { key: "github", icon: Github, label: "GitHub", placeholder: "https://github.com/..." },
          ] as const).map(({ key, icon: Icon, label, placeholder }) => (
            <div key={key} className="space-y-1.5">
              <Label className="text-xs flex items-center gap-1.5">
                <Icon className="h-3 w-3" />
                {label}
              </Label>
              <Input
                value={mergedLinks[key] || ""}
                onChange={(e) => setLocalLinks((prev) => ({ ...prev, [key]: e.target.value }))}
                placeholder={placeholder}
                className="h-8 text-xs"
                data-testid={`input-social-${key}`}
              />
            </div>
          ))}
        </div>
      </section>

      {/* ── Newsletter Broadcast ── */}
      <section className="space-y-4">
        <div>
          <h3 className="text-sm font-semibold">Newsletter Broadcast</h3>
          <p className="text-xs text-muted-foreground mt-0.5">Send a one-time email to all active users</p>
        </div>
        <div className="max-w-lg space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Subject Line</Label>
            <Input
              value={nlSubject}
              onChange={(e) => setNlSubject(e.target.value)}
              className="h-8 text-xs"
              placeholder="March 2026 Product Update"
              data-testid="input-newsletter-subject"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">HTML Body</Label>
            <Textarea
              value={nlBody}
              onChange={(e) => setNlBody(e.target.value)}
              className="text-xs min-h-[120px] font-mono resize-none"
              placeholder="<h1>Hello {{name}}</h1>..."
              data-testid="input-newsletter-body"
            />
          </div>
          <Button
            size="sm"
            className="h-8 text-xs gap-1.5"
            onClick={() => sendNewsletter.mutate()}
            disabled={sendNewsletter.isPending || !nlSubject || !nlBody}
            data-testid="button-send-newsletter"
          >
            <Send className="h-3 w-3" />
            {sendNewsletter.isPending ? "Sending..." : "Send Newsletter"}
          </Button>
        </div>
      </section>

      {/* ── Email Templates ── */}
      <section className="space-y-4">
        <div>
          <h3 className="text-sm font-semibold">Email Templates</h3>
          <p className="text-xs text-muted-foreground mt-0.5">Transactional email templates (read-only preview)</p>
        </div>
        <div className="grid grid-cols-2 gap-3">
          {EMAIL_TEMPLATES.map((tpl) => (
            <Card key={tpl.id} className="bg-muted/30" data-testid={`card-template-${tpl.id}`}>
              <CardHeader className="pb-2 pt-3 px-4">
                <CardTitle className="text-xs font-medium flex items-center gap-1.5">
                  <Mail className="h-3 w-3 text-muted-foreground" />
                  {tpl.name}
                </CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-3 space-y-1">
                <p className="text-[11px] text-muted-foreground">{tpl.description}</p>
                <div className="flex items-center gap-1.5">
                  <FileCode className="h-3 w-3 text-muted-foreground" />
                  <code className="text-[10px] text-muted-foreground">{tpl.subject}</code>
                </div>
                <Badge variant="secondary" className="text-[9px] mt-1">Template</Badge>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>
    </div>
  );
}
