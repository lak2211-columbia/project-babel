"use client";

import Link from "next/link";
import { useEffect } from "react";

export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Observatory route error:", error);
  }, [error]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#0a0f18] px-4 py-16 font-sans text-[#cdd6e1]">
      <div className="w-full max-w-[560px] rounded-sm border border-[#38bdf8]/35 bg-[#0f1623] px-6 py-8">
        <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.2em] text-[#38bdf8]">
          PROJECT BABEL · DATA UNAVAILABLE
        </p>
        <h1 className="mt-2 text-[22px] font-semibold text-[#f1f5f9]">
          Unable to load observatory snapshot
        </h1>
        <p className="mt-3 text-[14px] leading-relaxed text-[#cbd5e1]">
          A temporary backend or database error prevented this view from rendering.
          Retry the request or return to the overview.
        </p>
        {error.digest ? (
          <p className="mt-3 font-mono text-[11px] uppercase tracking-[0.1em] text-[#94a3b8]">
            reference · {error.digest}
          </p>
        ) : null}
        <div className="mt-6 flex flex-wrap gap-2 border-t border-white/10 pt-4 font-mono text-[11px] uppercase tracking-[0.08em]">
          <button
            type="button"
            onClick={() => reset()}
            className="rounded-[2px] border border-white/25 bg-white/[0.06] px-3 py-1.5 text-[#e6edf5] transition-colors hover:border-white/40"
          >
            retry
          </button>
          <Link
            href="/"
            className="rounded-[2px] border border-white/15 px-3 py-1.5 text-[#a3b0c2] transition-colors hover:border-white/30 hover:text-[#e6edf5]"
          >
            ← overview
          </Link>
        </div>
      </div>
    </main>
  );
}
