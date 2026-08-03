"use client";

import { useSyncExternalStore } from "react";
import { Moon, Sun } from "lucide-react";
import { cn } from "@/lib/utils";

const STORAGE_KEY = "theme";

// `dark` on <html> is the single source of truth for the current theme (set
// by the no-flash inline script in app/layout.tsx and by `toggle` below).
// useSyncExternalStore reads it without an effect-driven setState: it
// renders `getServerSnapshot`'s value (false) through hydration so there is
// no mismatch, then repaints once React can safely read the real DOM class,
// and re-renders again whenever a MutationObserver sees the class change.
function subscribe(onChange: () => void) {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
  return () => observer.disconnect();
}

function getSnapshot(): boolean {
  return document.documentElement.classList.contains("dark");
}

function getServerSnapshot(): boolean {
  return false;
}

/** Light/dark toggle. Flips the `dark` class on <html> and persists the
 *  choice to localStorage - the same source the no-flash inline script in
 *  app/layout.tsx reads before first paint. */
export function ThemeToggle({ className }: { className?: string }) {
  const isDark = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  function toggle() {
    const next = !isDark;
    document.documentElement.classList.toggle("dark", next);
    try {
      localStorage.setItem(STORAGE_KEY, next ? "dark" : "light");
    } catch {
      // localStorage unavailable (private mode, disabled storage) - the
      // toggle still works for the current page load, it just won't persist.
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
      className={cn(
        "inline-flex size-11 shrink-0 items-center justify-center rounded-[10px] border border-border text-muted transition-colors hover:border-blue-border hover:bg-blue-soft hover:text-fg",
        className,
      )}
    >
      {isDark ? <Sun className="size-4" /> : <Moon className="size-4" />}
    </button>
  );
}
