"use client";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body className="flex min-h-screen items-center justify-center bg-[#0a0f18] px-4 py-16 font-sans text-[#cdd6e1]">
        <div className="w-full max-w-[560px] rounded-sm border border-[#38bdf8]/35 bg-[#0f1623] px-6 py-8">
          <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.2em] text-[#38bdf8]">
            PROJECT BABEL · ERROR
          </p>
          <h1 className="mt-2 text-[22px] font-semibold text-[#f1f5f9]">
            Application error
          </h1>
          <p className="mt-3 text-[14px] leading-relaxed text-[#cbd5e1]">
            An unexpected error interrupted rendering. Please try reloading.
          </p>
          {error.digest ? (
            <p className="mt-3 font-mono text-[11px] uppercase tracking-[0.1em] text-[#94a3b8]">
              reference · {error.digest}
            </p>
          ) : null}
          <button
            type="button"
            onClick={() => reset()}
            className="mt-6 rounded-[2px] border border-white/25 bg-white/[0.06] px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.08em] text-[#f1f5f9]"
          >
            reload
          </button>
        </div>
      </body>
    </html>
  );
}
