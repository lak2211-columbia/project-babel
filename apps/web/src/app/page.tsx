import { getLatestSources, getOverviewData } from "@/lib/overview-data";

import { OverviewDashboard } from "./_home/overview-dashboard";

export const revalidate = 3600;

export default async function Home() {
  const [headline, all, latestSources] = await Promise.all([
    getOverviewData("headline"),
    getOverviewData("all"),
    getLatestSources({ limit: 60, perJurisdiction: 12 }),
  ]);

  return (
    <OverviewDashboard
      headline={headline}
      all={all}
      latestSources={latestSources}
    />
  );
}
