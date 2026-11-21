import Link from "next/link";
import { Fragment } from "react";

export type TopNavSection =
  | "overview"
  | "matrix"
  | "clauses"
  | "evolution"
  | "compare"
  | "documents"
  | "methodology"
  | "jurisdiction";

const NAV_ITEMS: {
  key: Exclude<TopNavSection, "jurisdiction">;
  label: string;
  href: string;
}[] = [
  { key: "overview", label: "overview", href: "/" },
  { key: "matrix", label: "matrix", href: "/matrix" },
  { key: "clauses", label: "clauses", href: "/clauses" },
  { key: "evolution", label: "evolution", href: "/evolution" },
  { key: "compare", label: "compare", href: "/compare" },
  { key: "documents", label: "documents", href: "/documents" },
  { key: "methodology", label: "methodology", href: "/methodology" },
];

export function TopNav({ active }: { active?: TopNavSection }) {
  return (
    <nav
      aria-label="Primary navigation"
      className="mb-3 flex flex-wrap items-center justify-center gap-x-3.5 gap-y-2 font-mono text-[11px] uppercase tracking-[0.12em] text-[#94a3b8] sm:gap-x-3"
    >
      {NAV_ITEMS.map((item, index) => (
        <Fragment key={item.key}>
          {index > 0 ? (
            <span aria-hidden className="hidden text-[#475569] sm:inline">
              ·
            </span>
          ) : null}
          <Link
            href={item.href}
            aria-current={active === item.key ? "page" : undefined}
            className={
              active === item.key
                ? "font-semibold text-[#f1f5f9] underline decoration-[#38bdf8] decoration-2 underline-offset-4"
                : "transition-colors hover:text-[#f1f5f9]"
            }
          >
            {item.label}
          </Link>
        </Fragment>
      ))}
    </nav>
  );
}
