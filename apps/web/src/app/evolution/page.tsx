import type { Metadata } from "next";

import { getEvolutionData } from "@/lib/evolution-data";

import { EvolutionClient } from "./_evolution-client";

export const revalidate = 3600;

export const metadata: Metadata = {
  title: "Longitudinal AI Governance Evolution & Amendment Lineage · Project Babel",
  description:
    "Track how AI governance regimes evolved from 2019 to 2026 across the US, EU, South Korea, Japan, and China — plus structured Then-vs.-Now amendment and supersession diffs.",
  alternates: { canonical: "/evolution" },
};

export default async function EvolutionPage() {
  const baseline = await getEvolutionData(false);
  const withStates =
    baseline.subnationalCount > 0 ? await getEvolutionData(true) : baseline;

  return <EvolutionClient baseline={baseline} withStates={withStates} />;
}
