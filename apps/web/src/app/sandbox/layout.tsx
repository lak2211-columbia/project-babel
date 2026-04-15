import Link from "next/link";
import { VARIATIONS } from "./_shared";

export default function SandboxLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-[calc(100vh-49px)]">
      <div className="border-b border-black/10 bg-[#fafbfa]">
        <div className="mx-auto flex max-w-[1600px] flex-wrap items-center gap-2 px-4 py-2 text-xs sm:px-6 lg:px-8">
          <Link
            href="/sandbox"
            className="rounded-md border border-black/10 bg-white px-2 py-1 font-medium text-[#16201d] hover:bg-[#eef2ef]"
          >
            Sandbox
          </Link>
          <span className="text-[#a7b0ab]">/</span>
          {VARIATIONS.map((variation) => (
            <Link
              key={variation.slug}
              href={`/sandbox/${variation.slug}`}
              className="rounded-md border border-transparent px-2 py-1 text-[#44504a] hover:border-black/10 hover:bg-white"
            >
              {variation.label}
            </Link>
          ))}
        </div>
      </div>
      {children}
    </div>
  );
}
