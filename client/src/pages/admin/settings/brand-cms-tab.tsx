/**
 * Brand & CMS Tab — Phase 31.3b
 *
 * Top section: Site settings form (site_name, logo_url, favicon_url,
 * hero_headline, hero_subheadline, seo metadata).
 * Bottom section: CMS posts DataTable with type filter tabs + create/edit dialog.
 */

import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DataTable, type DataColumn } from "@/components/admin/data-table";
import { useToast } from "@/hooks/use-toast";
import { Save, Plus, Pencil, Trash2, Globe, FileText, HelpCircle, Sparkles, Link2, Building2 } from "lucide-react";

interface SiteSettings {
  site_name: string;
  logo_url: string;
  favicon_url: string;
  maintenance_mode: boolean;
  hero_headline: string;
  hero_subheadline: string;
  social_links: { twitter: string; linkedin: string; github: string };
  seo_metadata: { title: string; description: string; og_image: string };
}

interface FooterLink {
  label: string;
  href: string;
  external: boolean;
  visible: boolean;
}

interface FooterColumn {
  title: string;
  links: FooterLink[];
}

interface CompanyInfo {
  mission: string;
  support_email: string;
  address: string;
  social: { x: string; linkedin: string; discord: string };
}

interface FooterConfig {
  columns: FooterColumn[];
  company_info: CompanyInfo;
}

interface CmsPost {
  id: string;
  type: string;
  title: string;
  content: string;
  slug: string;
  published: number;
  author_id: string;
  created_at: string;
  updated_at: string;
}

const CMS_TYPE_ICONS: Record<string, typeof FileText> = {
  blog: FileText,
  faq: HelpCircle,
  feature: Sparkles,
};

const CMS_TYPES = ["all", "blog", "faq", "feature"] as const;

export function BrandCmsTab() {
  const { toast } = useToast();
  const [cmsFilter, setCmsFilter] = useState<string>("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingPost, setEditingPost] = useState<CmsPost | null>(null);

  // ── Site Settings ──
  const settingsQuery = useQuery<{ success: boolean; settings: SiteSettings }>({
    queryKey: ["/api/admin/settings/site"],
  });

  const [form, setForm] = useState<Partial<SiteSettings>>({});
  const settings = settingsQuery.data?.settings;

  // Merge fetched settings with local edits
  const currentSettings = { ...settings, ...form } as SiteSettings;

  const saveSettings = useMutation({
    mutationFn: async (data: Partial<SiteSettings>) => {
      const res = await apiRequest("POST", "/api/admin/settings/site", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/settings/site"] });
      queryClient.invalidateQueries({ queryKey: ["/api/public/settings"] });
      setForm({});
      toast({ title: "Settings saved" });
    },
  });

  // ── CMS Posts ──
  const postsQuery = useQuery<{ success: boolean; posts: CmsPost[] }>({
    queryKey: ["/api/admin/cms/posts"],
  });

  const allPosts = postsQuery.data?.posts || [];
  const filteredPosts = cmsFilter === "all" ? allPosts : allPosts.filter((p) => p.type === cmsFilter);

  const createPost = useMutation({
    mutationFn: async (data: Partial<CmsPost>) => {
      const res = await apiRequest("POST", "/api/admin/cms/posts", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/cms/posts"] });
      setDialogOpen(false);
      setEditingPost(null);
      toast({ title: "Post created" });
    },
  });

  const updatePost = useMutation({
    mutationFn: async ({ id, ...data }: Partial<CmsPost> & { id: string }) => {
      const res = await apiRequest("PATCH", `/api/admin/cms/posts/${id}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/cms/posts"] });
      setDialogOpen(false);
      setEditingPost(null);
      toast({ title: "Post updated" });
    },
  });

  const deletePost = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/admin/cms/posts/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/cms/posts"] });
      toast({ title: "Post deleted" });
    },
  });

  const postColumns: DataColumn<CmsPost>[] = [
    {
      key: "type",
      label: "Type",
      render: (row) => {
        const Icon = CMS_TYPE_ICONS[row.type] || FileText;
        return (
          <div className="flex items-center gap-1.5">
            <Icon className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="capitalize">{row.type}</span>
          </div>
        );
      },
    },
    { key: "title", label: "Title" },
    { key: "slug", label: "Slug", render: (row) => <code className="text-[11px] text-muted-foreground">/{row.slug}</code> },
    {
      key: "published",
      label: "Status",
      render: (row) =>
        row.published ? (
          <Badge className="bg-emerald-500/10 text-emerald-400 border-emerald-500/20 text-[10px]">Published</Badge>
        ) : (
          <Badge variant="secondary" className="text-[10px]">Draft</Badge>
        ),
    },
    {
      key: "updated_at",
      label: "Updated",
      render: (row) => new Date(row.updated_at).toLocaleDateString(),
    },
    {
      key: "actions",
      label: "",
      excludeFromExport: true,
      render: (row) => (
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0"
            onClick={() => { setEditingPost(row); setDialogOpen(true); }}
            data-testid={`button-edit-post-${row.id}`}
          >
            <Pencil className="h-3 w-3" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0 text-destructive hover:text-destructive"
            onClick={() => deletePost.mutate(row.id)}
            disabled={deletePost.isPending}
            data-testid={`button-delete-post-${row.id}`}
          >
            <Trash2 className="h-3 w-3" />
          </Button>
        </div>
      ),
    },
  ];

  const handleSettingsField = (key: string, value: any) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleSeoField = (key: string, value: string) => {
    setForm((prev) => ({
      ...prev,
      seo_metadata: { ...currentSettings.seo_metadata, ...(prev.seo_metadata || {}), [key]: value },
    }));
  };

  return (
    <div className="space-y-8">
      {/* ── Site Settings Form ── */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold">Brand Settings</h3>
            <p className="text-xs text-muted-foreground mt-0.5">Site identity, hero content, and SEO metadata</p>
          </div>
          <Button
            size="sm"
            className="h-8 text-xs gap-1.5"
            onClick={() => saveSettings.mutate(form)}
            disabled={saveSettings.isPending || Object.keys(form).length === 0}
            data-testid="button-save-settings"
          >
            <Save className="h-3 w-3" />
            {saveSettings.isPending ? "Saving..." : "Save Changes"}
          </Button>
        </div>

        {settings && (
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs">Site Name</Label>
              <Input
                value={currentSettings.site_name}
                onChange={(e) => handleSettingsField("site_name", e.target.value)}
                className="h-8 text-xs"
                data-testid="input-site-name"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Logo URL</Label>
              <Input
                value={currentSettings.logo_url}
                onChange={(e) => handleSettingsField("logo_url", e.target.value)}
                className="h-8 text-xs"
                placeholder="https://..."
                data-testid="input-logo-url"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Favicon URL</Label>
              <Input
                value={currentSettings.favicon_url}
                onChange={(e) => handleSettingsField("favicon_url", e.target.value)}
                className="h-8 text-xs"
                placeholder="https://..."
                data-testid="input-favicon-url"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">SEO Title</Label>
              <Input
                value={currentSettings.seo_metadata?.title || ""}
                onChange={(e) => handleSeoField("title", e.target.value)}
                className="h-8 text-xs"
                data-testid="input-seo-title"
              />
            </div>
            <div className="col-span-2 space-y-1.5">
              <Label className="text-xs">Hero Headline</Label>
              <Input
                value={currentSettings.hero_headline}
                onChange={(e) => handleSettingsField("hero_headline", e.target.value)}
                className="h-8 text-xs"
                data-testid="input-hero-headline"
              />
            </div>
            <div className="col-span-2 space-y-1.5">
              <Label className="text-xs">Hero Subheadline</Label>
              <Textarea
                value={currentSettings.hero_subheadline}
                onChange={(e) => handleSettingsField("hero_subheadline", e.target.value)}
                className="text-xs min-h-[60px] resize-none"
                data-testid="input-hero-subheadline"
              />
            </div>
            <div className="col-span-2 space-y-1.5">
              <Label className="text-xs">SEO Description</Label>
              <Textarea
                value={currentSettings.seo_metadata?.description || ""}
                onChange={(e) => handleSeoField("description", e.target.value)}
                className="text-xs min-h-[60px] resize-none"
                data-testid="input-seo-description"
              />
            </div>
          </div>
        )}
      </section>

      {/* ── Footer Management ── */}
      <FooterManagement />

      {/* ── CMS Posts ── */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {CMS_TYPES.map((type) => (
              <Button
                key={type}
                variant={cmsFilter === type ? "default" : "outline"}
                size="sm"
                className="h-7 text-xs capitalize"
                onClick={() => setCmsFilter(type)}
                data-testid={`button-cms-filter-${type}`}
              >
                {type === "all" ? "All Posts" : type}
                {type !== "all" && (
                  <Badge variant="secondary" className="ml-1.5 text-[9px] h-4 px-1">
                    {allPosts.filter((p) => p.type === type).length}
                  </Badge>
                )}
              </Button>
            ))}
          </div>
          <Dialog open={dialogOpen} onOpenChange={(v) => { setDialogOpen(v); if (!v) setEditingPost(null); }}>
            <DialogTrigger asChild>
              <Button size="sm" className="h-7 text-xs gap-1.5" data-testid="button-create-post">
                <Plus className="h-3 w-3" />
                New Post
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-lg">
              <DialogHeader>
                <DialogTitle className="text-sm">{editingPost ? "Edit Post" : "New Post"}</DialogTitle>
              </DialogHeader>
              <PostForm
                post={editingPost}
                onSubmit={(data) => {
                  if (editingPost) {
                    updatePost.mutate({ id: editingPost.id, ...data });
                  } else {
                    createPost.mutate(data);
                  }
                }}
                isPending={createPost.isPending || updatePost.isPending}
              />
            </DialogContent>
          </Dialog>
        </div>

        <DataTable
          data={filteredPosts}
          columns={postColumns}
          exportFilename="cms-posts"
          searchPlaceholder="Search posts..."
          pageSize={10}
        />
      </section>
    </div>
  );
}

/** Footer Management sub-component */
function FooterManagement() {
  const { toast } = useToast();

  const footerQuery = useQuery<{ success: boolean; footer: FooterConfig }>({
    queryKey: ["/api/admin/footer"],
  });

  const footer = footerQuery.data?.footer;
  const [companyForm, setCompanyForm] = useState<Partial<CompanyInfo>>({});
  const [linkEdits, setLinkEdits] = useState<FooterColumn[] | null>(null);

  // Merge fetched with local edits
  const currentCompany = { ...footer?.company_info, ...companyForm } as CompanyInfo;
  const currentColumns = linkEdits ?? footer?.columns ?? [];

  const saveFooter = useMutation({
    mutationFn: async (data: Partial<FooterConfig>) => {
      const res = await apiRequest("POST", "/api/admin/footer", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/footer"] });
      queryClient.invalidateQueries({ queryKey: ["/api/public/footer"] });
      setCompanyForm({});
      setLinkEdits(null);
      toast({ title: "Footer saved" });
    },
  });

  const isDirty = Object.keys(companyForm).length > 0 || linkEdits !== null;

  const handleCompanyField = (key: string, value: string) => {
    setCompanyForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleSocialField = (key: string, value: string) => {
    setCompanyForm((prev) => ({
      ...prev,
      social: { ...currentCompany.social, ...(prev.social || {}), [key]: value },
    }));
  };

  const handleLinkField = (colIdx: number, linkIdx: number, field: keyof FooterLink, value: string | boolean) => {
    const cols = JSON.parse(JSON.stringify(currentColumns)) as FooterColumn[];
    (cols[colIdx].links[linkIdx] as any)[field] = value;
    setLinkEdits(cols);
  };

  const handleColumnTitle = (colIdx: number, value: string) => {
    const cols = JSON.parse(JSON.stringify(currentColumns)) as FooterColumn[];
    cols[colIdx].title = value;
    setLinkEdits(cols);
  };

  const addLink = (colIdx: number) => {
    const cols = JSON.parse(JSON.stringify(currentColumns)) as FooterColumn[];
    cols[colIdx].links.push({ label: "New Link", href: "/", external: false, visible: true });
    setLinkEdits(cols);
  };

  const removeLink = (colIdx: number, linkIdx: number) => {
    const cols = JSON.parse(JSON.stringify(currentColumns)) as FooterColumn[];
    cols[colIdx].links.splice(linkIdx, 1);
    setLinkEdits(cols);
  };

  const handleSave = () => {
    saveFooter.mutate({
      columns: currentColumns,
      company_info: currentCompany,
    });
  };

  if (!footer) return null;

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold flex items-center gap-1.5">
            <Link2 className="h-3.5 w-3.5" />
            Footer Management
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">Footer links, company info, and social accounts</p>
        </div>
        <Button
          size="sm"
          className="h-8 text-xs gap-1.5"
          onClick={handleSave}
          disabled={saveFooter.isPending || !isDirty}
          data-testid="button-save-footer"
        >
          <Save className="h-3 w-3" />
          {saveFooter.isPending ? "Saving..." : "Save Footer"}
        </Button>
      </div>

      {/* Company info */}
      <div className="border border-border/60 rounded-lg p-4 space-y-3">
        <div className="flex items-center gap-1.5 text-xs font-medium text-foreground">
          <Building2 className="h-3.5 w-3.5" />
          Company Info
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2 space-y-1.5">
            <Label className="text-xs">Mission Statement</Label>
            <Input
              value={currentCompany.mission || ""}
              onChange={(e) => handleCompanyField("mission", e.target.value)}
              className="h-8 text-xs"
              data-testid="input-footer-mission"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Support Email</Label>
            <Input
              value={currentCompany.support_email || ""}
              onChange={(e) => handleCompanyField("support_email", e.target.value)}
              className="h-8 text-xs"
              data-testid="input-footer-email"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Address</Label>
            <Input
              value={currentCompany.address || ""}
              onChange={(e) => handleCompanyField("address", e.target.value)}
              className="h-8 text-xs"
              data-testid="input-footer-address"
            />
          </div>
        </div>
        {/* Social links */}
        <div className="grid grid-cols-3 gap-3">
          <div className="space-y-1.5">
            <Label className="text-xs">X (Twitter)</Label>
            <Input
              value={currentCompany.social?.x || ""}
              onChange={(e) => handleSocialField("x", e.target.value)}
              className="h-8 text-xs"
              placeholder="https://x.com/..."
              data-testid="input-footer-social-x"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">LinkedIn</Label>
            <Input
              value={currentCompany.social?.linkedin || ""}
              onChange={(e) => handleSocialField("linkedin", e.target.value)}
              className="h-8 text-xs"
              placeholder="https://linkedin.com/..."
              data-testid="input-footer-social-linkedin"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Discord</Label>
            <Input
              value={currentCompany.social?.discord || ""}
              onChange={(e) => handleSocialField("discord", e.target.value)}
              className="h-8 text-xs"
              placeholder="https://discord.gg/..."
              data-testid="input-footer-social-discord"
            />
          </div>
        </div>
      </div>

      {/* Footer columns / links */}
      <div className="space-y-3">
        {currentColumns.map((col, colIdx) => (
          <div key={colIdx} className="border border-border/60 rounded-lg p-3 space-y-2">
            <div className="flex items-center gap-2">
              <Input
                value={col.title}
                onChange={(e) => handleColumnTitle(colIdx, e.target.value)}
                className="h-7 text-xs font-medium w-48"
                data-testid={`input-footer-col-title-${colIdx}`}
              />
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs gap-1 ml-auto"
                onClick={() => addLink(colIdx)}
                data-testid={`button-footer-add-link-${colIdx}`}
              >
                <Plus className="h-3 w-3" />
                Add
              </Button>
            </div>
            <div className="space-y-1.5">
              {col.links.map((link, linkIdx) => (
                <div key={linkIdx} className="flex items-center gap-2">
                  <Input
                    value={link.label}
                    onChange={(e) => handleLinkField(colIdx, linkIdx, "label", e.target.value)}
                    className="h-7 text-xs w-32"
                    placeholder="Label"
                  />
                  <Input
                    value={link.href}
                    onChange={(e) => handleLinkField(colIdx, linkIdx, "href", e.target.value)}
                    className="h-7 text-xs flex-1 font-mono"
                    placeholder="/path or https://..."
                  />
                  <div className="flex items-center gap-1.5">
                    <Switch
                      checked={link.visible !== false}
                      onCheckedChange={(v) => handleLinkField(colIdx, linkIdx, "visible", v)}
                      className="scale-75"
                    />
                    <span className="text-[10px] text-muted-foreground w-7">
                      {link.visible !== false ? "On" : "Off"}
                    </span>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                    onClick={() => removeLink(colIdx, linkIdx)}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

/** Post create/edit form */
function PostForm({
  post,
  onSubmit,
  isPending,
}: {
  post: CmsPost | null;
  onSubmit: (data: Partial<CmsPost>) => void;
  isPending: boolean;
}) {
  const [type, setType] = useState(post?.type || "blog");
  const [title, setTitle] = useState(post?.title || "");
  const [slug, setSlug] = useState(post?.slug || "");
  const [content, setContent] = useState(post?.content || "");
  const [published, setPublished] = useState(post ? !!post.published : false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({ type, title, slug, content, published: published ? 1 : 0 });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label className="text-xs">Type</Label>
          <Select value={type} onValueChange={setType}>
            <SelectTrigger className="h-8 text-xs" data-testid="select-post-type">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="blog">Blog</SelectItem>
              <SelectItem value="faq">FAQ</SelectItem>
              <SelectItem value="feature">Feature</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5 flex items-end gap-2 pb-0.5">
          <div className="flex items-center gap-2">
            <Switch
              checked={published}
              onCheckedChange={setPublished}
              data-testid="switch-published"
            />
            <Label className="text-xs">{published ? "Published" : "Draft"}</Label>
          </div>
        </div>
      </div>
      <div className="space-y-1.5">
        <Label className="text-xs">Title</Label>
        <Input
          value={title}
          onChange={(e) => {
            setTitle(e.target.value);
            if (!post) setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9]+/g, "-"));
          }}
          className="h-8 text-xs"
          required
          data-testid="input-post-title"
        />
      </div>
      <div className="space-y-1.5">
        <Label className="text-xs">Slug</Label>
        <div className="flex items-center gap-1.5">
          <Globe className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          <Input
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
            className="h-8 text-xs font-mono"
            data-testid="input-post-slug"
          />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label className="text-xs">Content</Label>
        <Textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          className="text-xs min-h-[100px] resize-none"
          data-testid="input-post-content"
        />
      </div>
      <Button type="submit" size="sm" className="w-full h-8 text-xs" disabled={isPending} data-testid="button-submit-post">
        {isPending ? "Saving..." : post ? "Update Post" : "Create Post"}
      </Button>
    </form>
  );
}
