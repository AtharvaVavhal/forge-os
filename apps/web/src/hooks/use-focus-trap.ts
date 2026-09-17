"use client";

import { useCallback, useEffect, useRef } from "react";

function focusableWithin(node: HTMLElement) {
  return Array.from(
    node.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])'
    )
  ).filter((el) => !el.hasAttribute("disabled") && el.tabIndex !== -1);
}

export function useFocusTrap(active: boolean) {
  const cleanupRef = useRef<(() => void) | null>(null);

  const ref = useCallback(
    (node: HTMLDivElement | null) => {
      cleanupRef.current?.();
      cleanupRef.current = null;
      if (!node || !active) return;
      const target = node;

      const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      const first = focusableWithin(target)[0];
      first?.focus();

      function onKeyDown(event: KeyboardEvent) {
        if (event.key !== "Tab") return;
        const items = focusableWithin(target);
        if (items.length === 0) return;
        const firstItem = items[0];
        const lastItem = items[items.length - 1];
        if (!firstItem || !lastItem) return;
        if (event.shiftKey && document.activeElement === firstItem) {
          event.preventDefault();
          lastItem.focus();
        } else if (!event.shiftKey && document.activeElement === lastItem) {
          event.preventDefault();
          firstItem.focus();
        }
      }

      document.addEventListener("keydown", onKeyDown);
      cleanupRef.current = () => {
        document.removeEventListener("keydown", onKeyDown);
        previous?.focus();
      };
    },
    [active]
  );

  useEffect(() => () => cleanupRef.current?.(), []);

  return ref;
}

export function useEscape(active: boolean, onEscape: () => void) {
  useEffect(() => {
    if (!active) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onEscape();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [active, onEscape]);
}
