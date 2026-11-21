import type { Metadata } from "next";

import { getObligationMatrix } from "@/lib/matrix-data";

import { ObligationMatrixClient } from "./_matrix-client";

export const revalidate = 3600;

export const metadata: Metadata = {
  title: "AI Legal Obligation & Clause Matrix · Project Babel",
  description:
    "25×5 statutory obligation and enforcement matrix comparing the strongest legal binding level (0–4) across the United States, European Union, South Korea, Japan, and China.",
};

export default async function MatrixPage() {
  const [headline, all] = await Promise.all([
    getObligationMatrix("headline"),
    getObligationMatrix("all"),
  ]);

  return <ObligationMatrixClient headline={headline} all={all} />;
}
