import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { getJurisdictionAnalysis } from "@/lib/jurisdiction-analysis";
import {
  jurisdictionMeta,
  jurisdictionOrder,
  type JurisdictionKey,
} from "@/lib/jurisdictions";
import { getLatestSources, getOverviewData } from "@/lib/overview-data";

import { JurisdictionView } from "./_jurisdiction-view";

export const revalidate = 3600;

export function generateStaticParams() {
  return jurisdictionOrder.map((key) => ({
    slug: jurisdictionMeta[key].slug,
  }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const entry = Object.values(jurisdictionMeta).find((m) => m.slug === slug);
  if (!entry) {
    return { title: "Jurisdiction Not Found" };
  }
  return {
    title: `${entry.name} (${entry.shortName}) AI Governance Profile`,
    description: `Policy structure, enforcement profile, regime coverage, eight-frame risk framing distribution, and official documents for ${entry.name}.`,
    alternates: { canonical: `/jurisdictions/${entry.slug}` },
  };
}

export default async function JurisdictionPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const jurisdictionEntry = Object.entries(jurisdictionMeta).find(
    ([, meta]) => meta.slug === slug,
  );
  if (!jurisdictionEntry) {
    notFound();
  }
  const jurisdictionKey = jurisdictionEntry[0] as JurisdictionKey;

  const [headline, all, analysis, countryDocuments] = await Promise.all([
    getOverviewData("headline", false),
    getOverviewData("all", false),
    getJurisdictionAnalysis(jurisdictionKey),
    getLatestSources({ jurisdiction: jurisdictionKey, limit: 30 }),
  ]);

  const [headlineWithStates, allWithStates] =
    headline.subnationalCount > 0
      ? await Promise.all([
          getOverviewData("headline", true),
          getOverviewData("all", true),
        ])
      : [undefined, undefined];

  if (
    !headline.hasData ||
    !headline.countries.some((c) => c.slug === slug)
  ) {
    notFound();
  }

  return (
    <JurisdictionView
      slug={slug}
      jurisdictionKey={jurisdictionKey}
      headline={headline}
      all={all}
      headlineWithStates={headlineWithStates}
      allWithStates={allWithStates}
      analysis={analysis}
      countryDocuments={countryDocuments}
    />
  );
}
