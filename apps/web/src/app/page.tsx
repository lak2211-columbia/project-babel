import { getLatestSources, getOverviewData } from "@/lib/overview-data";

import { OverviewDashboard } from "./_home/overview-dashboard";

export const revalidate = 3600;

export default async function Home() {
  const [headline, all, latestSources] = await Promise.all([
    getOverviewData("headline", false),
    getOverviewData("all", false),
    getLatestSources({ limit: 60, perJurisdiction: 12 }),
  ]);

  const [headlineWithStates, allWithStates] =
    headline.subnationalCount > 0
      ? await Promise.all([
          getOverviewData("headline", true),
          getOverviewData("all", true),
        ])
      : [headline, all];

  return (
    <OverviewDashboard
      headline={headline}
      all={all}
      headlineWithStates={headlineWithStates}
      allWithStates={allWithStates}
      latestSources={latestSources}
    />
  );
}
