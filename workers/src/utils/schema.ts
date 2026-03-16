// ─────────────────────────────────────────────────────────────
// GEO JSON-LD Schema Generator
// Produces structured data for AI-engine citation optimization
// ─────────────────────────────────────────────────────────────

export type SchemaContentType = "Article" | "FAQPage" | "Product" | "HowTo" | "WebPage";

export interface ArticlePayload {
  headline: string;
  description: string;
  datePublished: string;
  dateModified?: string;
  authorName: string;
  authorUrl?: string;
  imageUrl?: string;
  publisherName: string;
  publisherLogoUrl?: string;
  url: string;
  wordCount?: number;
  keywords?: string[];
}

export interface FAQItem {
  question: string;
  answer: string;
}

export interface FAQPagePayload {
  faqs: FAQItem[];
  url: string;
  title?: string;
}

export interface ProductPayload {
  name: string;
  description: string;
  imageUrl?: string;
  brand: string;
  sku?: string;
  price: string;
  priceCurrency: string;
  availability?: "InStock" | "OutOfStock" | "PreOrder";
  url: string;
  ratingValue?: number;
  reviewCount?: number;
}

export interface HowToStep {
  name: string;
  text: string;
  imageUrl?: string;
}

export interface HowToPayload {
  name: string;
  description: string;
  steps: HowToStep[];
  totalTime?: string; // ISO 8601 duration e.g. "PT30M"
  imageUrl?: string;
  url: string;
}

export interface WebPagePayload {
  name: string;
  description: string;
  url: string;
  datePublished?: string;
  dateModified?: string;
}

type ContentPayloadMap = {
  Article: ArticlePayload;
  FAQPage: FAQPagePayload;
  Product: ProductPayload;
  HowTo: HowToPayload;
  WebPage: WebPagePayload;
};

/**
 * Generate GEO-optimized JSON-LD structured data.
 * Returns a stringified <script type="application/ld+json"> block
 * ready for HTMLRewriter injection into <head>.
 */
export function generateGeoSchema<T extends SchemaContentType>(
  contentType: T,
  payload: ContentPayloadMap[T]
): string {
  let schema: Record<string, any>;

  switch (contentType) {
    case "Article":
      schema = buildArticleSchema(payload as ArticlePayload);
      break;
    case "FAQPage":
      schema = buildFAQPageSchema(payload as FAQPagePayload);
      break;
    case "Product":
      schema = buildProductSchema(payload as ProductPayload);
      break;
    case "HowTo":
      schema = buildHowToSchema(payload as HowToPayload);
      break;
    case "WebPage":
    default:
      schema = buildWebPageSchema(payload as WebPagePayload);
      break;
  }

  return `<script type="application/ld+json">${JSON.stringify(schema)}</script>`;
}

// ─────────────────────────────────────────────────────────────
// Schema Builders
// ─────────────────────────────────────────────────────────────

function buildArticleSchema(p: ArticlePayload): Record<string, any> {
  const schema: Record<string, any> = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: p.headline,
    description: p.description,
    datePublished: p.datePublished,
    url: p.url,
    author: {
      "@type": "Person",
      name: p.authorName,
    },
    publisher: {
      "@type": "Organization",
      name: p.publisherName,
    },
  };

  if (p.dateModified) schema.dateModified = p.dateModified;
  if (p.authorUrl) schema.author.url = p.authorUrl;
  if (p.imageUrl) schema.image = p.imageUrl;
  if (p.wordCount) schema.wordCount = p.wordCount;
  if (p.keywords && p.keywords.length > 0) schema.keywords = p.keywords.join(", ");

  if (p.publisherLogoUrl) {
    schema.publisher.logo = {
      "@type": "ImageObject",
      url: p.publisherLogoUrl,
    };
  }

  return schema;
}

function buildFAQPageSchema(p: FAQPagePayload): Record<string, any> {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    ...(p.title ? { name: p.title } : {}),
    mainEntity: p.faqs.map((faq) => ({
      "@type": "Question",
      name: faq.question,
      acceptedAnswer: {
        "@type": "Answer",
        text: faq.answer,
      },
    })),
  };
}

function buildProductSchema(p: ProductPayload): Record<string, any> {
  const schema: Record<string, any> = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: p.name,
    description: p.description,
    brand: {
      "@type": "Brand",
      name: p.brand,
    },
    offers: {
      "@type": "Offer",
      price: p.price,
      priceCurrency: p.priceCurrency,
      availability: p.availability
        ? `https://schema.org/${p.availability}`
        : "https://schema.org/InStock",
      url: p.url,
    },
  };

  if (p.imageUrl) schema.image = p.imageUrl;
  if (p.sku) schema.sku = p.sku;

  if (p.ratingValue && p.reviewCount) {
    schema.aggregateRating = {
      "@type": "AggregateRating",
      ratingValue: p.ratingValue,
      reviewCount: p.reviewCount,
    };
  }

  return schema;
}

function buildHowToSchema(p: HowToPayload): Record<string, any> {
  const schema: Record<string, any> = {
    "@context": "https://schema.org",
    "@type": "HowTo",
    name: p.name,
    description: p.description,
    step: p.steps.map((step, idx) => {
      const s: Record<string, any> = {
        "@type": "HowToStep",
        position: idx + 1,
        name: step.name,
        text: step.text,
      };
      if (step.imageUrl) s.image = step.imageUrl;
      return s;
    }),
  };

  if (p.totalTime) schema.totalTime = p.totalTime;
  if (p.imageUrl) schema.image = p.imageUrl;

  return schema;
}

function buildWebPageSchema(p: WebPagePayload): Record<string, any> {
  const schema: Record<string, any> = {
    "@context": "https://schema.org",
    "@type": "WebPage",
    name: p.name,
    description: p.description,
    url: p.url,
  };

  if (p.datePublished) schema.datePublished = p.datePublished;
  if (p.dateModified) schema.dateModified = p.dateModified;

  return schema;
}

// ─────────────────────────────────────────────────────────────
// Convenience: Organization Schema (for site-wide injection)
// ─────────────────────────────────────────────────────────────

export interface OrganizationPayload {
  name: string;
  url: string;
  logoUrl?: string;
  description?: string;
  sameAs?: string[]; // social profile URLs
}

export function generateOrganizationSchema(p: OrganizationPayload): string {
  const schema: Record<string, any> = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: p.name,
    url: p.url,
  };

  if (p.logoUrl) schema.logo = p.logoUrl;
  if (p.description) schema.description = p.description;
  if (p.sameAs && p.sameAs.length > 0) schema.sameAs = p.sameAs;

  return `<script type="application/ld+json">${JSON.stringify(schema)}</script>`;
}

// ─────────────────────────────────────────────────────────────
// Convenience: BreadcrumbList Schema
// ─────────────────────────────────────────────────────────────

export interface BreadcrumbItem {
  name: string;
  url: string;
}

export function generateBreadcrumbSchema(items: BreadcrumbItem[]): string {
  const schema = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, idx) => ({
      "@type": "ListItem",
      position: idx + 1,
      name: item.name,
      item: item.url,
    })),
  };

  return `<script type="application/ld+json">${JSON.stringify(schema)}</script>`;
}
