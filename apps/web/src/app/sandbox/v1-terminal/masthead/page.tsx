import Image from "next/image";

import { getOverviewData } from "@/lib/overview-data";
import type { OverviewData } from "@/lib/seed-data";
import { scoreHexDark } from "../../_shared";

export const dynamic = "force-dynamic";

const VARIANTS = [
  {
    id: "a",
    label: "A · Compact bar",
    note: "Density-first. Brand + stats + tagline + tracking in ~90px. Most terminal-native.",
  },
  {
    id: "b",
    label: "B · Editorial header",
    note: "Quiet brand mark. Big tagline as the visual hero. Newspaper masthead vibe.",
  },
  {
    id: "c",
    label: "C · Split columns",
    note: "Brand/purpose on the left, live system state on the right. Two clear zones.",
  },
  {
    id: "d",
    label: "D · Banner wordmark",
    note: "Bold BABEL wordmark with a rule below. Tagline and counts in a second row.",
  },
  {
    id: "e",
    label: "E · Embedded jurisdictions",
    note: "Tracking strip absorbed into the masthead — each flag shows its composite score inline.",
  },
  {
    id: "f",
    label: "F · Centered front matter",
    note: "Classic journal/publication masthead. Top and bottom rules, everything centered between.",
  },
  {
    id: "g",
    label: "G · Monument wordmark",
    note: "Giant centered BABEL. Quiet everything else. Lots of negative space.",
  },
  {
    id: "h",
    label: "H · Corner-dated centered",
    note: "Volume top-left, date top-right, centered brand block between rules.",
  },
  {
    id: "i",
    label: "I · Centered + inline jurisdictions",
    note: "Centered brand. Row of 5 flags with composite scores centered below. Symmetric anchor.",
  },
  {
    id: "j",
    label: "J · Broadsheet rules",
    note: "Title between edge-to-edge horizontal rules. Most 'front page of a paper' of the set.",
  },
] as const;

type Variant = (typeof VARIANTS)[number];

export default async function V1TerminalMastheadVariants() {
  const data = await getOverviewData();

  return (
    <main className="min-h-[calc(100vh-49px-41px)] bg-[#0a0f18] font-mono text-[13px] text-[#cdd6e1]">
      <div className="mx-auto max-w-[1600px] px-4 py-6 sm:px-6 lg:px-8">
        <header className="flex flex-wrap items-baseline justify-between gap-2 border-b border-white/10 pb-4">
          <div>
            <p className="text-[11px] uppercase tracking-[0.12em] text-[#7a8697]">
              V1 Terminal · masthead explorations
            </p>
            <h1 className="mt-1 text-[16px] text-[#e6edf5]">
              Same data · 5 approaches · scroll to compare
            </h1>
          </div>
          <a
            href="#a"
            className="text-[11px] uppercase tracking-wider text-[#7a8697] hover:text-[#cdd6e1]"
          >
            jump ↓
          </a>
        </header>

        <nav className="mt-3 flex flex-wrap gap-2 text-[11px]">
          {VARIANTS.map((variant) => (
            <a
              key={variant.id}
              href={`#${variant.id}`}
              className="rounded-sm border border-white/10 px-2 py-1 uppercase tracking-wider text-[#cdd6e1] hover:border-white/30 hover:bg-white/5"
            >
              {variant.label}
            </a>
          ))}
        </nav>

        <div className="mt-8 space-y-12">
          <VariantSection variant={VARIANTS[0]}>
            <VariantA data={data} />
          </VariantSection>

          <VariantSection variant={VARIANTS[1]}>
            <VariantB data={data} />
          </VariantSection>

          <VariantSection variant={VARIANTS[2]}>
            <VariantC data={data} />
          </VariantSection>

          <VariantSection variant={VARIANTS[3]}>
            <VariantD data={data} />
          </VariantSection>

          <VariantSection variant={VARIANTS[4]}>
            <VariantE data={data} />
          </VariantSection>

          <VariantSection variant={VARIANTS[5]}>
            <VariantF data={data} />
          </VariantSection>

          <VariantSection variant={VARIANTS[6]}>
            <VariantG data={data} />
          </VariantSection>

          <VariantSection variant={VARIANTS[7]}>
            <VariantH data={data} />
          </VariantSection>

          <VariantSection variant={VARIANTS[8]}>
            <VariantI data={data} />
          </VariantSection>

          <VariantSection variant={VARIANTS[9]}>
            <VariantJ data={data} />
          </VariantSection>
        </div>

        <footer className="mt-12 border-t border-white/10 pt-4 text-[10px] uppercase tracking-wider text-[#3f4857]">
          tell me which direction to push · or which elements to mix
        </footer>
      </div>
    </main>
  );
}

function VariantSection({
  variant,
  children,
}: {
  variant: Variant;
  children: React.ReactNode;
}) {
  return (
    <section id={variant.id} className="scroll-mt-6">
      <div className="mb-4 flex items-baseline justify-between border-b border-white/5 pb-2">
        <div>
          <p className="text-[11px] uppercase tracking-[0.12em] text-[#e6edf5]">
            {variant.label}
          </p>
          <p className="mt-0.5 text-[11px] text-[#7a8697]">{variant.note}</p>
        </div>
        <p className="text-[10px] uppercase tracking-wider text-[#3f4857]">
          variant {variant.id.toUpperCase()}
        </p>
      </div>
      {/* Full-width frame to simulate the real container */}
      <div className="px-0">{children}</div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* A · Compact bar                                                     */
/* ------------------------------------------------------------------ */

function VariantA({ data }: { data: OverviewData }) {
  return (
    <div className="border-b border-white/10 pb-2.5 pt-1">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <div className="flex items-baseline gap-3">
          <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#7a8697]">
            PROJECT BABEL
          </span>
          <span className="text-[#3f4857]">//</span>
          <h1 className="text-[14px] font-semibold text-[#e6edf5]">
            AI Governance Observatory
          </h1>
        </div>
        <div className="flex items-baseline gap-4 text-[10px] uppercase tracking-[0.1em] text-[#7a8697]">
          <CountStat label="src" value={data.summary.publishedSources} />
          <CountStat label="rev" value={data.summary.reviewedOutputs} />
          <CountStat
            label="queue"
            value={data.summary.reviewQueue}
            accent="#f5a623"
          />
          <span className="text-[#3f4857]">·</span>
          <span>{data.snapshotDate}</span>
        </div>
      </div>
      <p className="mt-1 text-[11px] text-[#7a8697]">
        Two questions across five jurisdictions:{" "}
        <span className="text-[#cdd6e1]">what governments require of AI</span>,
        and{" "}
        <span className="text-[#cdd6e1]">
          why they say those rules are necessary
        </span>
        .{" "}
        <span className="text-[#5d6675]">
          machine-extracted · human-reviewed
        </span>
      </p>
      <div className="mt-1.5 flex flex-wrap items-center gap-3 text-[10px] uppercase tracking-[0.1em] text-[#5d6675]">
        <span>tracking</span>
        <ul className="flex flex-wrap items-center gap-3">
          {data.countries.map((country) => (
            <li
              key={country.slug}
              className="flex items-center gap-1.5 text-[#cdd6e1]"
            >
              <Image
                src={country.flagUrl}
                alt=""
                width={16}
                height={12}
                className="rounded-[1px] border border-white/10 object-cover"
                unoptimized
              />
              <span>{country.shortName}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* B · Editorial header                                                */
/* ------------------------------------------------------------------ */

function VariantB({ data }: { data: OverviewData }) {
  return (
    <div className="border-b border-white/10 pb-7 pt-2">
      <div className="flex flex-wrap items-baseline justify-between gap-2 text-[10px] uppercase tracking-[0.16em] text-[#5d6675]">
        <span>
          <span className="text-[#cdd6e1]">Project Babel</span>{" "}
          <span className="text-[#3f4857]">·</span> AI Governance Observatory
        </span>
        <span>
          Vol · 01
          <span className="mx-2 text-[#3f4857]">·</span>
          Snapshot {data.snapshotDate}
        </span>
      </div>

      <h1 className="mt-6 max-w-[840px] text-[26px] font-semibold leading-[1.28] tracking-[0.005em] text-[#e6edf5]">
        What five governments require of AI,
        <br />
        and why they say those rules are{" "}
        <span className="text-[#cdd6e1]">necessary</span>.
      </h1>

      <div className="mt-5 flex flex-wrap items-baseline gap-x-5 gap-y-1 text-[10px] uppercase tracking-[0.1em] text-[#5d6675]">
        <span>
          <span className="mr-1 text-[#cdd6e1] tabular-nums">
            {data.summary.publishedSources}
          </span>
          sources
        </span>
        <span>
          <span className="mr-1 text-[#cdd6e1] tabular-nums">
            {data.summary.reviewedOutputs}
          </span>
          reviewed
        </span>
        <span>
          <span className="mr-1 text-[#f5a623] tabular-nums">
            {data.summary.reviewQueue}
          </span>
          in queue
        </span>
        <span className="text-[#3f4857]">·</span>
        <span>window 2023 – 2026</span>
        <span className="text-[#3f4857]">·</span>
        <span>machine-extracted · human-reviewed</span>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-3 text-[10px] uppercase tracking-[0.1em] text-[#5d6675]">
        <span>tracking</span>
        <ul className="flex flex-wrap items-center gap-x-3 gap-y-1">
          {data.countries.map((country) => (
            <li
              key={country.slug}
              className="flex items-center gap-1.5 text-[#cdd6e1]"
            >
              <Image
                src={country.flagUrl}
                alt=""
                width={16}
                height={12}
                className="rounded-[1px] border border-white/10 object-cover"
                unoptimized
              />
              <span>{country.shortName}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* C · Split columns                                                   */
/* ------------------------------------------------------------------ */

function VariantC({ data }: { data: OverviewData }) {
  return (
    <div className="border-b border-white/10 pb-5">
      <div className="grid gap-6 lg:grid-cols-[1.35fr_1fr]">
        {/* Left: brand + purpose */}
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#7a8697]">
            PROJECT BABEL
          </p>
          <h1 className="mt-1 text-[20px] font-semibold tracking-[0.01em] text-[#e6edf5]">
            AI Governance Observatory
          </h1>
          <p className="mt-2 max-w-[640px] text-[12px] leading-relaxed text-[#cdd6e1]">
            Two questions across five jurisdictions:{" "}
            <span className="text-[#e6edf5]">
              what governments require of AI
            </span>
            , and{" "}
            <span className="text-[#e6edf5]">
              why they say those rules are necessary
            </span>
            .
          </p>
          <p className="mt-1.5 text-[10px] uppercase tracking-[0.1em] text-[#5d6675]">
            machine-extracted from official sources · human-reviewed
          </p>
        </div>

        {/* Right: system state */}
        <div className="border-l border-white/5 pl-6">
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#7a8697]">
            system state
          </p>
          <dl className="mt-2 grid grid-cols-3 gap-x-4">
            <BigStat label="sources" value={data.summary.publishedSources} />
            <BigStat label="reviewed" value={data.summary.reviewedOutputs} />
            <BigStat
              label="in queue"
              value={data.summary.reviewQueue}
              accent="#f5a623"
            />
          </dl>
          <div className="mt-3 flex flex-wrap items-baseline gap-x-4 gap-y-1 text-[10px] uppercase tracking-[0.1em] text-[#5d6675]">
            <span>
              snapshot ·{" "}
              <span className="text-[#cdd6e1]">{data.snapshotDate}</span>
            </span>
            <span>
              window · <span className="text-[#cdd6e1]">2023 – 2026</span>
            </span>
          </div>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-1 border-t border-white/5 pt-3 text-[10px] uppercase tracking-[0.1em] text-[#5d6675]">
        <span>tracking</span>
        <ul className="flex flex-wrap items-center gap-x-4 gap-y-1">
          {data.countries.map((country) => (
            <li
              key={country.slug}
              className="flex items-center gap-1.5 text-[#cdd6e1]"
            >
              <Image
                src={country.flagUrl}
                alt=""
                width={18}
                height={13}
                className="rounded-[1px] border border-white/10 object-cover"
                unoptimized
              />
              <span>{country.shortName}</span>
              <span className="text-[#7a8697]">{country.name}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* D · Banner wordmark                                                 */
/* ------------------------------------------------------------------ */

function VariantD({ data }: { data: OverviewData }) {
  return (
    <div className="border-b border-white/10 pb-5">
      {/* Identity bar */}
      <div className="flex flex-wrap items-baseline justify-between gap-3 border-b border-[#7a8697]/30 pb-3">
        <div className="flex items-baseline gap-4">
          <span className="text-[30px] font-bold uppercase leading-none tracking-[0.015em] text-[#e6edf5]">
            Babel
          </span>
          <span className="text-[10px] uppercase tracking-[0.22em] text-[#7a8697]">
            AI Governance Observatory
          </span>
        </div>
        <div className="flex items-baseline gap-3 text-[10px] uppercase tracking-[0.1em] text-[#5d6675]">
          <span>Vol 01 · {data.snapshotDate}</span>
          <span className="text-[#3f4857]">·</span>
          <span>Window 2023 – 2026</span>
        </div>
      </div>

      {/* Tagline + counts row */}
      <div className="mt-3 flex flex-wrap items-baseline justify-between gap-3">
        <p className="max-w-[720px] text-[13px] leading-relaxed text-[#cdd6e1]">
          Two questions across five jurisdictions:{" "}
          <span className="text-[#e6edf5]">
            what governments require of AI
          </span>
          , and{" "}
          <span className="text-[#e6edf5]">
            why they say those rules are necessary
          </span>
          .
        </p>
        <div className="flex items-baseline gap-4 text-[10px] uppercase tracking-[0.1em] text-[#7a8697]">
          <CountStat label="src" value={data.summary.publishedSources} />
          <CountStat label="rev" value={data.summary.reviewedOutputs} />
          <CountStat
            label="queue"
            value={data.summary.reviewQueue}
            accent="#f5a623"
          />
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-white/5 pt-3 text-[10px] uppercase tracking-[0.1em] text-[#5d6675]">
        <span>machine-extracted from official sources · human-reviewed</span>
        <ul className="flex items-center gap-3">
          {data.countries.map((country) => (
            <li
              key={country.slug}
              className="flex items-center gap-1.5 text-[#cdd6e1]"
            >
              <Image
                src={country.flagUrl}
                alt=""
                width={18}
                height={13}
                className="rounded-[1px] border border-white/10 object-cover"
                unoptimized
              />
              <span>{country.shortName}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* E · Embedded jurisdictions                                          */
/* ------------------------------------------------------------------ */

function VariantE({ data }: { data: OverviewData }) {
  return (
    <div className="border-b border-white/10 pb-5">
      <div className="flex flex-wrap items-end justify-between gap-6">
        {/* Left: brand + purpose */}
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#7a8697]">
            PROJECT BABEL
          </p>
          <h1 className="mt-1 text-[20px] font-semibold tracking-[0.01em] text-[#e6edf5]">
            AI Governance Observatory
          </h1>
          <p className="mt-2 max-w-[560px] text-[12px] leading-relaxed text-[#cdd6e1]">
            Two questions across five jurisdictions:{" "}
            <span className="text-[#e6edf5]">
              what governments require of AI
            </span>
            , and{" "}
            <span className="text-[#e6edf5]">
              why they say those rules are necessary
            </span>
            .
          </p>
        </div>

        {/* Right: tracking strip with live composite scores */}
        <div>
          <p className="mb-2 text-right text-[9px] uppercase tracking-[0.14em] text-[#7a8697]">
            tracking · composite score
          </p>
          <ul className="flex items-end gap-3">
            {data.countries.map((country) => {
              const color = scoreHexDark(country.compositeDivergence);
              return (
                <li
                  key={country.slug}
                  className="flex flex-col items-center gap-1"
                >
                  <Image
                    src={country.flagUrl}
                    alt={`${country.name} flag`}
                    width={34}
                    height={25}
                    className="h-[25px] w-[34px] rounded-[2px] border border-white/10 object-cover"
                    unoptimized
                  />
                  <span className="text-[9px] uppercase tracking-wider text-[#7a8697]">
                    {country.shortName}
                  </span>
                  <span
                    className="text-[13px] font-semibold leading-none tabular-nums"
                    style={{ color }}
                  >
                    {country.compositeDivergence}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-x-5 gap-y-1 border-t border-white/5 pt-3 text-[10px] uppercase tracking-[0.1em] text-[#5d6675]">
        <span>
          <span className="mr-1 text-[#cdd6e1] tabular-nums">
            {data.summary.publishedSources}
          </span>
          sources
          <span className="mx-2 text-[#3f4857]">·</span>
          <span className="mr-1 text-[#cdd6e1] tabular-nums">
            {data.summary.reviewedOutputs}
          </span>
          reviewed
          <span className="mx-2 text-[#3f4857]">·</span>
          <span className="mr-1 text-[#f5a623] tabular-nums">
            {data.summary.reviewQueue}
          </span>
          in queue
        </span>
        <span>
          snapshot {data.snapshotDate} · window 2023 – 2026 · machine-extracted
          · human-reviewed
        </span>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* F · Centered front matter                                           */
/* ------------------------------------------------------------------ */

function VariantF({ data }: { data: OverviewData }) {
  return (
    <div className="border-y border-white/20 py-7 text-center">
      <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[#7a8697]">
        PROJECT BABEL
      </p>
      <h1 className="mt-2 text-[22px] font-semibold tracking-[0.01em] text-[#e6edf5]">
        AI Governance Observatory
      </h1>
      <p className="mx-auto mt-3 max-w-[620px] text-[12px] leading-relaxed text-[#cdd6e1]">
        Two questions across five jurisdictions:{" "}
        <span className="text-[#e6edf5]">what governments require of AI</span>,
        and{" "}
        <span className="text-[#e6edf5]">
          why they say those rules are necessary
        </span>
        .
      </p>
      <p className="mt-2 text-[10px] uppercase tracking-[0.14em] text-[#5d6675]">
        machine-extracted from official sources · human-reviewed
      </p>

      <div className="mx-auto mt-5 flex max-w-[960px] flex-wrap items-center justify-center gap-x-5 gap-y-1 border-t border-white/5 pt-4 text-[10px] uppercase tracking-[0.12em] text-[#5d6675]">
        <span>
          <span className="mr-1 text-[#cdd6e1] tabular-nums">
            {data.summary.publishedSources}
          </span>
          sources
        </span>
        <span className="text-[#3f4857]">·</span>
        <span>
          <span className="mr-1 text-[#cdd6e1] tabular-nums">
            {data.summary.reviewedOutputs}
          </span>
          reviewed
        </span>
        <span className="text-[#3f4857]">·</span>
        <span>
          <span className="mr-1 text-[#f5a623] tabular-nums">
            {data.summary.reviewQueue}
          </span>
          in queue
        </span>
        <span className="text-[#3f4857]">·</span>
        <span>snapshot {data.snapshotDate}</span>
        <span className="text-[#3f4857]">·</span>
        <span>window 2023 – 2026</span>
      </div>

      <div className="mt-3 flex items-center justify-center gap-3 text-[10px] uppercase tracking-[0.1em] text-[#5d6675]">
        <span>tracking</span>
        <ul className="flex items-center gap-3">
          {data.countries.map((country) => (
            <li
              key={country.slug}
              className="flex items-center gap-1.5 text-[#cdd6e1]"
            >
              <Image
                src={country.flagUrl}
                alt=""
                width={16}
                height={12}
                className="rounded-[1px] border border-white/10 object-cover"
                unoptimized
              />
              <span>{country.shortName}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* G · Monument wordmark                                               */
/* ------------------------------------------------------------------ */

function VariantG({ data }: { data: OverviewData }) {
  return (
    <div className="border-b border-white/10 py-10 text-center">
      <p className="text-[10px] uppercase tracking-[0.3em] text-[#5d6675]">
        Project
      </p>
      <h1 className="mt-1 text-[56px] font-bold uppercase leading-[0.9] tracking-[0.08em] text-[#e6edf5]">
        Babel
      </h1>
      <p className="mt-3 text-[11px] uppercase tracking-[0.22em] text-[#7a8697]">
        AI Governance Observatory
      </p>
      <p className="mx-auto mt-6 max-w-[520px] text-[12px] leading-relaxed text-[#cdd6e1]">
        Two questions across five jurisdictions:{" "}
        <span className="text-[#e6edf5]">
          what governments require of AI
        </span>
        , and{" "}
        <span className="text-[#e6edf5]">
          why they say those rules are necessary
        </span>
        .
      </p>

      <div className="mx-auto mt-6 inline-flex items-baseline gap-5 border-t border-white/10 pt-4 text-[10px] uppercase tracking-[0.14em] text-[#5d6675]">
        <span>
          <span className="mr-1 text-[#cdd6e1] tabular-nums">
            {data.summary.publishedSources}
          </span>
          src
        </span>
        <span>
          <span className="mr-1 text-[#cdd6e1] tabular-nums">
            {data.summary.reviewedOutputs}
          </span>
          rev
        </span>
        <span>
          <span className="mr-1 text-[#f5a623] tabular-nums">
            {data.summary.reviewQueue}
          </span>
          queue
        </span>
        <span className="text-[#3f4857]">·</span>
        <span>{data.snapshotDate}</span>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* H · Corner-dated centered                                           */
/* ------------------------------------------------------------------ */

function VariantH({ data }: { data: OverviewData }) {
  return (
    <div className="border-b border-white/10 pb-6">
      {/* Top corners */}
      <div className="flex items-baseline justify-between text-[10px] uppercase tracking-[0.14em] text-[#5d6675]">
        <span>Vol · 01 · Series A</span>
        <span>{data.snapshotDate}</span>
      </div>

      {/* Top rule */}
      <div className="mt-3 border-t border-white/20" />

      {/* Centered brand block */}
      <div className="py-6 text-center">
        <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#7a8697]">
          Project Babel
        </p>
        <h1 className="mt-2 text-[24px] font-semibold uppercase tracking-[0.04em] text-[#e6edf5]">
          AI Governance Observatory
        </h1>
        <p className="mx-auto mt-4 max-w-[640px] text-[12px] leading-relaxed text-[#cdd6e1]">
          Two questions across five jurisdictions:{" "}
          <span className="text-[#e6edf5]">
            what governments require of AI
          </span>
          , and{" "}
          <span className="text-[#e6edf5]">
            why they say those rules are necessary
          </span>
          .
        </p>
        <p className="mt-2 text-[10px] uppercase tracking-[0.12em] text-[#5d6675]">
          machine-extracted · human-reviewed
        </p>
      </div>

      {/* Bottom rule */}
      <div className="border-t border-white/20" />

      {/* Bottom corners */}
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-[10px] uppercase tracking-[0.12em] text-[#5d6675]">
        <span>
          <span className="mr-1 text-[#cdd6e1] tabular-nums">
            {data.summary.publishedSources}
          </span>
          sources
          <span className="mx-2 text-[#3f4857]">·</span>
          <span className="mr-1 text-[#cdd6e1] tabular-nums">
            {data.summary.reviewedOutputs}
          </span>
          reviewed
          <span className="mx-2 text-[#3f4857]">·</span>
          <span className="mr-1 text-[#f5a623] tabular-nums">
            {data.summary.reviewQueue}
          </span>
          in queue
        </span>
        <ul className="flex flex-wrap items-center gap-3">
          {data.countries.map((country) => (
            <li
              key={country.slug}
              className="flex items-center gap-1.5 text-[#cdd6e1]"
            >
              <Image
                src={country.flagUrl}
                alt=""
                width={16}
                height={12}
                className="rounded-[1px] border border-white/10 object-cover"
                unoptimized
              />
              <span>{country.shortName}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* I · Centered + inline jurisdictions                                 */
/* ------------------------------------------------------------------ */

function VariantI({ data }: { data: OverviewData }) {
  return (
    <div className="border-b border-white/10 py-7 text-center">
      <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#7a8697]">
        PROJECT BABEL
      </p>
      <h1 className="mt-2 text-[22px] font-semibold tracking-[0.01em] text-[#e6edf5]">
        AI Governance Observatory
      </h1>
      <p className="mx-auto mt-3 max-w-[640px] text-[12px] leading-relaxed text-[#cdd6e1]">
        Two questions across five jurisdictions:{" "}
        <span className="text-[#e6edf5]">what governments require of AI</span>,
        and{" "}
        <span className="text-[#e6edf5]">
          why they say those rules are necessary
        </span>
        .
      </p>

      {/* Inline jurisdictions with composite scores — centered */}
      <ul className="mx-auto mt-6 flex items-end justify-center gap-8">
        {data.countries.map((country) => {
          const color = scoreHexDark(country.compositeDivergence);
          return (
            <li
              key={country.slug}
              className="flex flex-col items-center gap-1.5"
            >
              <Image
                src={country.flagUrl}
                alt={`${country.name} flag`}
                width={38}
                height={28}
                className="h-[28px] w-[38px] rounded-[2px] border border-white/10 object-cover"
                unoptimized
              />
              <span className="text-[9px] uppercase tracking-[0.12em] text-[#7a8697]">
                {country.shortName}
              </span>
              <span
                className="text-[16px] font-semibold leading-none tabular-nums"
                style={{ color }}
              >
                {country.compositeDivergence}
              </span>
            </li>
          );
        })}
      </ul>
      <p className="mt-1 text-[9px] uppercase tracking-[0.14em] text-[#5d6675]">
        composite divergence · lower = more aligned
      </p>

      <div className="mx-auto mt-5 inline-flex items-baseline gap-4 border-t border-white/10 pt-3 text-[10px] uppercase tracking-[0.12em] text-[#5d6675]">
        <span>
          <span className="mr-1 text-[#cdd6e1] tabular-nums">
            {data.summary.publishedSources}
          </span>
          sources
        </span>
        <span>
          <span className="mr-1 text-[#cdd6e1] tabular-nums">
            {data.summary.reviewedOutputs}
          </span>
          reviewed
        </span>
        <span>
          <span className="mr-1 text-[#f5a623] tabular-nums">
            {data.summary.reviewQueue}
          </span>
          in queue
        </span>
        <span className="text-[#3f4857]">·</span>
        <span>snapshot {data.snapshotDate}</span>
        <span className="text-[#3f4857]">·</span>
        <span>machine-extracted · human-reviewed</span>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* J · Broadsheet rules                                                */
/* ------------------------------------------------------------------ */

function VariantJ({ data }: { data: OverviewData }) {
  return (
    <div className="border-b border-white/10 pb-6">
      {/* Thin top status line */}
      <div className="flex items-baseline justify-between text-[10px] uppercase tracking-[0.14em] text-[#5d6675]">
        <span>Project · Vol 01</span>
        <span>{data.snapshotDate}</span>
      </div>

      {/* Wordmark between edge-to-edge horizontal rules */}
      <div className="mt-4 flex items-center gap-6">
        <div className="h-px flex-1 bg-[#cdd6e1]/40" />
        <h1 className="whitespace-nowrap text-[36px] font-bold uppercase leading-none tracking-[0.08em] text-[#e6edf5]">
          Babel
        </h1>
        <div className="h-px flex-1 bg-[#cdd6e1]/40" />
      </div>

      {/* Subtitle on its own line under the rule */}
      <p className="mt-3 text-center text-[11px] uppercase tracking-[0.22em] text-[#7a8697]">
        AI Governance Observatory
      </p>

      {/* Tagline centered, max-width */}
      <p className="mx-auto mt-5 max-w-[680px] text-center text-[13px] leading-relaxed text-[#cdd6e1]">
        Two questions across five jurisdictions:{" "}
        <span className="text-[#e6edf5]">what governments require of AI</span>,
        and{" "}
        <span className="text-[#e6edf5]">
          why they say those rules are necessary
        </span>
        .
      </p>

      {/* Bottom rule + distributed metadata */}
      <div className="mt-5 border-t border-white/10 pt-3">
        <div className="flex flex-wrap items-center justify-between gap-3 text-[10px] uppercase tracking-[0.14em] text-[#5d6675]">
          <span>
            <span className="mr-1 text-[#cdd6e1] tabular-nums">
              {data.summary.publishedSources}
            </span>
            sources
            <span className="mx-2 text-[#3f4857]">·</span>
            <span className="mr-1 text-[#cdd6e1] tabular-nums">
              {data.summary.reviewedOutputs}
            </span>
            reviewed
            <span className="mx-2 text-[#3f4857]">·</span>
            <span className="mr-1 text-[#f5a623] tabular-nums">
              {data.summary.reviewQueue}
            </span>
            queue
          </span>
          <ul className="flex items-center gap-3">
            {data.countries.map((country) => (
              <li
                key={country.slug}
                className="flex items-center gap-1.5 text-[#cdd6e1]"
              >
                <Image
                  src={country.flagUrl}
                  alt=""
                  width={16}
                  height={12}
                  className="rounded-[1px] border border-white/10 object-cover"
                  unoptimized
                />
                <span>{country.shortName}</span>
              </li>
            ))}
          </ul>
          <span>machine-extracted · human-reviewed</span>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Small helpers                                                       */
/* ------------------------------------------------------------------ */

function CountStat({
  label,
  value,
  accent,
}: {
  label: string;
  value: number;
  accent?: string;
}) {
  return (
    <span className="flex items-baseline gap-1.5">
      <span className="text-[9px] text-[#5d6675]">{label}</span>
      <span
        className="text-[12px] font-semibold tabular-nums"
        style={accent ? { color: accent } : { color: "#cdd6e1" }}
      >
        {value}
      </span>
    </span>
  );
}

function BigStat({
  label,
  value,
  accent,
}: {
  label: string;
  value: number;
  accent?: string;
}) {
  return (
    <div>
      <dt className="text-[9px] uppercase tracking-[0.1em] text-[#5d6675]">
        {label}
      </dt>
      <dd
        className="mt-1 text-[22px] font-semibold tabular-nums leading-none"
        style={{ color: accent ?? "#cdd6e1" }}
      >
        {value}
      </dd>
    </div>
  );
}
