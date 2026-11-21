"use client";

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";

const emptySubscribe = () => () => {};
const getClientSnapshot = () => true;
const getServerSnapshot = () => false;

/**
 * HoverTip — accessible portal popover that works on mouse hover,
 * keyboard focus, and touch/click tap. Uses useSyncExternalStore for
 * React 19 hydration safety (no setState inside useEffect), auto-flips
 * upward near the bottom of the viewport, clamps width to narrow mobile
 * screens, and closes on Escape or outside tap.
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
  offset?: number;
  align?: "start" | "center";
  width?: number;
  className?: string;
}) {
  const triggerRef = useRef<HTMLSpanElement>(null);
  const tipRef = useRef<HTMLDivElement>(null);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const [pinned, setPinned] = useState(false);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tipId = useId();
  const mounted = useSyncExternalStore(
    emptySubscribe,
    getClientSnapshot,
    getServerSnapshot,
  );

  const clearCloseTimer = useCallback(() => {
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  }, []);

  const openFromTrigger = useCallback(() => {
    clearCloseTimer();
    const node = triggerRef.current;
    if (!node) return;
    setRect(node.getBoundingClientRect());
  }, [clearCloseTimer]);

  const closeImmediately = useCallback(() => {
    clearCloseTimer();
    setRect(null);
    setPinned(false);
  }, [clearCloseTimer]);

  const scheduleHide = useCallback(() => {
    if (pinned) return;
    clearCloseTimer();
    closeTimerRef.current = setTimeout(() => {
      setRect(null);
      closeTimerRef.current = null;
    }, 110);
  }, [clearCloseTimer, pinned]);

  const handleToggleTap = useCallback(() => {
    if (rect && pinned) {
      closeImmediately();
    } else {
      setPinned(true);
      openFromTrigger();
    }
  }, [rect, pinned, closeImmediately, openFromTrigger]);

  // Dismiss on scroll, resize, Escape key, or outside click/tap.
  useEffect(() => {
    if (!rect) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        closeImmediately();
      }
    };
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (
        target &&
        (triggerRef.current?.contains(target) || tipRef.current?.contains(target))
      ) {
        return;
      }
      closeImmediately();
    };

    window.addEventListener("scroll", closeImmediately, true);
    window.addEventListener("resize", closeImmediately);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("pointerdown", onPointerDown);
    return () => {
      window.removeEventListener("scroll", closeImmediately, true);
      window.removeEventListener("resize", closeImmediately);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("pointerdown", onPointerDown);
    };
  }, [rect, closeImmediately]);

  useEffect(() => () => clearCloseTimer(), [clearCloseTimer]);

  const position = rect
    ? (() => {
        const vw = typeof window === "undefined" ? 1600 : window.innerWidth;
        const vh = typeof window === "undefined" ? 900 : window.innerHeight;
        const effectiveWidth = Math.min(width, Math.max(220, vw - 16));
        const rawLeft =
          align === "center"
            ? rect.left + rect.width / 2 - effectiveWidth / 2
            : rect.left;
        const clampedLeft = Math.max(
          8,
          Math.min(rawLeft, vw - effectiveWidth - 8),
        );
        const estimatedHeight = 220;
        const placeAbove =
          rect.bottom + offset + estimatedHeight > vh &&
          rect.top - offset > estimatedHeight;
        return {
          left: clampedLeft,
          width: effectiveWidth,
          top: placeAbove ? undefined : rect.bottom + offset,
          bottom: placeAbove ? vh - rect.top + offset : undefined,
        };
      })()
    : null;

  return (
    <span
      ref={triggerRef}
      role="button"
      tabIndex={0}
      aria-expanded={Boolean(rect)}
      aria-describedby={rect ? tipId : undefined}
      className="relative inline-flex w-full focus-visible:outline focus-visible:outline-1 focus-visible:outline-white/40"
      onMouseEnter={openFromTrigger}
      onMouseLeave={scheduleHide}
      onFocus={openFromTrigger}
      onBlur={scheduleHide}
      onClick={handleToggleTap}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          handleToggleTap();
        }
      }}
    >
      {trigger}
      {mounted && position
        ? createPortal(
            <div
              ref={tipRef}
              id={tipId}
              role="tooltip"
              onMouseEnter={openFromTrigger}
              onMouseLeave={scheduleHide}
              style={{
                position: "fixed",
                top: position.top,
                bottom: position.bottom,
                left: position.left,
                width: position.width,
                maxWidth: "calc(100vw - 16px)",
                zIndex: 2147483647,
              }}
              className={`pointer-events-auto overflow-hidden rounded-sm border border-white/20 bg-[#05090f] font-sans text-[13px] text-[#cbd5e1] shadow-[0_16px_36px_rgba(0,0,0,0.75)] ${className}`}
            >
              {children}
            </div>,
            document.body,
          )
        : null}
    </span>
  );
}
