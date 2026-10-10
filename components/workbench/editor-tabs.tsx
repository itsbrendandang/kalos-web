"use client";

import { useEffect, useRef, type KeyboardEvent, type ReactNode } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

export type EditorTab = { key: string; title: string; icon: ReactNode };

/**
 * The workbench's editor tab strip. The active tab is marked the way VS Code
 * marks it (an accent top border on the card surface), arrow keys move
 * between tabs and activate them, and every tab closes from its X button, a
 * middle click, or Delete while the tab has focus.
 */
export function EditorTabs({
  tabs,
  active,
  panelId,
  onActivate,
  onClose,
}: {
  tabs: EditorTab[];
  active: string | null;
  panelId: string;
  onActivate: (key: string) => void;
  onClose: (key: string) => void;
}) {
  const refs = useRef(new Map<string, HTMLButtonElement>());
  // The tab to focus once a keyboard close has committed. An effect, not
  // requestAnimationFrame: rAF is throttled in background panes, and losing
  // focus to <body> strands a keyboard user.
  const focusAfterClose = useRef<string | null>(null);
  useEffect(() => {
    if (focusAfterClose.current == null) return;
    refs.current.get(focusAfterClose.current)?.focus();
    focusAfterClose.current = null;
  });

  const onKeyDown = (e: KeyboardEvent, at: number) => {
    if (e.key === "Delete") {
      e.preventDefault();
      const next = tabs[at + 1] ?? tabs[at - 1];
      focusAfterClose.current = next ? next.key : null;
      onClose(tabs[at].key);
      return;
    }
    const target =
      e.key === "ArrowRight" ? tabs[(at + 1) % tabs.length] : e.key === "ArrowLeft" ? tabs[(at - 1 + tabs.length) % tabs.length] : null;
    if (!target) return;
    e.preventDefault();
    onActivate(target.key);
    refs.current.get(target.key)?.focus();
  };

  return (
    <div role="tablist" aria-label="Open editors" className="flex h-[34px] shrink-0 overflow-x-auto border-b border-border bg-bg">
      {tabs.map((t, i) => {
        const isActive = t.key === active;
        return (
          <div
            key={t.key}
            className={cn(
              "group flex shrink-0 items-center border-t-2 border-r border-r-border",
              isActive ? "border-t-accent bg-card" : "border-t-transparent",
            )}
            onAuxClick={(e) => {
              if (e.button === 1) onClose(t.key);
            }}
          >
            <button
              type="button"
              role="tab"
              id={`${panelId}-tab-${t.key}`}
              aria-selected={isActive}
              aria-controls={panelId}
              tabIndex={isActive || (active == null && i === 0) ? 0 : -1}
              ref={(el) => {
                if (el) refs.current.set(t.key, el);
                else refs.current.delete(t.key);
              }}
              onClick={() => onActivate(t.key)}
              onKeyDown={(e) => onKeyDown(e, i)}
              className={cn(
                "flex h-full items-center gap-1.5 pr-1 pl-3 text-[12px] whitespace-nowrap outline-none focus-visible:ring-1 focus-visible:ring-accent focus-visible:ring-inset",
                isActive ? "text-fg" : "text-muted hover:text-fg",
              )}
            >
              {t.icon}
              {t.title}
            </button>
            <button
              type="button"
              aria-label={`Close ${t.title}`}
              tabIndex={-1}
              onClick={() => onClose(t.key)}
              className={cn(
                "mr-1.5 grid size-5 place-items-center rounded-[4px] text-muted hover:bg-blue-soft hover:text-fg",
                isActive ? "opacity-100" : "opacity-0 group-hover:opacity-100 focus-visible:opacity-100",
              )}
            >
              <X className="size-3.5" aria-hidden />
            </button>
          </div>
        );
      })}
    </div>
  );
}
