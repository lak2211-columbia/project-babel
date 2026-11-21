import type { MetadataRoute } from "next";

import { getDocumentListItems } from "@/lib/document-data";
import { jurisdictionMeta, jurisdictionOrder } from "@/lib/jurisdictions";

export const revalidate = 3600;

const SITE_URL = "https://project-babel.com";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const comparePairs: MetadataRoute.Sitemap = [];
  for (let i = 0; i < jurisdictionOrder.length; i += 1) {
    for (let j = i + 1; j < jurisdictionOrder.length; j += 1) {
      const a = jurisdictionMeta[jurisdictionOrder[i]].slug;
      const b = jurisdictionMeta[jurisdictionOrder[j]].slug;
      comparePairs.push({
        // Next.js sitemap serializer writes loc verbatim without XML-escaping '&'
        url: `${SITE_URL}/compare?a=${a}&amp;b=${b}`,
        changeFrequency: "weekly",
        priority: 0.75,
      });
    }
  }

  const staticRoutes: MetadataRoute.Sitemap = [
    { url: `${SITE_URL}/`, changeFrequency: "weekly", priority: 1.0 },
    { url: `${SITE_URL}/matrix`, changeFrequency: "weekly", priority: 0.9 },
    { url: `${SITE_URL}/clauses`, changeFrequency: "weekly", priority: 0.9 },
    { url: `${SITE_URL}/evolution`, changeFrequency: "weekly", priority: 0.85 },
    { url: `${SITE_URL}/compare`, changeFrequency: "weekly", priority: 0.85 },
    { url: `${SITE_URL}/documents`, changeFrequency: "weekly", priority: 0.9 },
    { url: `${SITE_URL}/methodology`, changeFrequency: "monthly", priority: 0.8 },
    ...jurisdictionOrder.map((key) => ({
      url: `${SITE_URL}/jurisdictions/${jurisdictionMeta[key].slug}`,
      changeFrequency: "weekly" as const,
      priority: 0.85,
    })),
    ...comparePairs,
  ];

  try {
    const docs = await getDocumentListItems();
    const docRoutes: MetadataRoute.Sitemap = docs.map((doc) => ({
      url: `${SITE_URL}/documents/${encodeURIComponent(doc.id)}`,
      lastModified: doc.publicationDateIso ?? undefined,
      changeFrequency: "monthly",
      priority: 0.65,
    }));
    return [...staticRoutes, ...docRoutes];
  } catch {
    return staticRoutes;
  }
}
