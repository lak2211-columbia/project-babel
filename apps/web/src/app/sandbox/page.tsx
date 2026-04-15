import Link from "next/link";
import { VARIATIONS } from "./_shared";

export const dynamic = "force-dynamic";

export default function SandboxIndex() {
  return (
    <main className="mx-auto max-w-[1200px] px-4 py-10 sm:px-6 lg:px-8">
      <header className="border-b border-black/10 pb-6">
        <p className="text-xs uppercase tracking-[0.12em] text-[#5b655f]">
          Design sandbox
        </p>
        <h1 className="mt-2 text-2xl font-semibold text-[#16201d]">
          Main page variations
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-[#4d5a54]">
          Five distinct approaches to the AI Governance Observatory main page,
          each built from the same data set. Open them side-by-side and compare.
        </p>
      </header>

      <ul className="mt-8 grid gap-4 sm:grid-cols-2">
        {VARIATIONS.map((variation) => (
          <li key={variation.slug}>
            <Link
              href={`/sandbox/${variation.slug}`}
              className="group block rounded-lg border border-black/10 bg-white px-5 py-5 shadow-[0_1px_0_rgba(0,0,0,0.04)] transition hover:border-black/20 hover:shadow-[0_4px_12px_rgba(0,0,0,0.06)]"
            >
              <div className="flex items-baseline justify-between gap-3">
                <p className="text-base font-semibold text-[#16201d]">
                  {variation.label}
                </p>
                <span className="text-xs text-[#7d867f] group-hover:text-[#16201d]">
                  open →
                </span>
              </div>
              <p className="mt-2 text-sm text-[#4d5a54]">{variation.tagline}</p>
            </Link>
          </li>
        ))}
      </ul>

      <section className="mt-10 rounded-lg border border-black/10 bg-white px-5 py-5 text-sm text-[#4d5a54]">
        <p className="font-medium text-[#16201d]">How to compare</p>
        <p className="mt-2">
          All variations read from <code className="rounded bg-[#eef2ef] px-1 py-0.5 text-xs">getOverviewData()</code>{" "}
          and use the same seed data when no database is configured. Each
          variation embodies a distinct philosophy about what the main page is{" "}
          <em>for</em> — comparison, activity monitoring, queue processing,
          editorial storytelling, or at-a-glance geography.
        </p>
      </section>
    </main>
  );
}
