"use client";

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";

/**
 * HoverTip — a bulletproof hover popover that escapes every possible
 * stacking-context trap.
 *
 * The popover content is rendered into document.body via a React portal
 * (not inside the trigger's DOM subtree), and positioned absolutely with
 * `position: fixed` using the trigger's `getBoundingClientRect()`. This
 * means it's immune to transforms, opacity animations, overflow: hidden,
 * or z-index battles in any ancestor of the trigger — the popover lives
 * as a direct child of <body> with an enormous z-index.
 *
 * Works on mouse (hover with a small close delay so the user can move
 * toward the popover without it vanishing) and keyboard (focus/blur).
 */
export function HoverTip({
  trigger,
  children,
  offset = 8,
  align = "start",
  width = 320,
  className = "",
}: {
  trigger: ReactNode;
  children: ReactNode;
  /** Pixels between the bottom of the trigger and the top of the popover. */
  offset?: number;
  /** Horizontal alignment of the popover relative to the trigger. */
  align?: "start" | "center";
  width?: number;
  className?: string;
}) {
  const triggerRef = useRef<HTMLSpanElement>(null);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const [mounted, setMounted] = useState(false);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tipId = useId();

  useEffect(() => {
    setMounted(true);
  }, []);

  const show = useCallback(() => {
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
    const node = triggerRef.current;
    if (!node) return;
    setRect(node.getBoundingClientRect());
  }, []);

  const scheduleHide = useCallback(() => {
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
    }
    closeTimerRef.current = setTimeout(() => {
      setRect(null);
      closeTimerRef.current = null;
    }, 100);
  }, []);

  // Hide on scroll / resize to avoid stale-position ghost popovers.
  useEffect(() => {
    if (!rect) return;
    const close = () => {
      setRect(null);
      if (closeTimerRef.current) {
        clearTimeout(closeTimerRef.current);
        closeTimerRef.current = null;
      }
    };
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [rect]);

  // Compute clamped position
  const position = rect
    ? (() => {
        const vw = typeof window === "undefined" ? 1600 : window.innerWidth;
        const left =
          align === "center"
            ? rect.left + rect.width / 2 - width / 2
            : rect.left;
        const clampedLeft = Math.max(8, Math.min(left, vw - width - 8));
        const top = rect.bottom + offset;
        return { top, left: clampedLeft };
      })()
    : null;

  return (
    <span
      ref={triggerRef}
      className="relative inline-flex"
      tabIndex={0}
      aria-describedby={rect ? tipId : undefined}
      onMouseEnter={show}
      onMouseLeave={scheduleHide}
      onFocus={show}
      onBlur={scheduleHide}
    >
      {trigger}
      {mounted && position
        ? createPortal(
            <div
              id={tipId}
              role="tooltip"
              onMouseEnter={show}
              onMouseLeave={scheduleHide}
              style={{
                position: "fixed",
                top: position.top,
                left: position.left,
                width,
                zIndex: 2147483647,
              }}
              className={`pointer-events-auto overflow-hidden rounded-sm border border-white/15 bg-[#05090f] font-mono text-[13px] text-[#cdd6e1] shadow-[0_16px_36px_rgba(0,0,0,0.7)] ${className}`}
            >
              {children}
            </div>,
            document.body,
          )
        : null}
    </span>
  );
}
