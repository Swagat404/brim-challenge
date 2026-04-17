"use client";

import { useEffect, useRef, useState } from "react";

interface ResizableSidebarProps {
  children: React.ReactNode;
  /** Initial width in pixels */
  defaultWidth?: number;
  minWidth?: number;
  maxWidth?: number;
  /** Persist the width in localStorage under this key */
  storageKey?: string;
  /** Drag handle position — 'left' for right-side panels, 'right' for left-side */
  handle?: "left" | "right";
  /** Outer className applied to the <aside> */
  className?: string;
}

/**
 * A flex-shrink-0 sidebar with a draggable resize handle.
 *
 * Used for the policy_editor chat dock on /policy. Width is persisted in
 * localStorage so the user's preferred width survives page reloads.
 */
export default function ResizableSidebar({
  children,
  defaultWidth = 380,
  minWidth = 280,
  maxWidth = 720,
  storageKey,
  handle = "left",
  className = "",
}: ResizableSidebarProps) {
  const [width, setWidth] = useState(defaultWidth);
  const [dragging, setDragging] = useState(false);
  const startX = useRef(0);
  const startWidth = useRef(defaultWidth);

  // Hydrate from localStorage once on mount
  useEffect(() => {
    if (!storageKey || typeof window === "undefined") return;
    const saved = window.localStorage.getItem(storageKey);
    if (saved) {
      const n = parseInt(saved, 10);
      if (Number.isFinite(n) && n >= minWidth && n <= maxWidth) setWidth(n);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Persist on settle (debounced via the dragging-end transition)
  useEffect(() => {
    if (!storageKey || typeof window === "undefined") return;
    if (dragging) return;
    window.localStorage.setItem(storageKey, String(width));
  }, [dragging, width, storageKey]);

  // Document-level mouse handlers so the drag continues even when the cursor
  // briefly leaves the handle hitbox.
  useEffect(() => {
    if (!dragging) return;

    function onMove(e: MouseEvent) {
      const dx = e.clientX - startX.current;
      // For a right-edge sidebar (handle="left"), dragging LEFT increases
      // width; for a left-edge sidebar, the opposite.
      const delta = handle === "left" ? -dx : dx;
      const next = Math.min(maxWidth, Math.max(minWidth, startWidth.current + delta));
      setWidth(next);
    }
    function onUp() {
      setDragging(false);
    }

    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    return () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
  }, [dragging, handle, minWidth, maxWidth]);

  function startDrag(e: React.MouseEvent) {
    e.preventDefault();
    startX.current = e.clientX;
    startWidth.current = width;
    setDragging(true);
  }

  return (
    <aside
      className={`relative flex-shrink-0 ${className}`}
      style={{ width: `${width}px` }}
    >
      {/* Drag handle — full-height thin strip on the chosen edge */}
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize sidebar"
        onMouseDown={startDrag}
        className={`absolute top-0 bottom-0 z-30 w-2 cursor-col-resize group ${
          handle === "left" ? "-left-1" : "-right-1"
        }`}
      >
        <div
          className={`absolute top-1/2 -translate-y-1/2 ${
            handle === "left" ? "left-0" : "right-0"
          } w-[3px] h-12 rounded-full bg-zinc-300 group-hover:bg-zinc-500 transition-colors ${
            dragging ? "!bg-zinc-700" : ""
          }`}
        />
      </div>
      <div className="h-full overflow-hidden">{children}</div>
    </aside>
  );
}
