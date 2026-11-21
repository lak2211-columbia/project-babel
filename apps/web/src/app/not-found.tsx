import Link from "next/link";

import { TopNav } from "@/app/_components/top-nav";

export default function NotFound() {
  return (
    <main className="min-h-screen bg-[#0a0f18] font-sans text-[14px] text-[#cdd6e1]">
      <div className="mx-auto max-w-[1600px] px-4 py-4 sm:px-6 lg:px-8">
        <TopNav />
        <div className="flex min-h-[calc(100vh-8rem)] items-center justify-center py-12">
          <div className="w-full max-w-[560px] rounded-sm border border-white/15 bg-[#0f1623] px-6 py-8">
            <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.2em] text-[#94a3b8]">
              PROJECT BABEL · 404
            </p>
            <h1 className="mt-2 text-[22px] font-semibold text-[#f1f5f9]">
              Page or document not found
            </h1>
            <p className="mt-3 text-[14px] leading-relaxed text-[#cbd5e1]">
              The requested route, jurisdiction, or document identifier is not
              present in the current observatory snapshot.
            </p>
            <nav
              aria-label="Recovery navigation"
              className="mt-6 flex flex-wrap gap-2 border-t border-white/10 pt-4 font-mono text-[11px] uppercase tracking-[0.08em]"
            >
              <Link
                href="/"
                className="rounded-[2px] border border-white/25 bg-white/[0.06] px-3 py-1.5 text-[#f1f5f9] transition-colors hover:border-white/40"
              >
                ← overview
              </Link>
              <Link
                href="/matrix"
                className="rounded-[2px] border border-white/15 px-3 py-1.5 text-[#cbd5e1] transition-colors hover:border-white/30 hover:text-[#f1f5f9]"
              >
                matrix
              </Link>
              <Link
                href="/documents"
                className="rounded-[2px] border border-white/15 px-3 py-1.5 text-[#cbd5e1] transition-colors hover:border-white/30 hover:text-[#f1f5f9]"
              >
                documents
              </Link>
              <Link
                href="/compare"
                className="rounded-[2px] border border-white/15 px-3 py-1.5 text-[#cbd5e1] transition-colors hover:border-white/30 hover:text-[#f1f5f9]"
              >
                compare
              </Link>
              <Link
                href="/methodology"
                className="rounded-[2px] border border-white/15 px-3 py-1.5 text-[#cbd5e1] transition-colors hover:border-white/30 hover:text-[#f1f5f9]"
              >
                methodology
              </Link>
            </nav>
          </div>
        </div>
      </div>
    </main>
  );
}
