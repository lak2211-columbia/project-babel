"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Copies text via Clipboard API when available, falling back to a temporary
 * offscreen textarea + document.execCommand("copy") for non-HTTPS or sandboxed
 * browser contexts.
 */
export async function copyTextToClipboard(text: string): Promise<boolean> {
  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Fall through to execCommand fallback below.
    }
  }

  if (typeof document === "undefined") return false;
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.top = "-9999px";
  textarea.style.left = "-9999px";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);

  let ok = false;
  try {
    textarea.focus({ preventScroll: true });
    textarea.select();
    textarea.setSelectionRange(0, text.length);
    ok = document.execCommand("copy");
  } catch {
    ok = false;
  } finally {
    document.body.removeChild(textarea);
  }
  return ok;
}

export function CopyButton({
  text,
  label = "copy",
}: {
  text: string;
  label?: string;
}) {
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
      }
    };
  }, []);

  async function handleCopy() {
    const ok = await copyTextToClipboard(text);
    if (!ok) return;
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
    }
    setCopied(true);
    timerRef.current = window.setTimeout(() => {
      setCopied(false);
      timerRef.current = null;
    }, 2000);
  }

  return (
    <button
      type="button"
      onClick={handleCopy}
      aria-live="polite"
      className={`rounded-[2px] border px-2.5 py-1 font-mono text-[11px] uppercase tracking-[0.08em] transition-colors ${
        copied
          ? "border-[#38bdf8]/70 bg-[#38bdf8]/15 text-[#67e8f9]"
          : "border-white/15 bg-white/[0.04] text-[#cbd5e1] hover:border-white/30 hover:text-[#f1f5f9]"
      }`}
    >
      {copied ? "copied ✓" : label}
    </button>
  );
}
