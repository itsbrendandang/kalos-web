"use client";

import { useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { ChevronRight, CircleCheck, CircleDashed, History } from "lucide-react";
import { cn, num } from "@/lib/utils";
import { inFlight, measured, shortId, type ActiveCampaign, type SectionKey, type WorkbenchTab } from "@/lib/workbench";

type Item =
  | { kind: "section"; key: SectionKey; label: string; count: number }
  | { kind: "leaf"; key: string; parent: SectionKey; tab: WorkbenchTab; icon: ReactNode; label: string; detail: string; title: string };

/**
 * The workbench's EXPLORER: the campaign as a tree - runs in flight, runs
 * measured this round, and the rounds so far. A real ARIA tree with VS Code's
 * keyboard model (arrows move/expand/collapse, Enter opens, Home/End) and a
 * single roving tab stop, so it is one Tab press to get in and one to get out.
 */
export function Explorer({
  campaign,
  activeKey,
  onOpen,
}: {
  campaign: ActiveCampaign;
  activeKey: string | null;
  onOpen: (tab: WorkbenchTab) => void;
}) {
  const [collapsed, setCollapsed] = useState<Set<SectionKey>>(new Set());
  const [focusKey, setFocusKey] = useState<string>("in-flight");
  const refs = useRef(new Map<string, HTMLDivElement>());

  const flying = inFlight(campaign);
  const done = measured(campaign);
  const rounds = [...campaign.history].reverse();

  const sections: { key: SectionKey; label: string; leaves: Item[] }[] = [
    {
      key: "in-flight",
      label: "In flight",
      leaves: flying.map((r) => ({
        kind: "leaf",
        key: `run:${r.id}`,
        parent: "in-flight",
        tab: { kind: "run", runId: r.id },
        icon: <CircleDashed className="size-3.5 text-amber" aria-hidden />,
        label: shortId(r.id),
        // "pred", not "~": in 11px mono a tilde reads as a minus sign, right
        // beside measured values that can genuinely be negative.
        detail: `pred ${num(r.pred, 2)}`,
        title: `Run ${shortId(r.id)}, awaiting a result, predicted ${num(r.pred, 2)}`,
      })),
    },
    {
      key: "measured",
      label: "Measured",
      leaves: done.map((r) => ({
        kind: "leaf",
        key: `run:${r.id}`,
        parent: "measured",
        tab: { kind: "run", runId: r.id },
        icon: <CircleCheck className="size-3.5 text-green" aria-hidden />,
        label: shortId(r.id),
        detail: r.result == null ? "-" : num(r.result, 2),
        title: `Run ${shortId(r.id)}, measured ${r.result == null ? "-" : num(r.result, 2)}`,
      })),
    },
    {
      key: "rounds",
      label: "Rounds",
      leaves: rounds.map((h) => ({
        kind: "leaf",
        key: `round:${h.round}`,
        parent: "rounds",
        tab: { kind: "progress" },
        icon: <History className="size-3.5 text-muted" aria-hidden />,
        label: `Round ${h.round}`,
        detail: h.best == null ? "-" : num(h.best, 2),
        title: `Round ${h.round}, best ${h.best == null ? "none measured" : num(h.best, 2)}, ${h.n_base} rows`,
      })),
    },
  ];

  // The visible rows in order: what arrow keys walk through.
  const visible: Item[] = sections.flatMap((s) => [
    { kind: "section", key: s.key, label: s.label, count: s.leaves.length } as Item,
    ...(collapsed.has(s.key) ? [] : s.leaves),
  ]);
  const focus = visible.some((i) => i.key === focusKey) ? focusKey : visible[0]?.key;

  const toggle = (key: SectionKey, open?: boolean) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      const isOpen = !prev.has(key);
      if (open ?? !isOpen) next.delete(key);
      else next.add(key);
      return next;
    });

  const moveTo = (key: string | undefined) => {
    if (!key) return;
    setFocusKey(key);
    refs.current.get(key)?.focus();
  };

  const onKeyDown = (e: KeyboardEvent, item: Item) => {
    const at = visible.findIndex((i) => i.key === item.key);
    switch (e.key) {
      case "ArrowDown":
        moveTo(visible[at + 1]?.key);
        break;
      case "ArrowUp":
        moveTo(visible[at - 1]?.key);
        break;
      case "Home":
        moveTo(visible[0]?.key);
        break;
      case "End":
        moveTo(visible[visible.length - 1]?.key);
        break;
      case "ArrowRight":
        if (item.kind === "section") {
          if (collapsed.has(item.key)) toggle(item.key, true);
          else if (visible[at + 1]?.kind === "leaf") moveTo(visible[at + 1].key);
        }
        break;
      case "ArrowLeft":
        if (item.kind === "leaf") moveTo(item.parent);
        else if (!collapsed.has(item.key)) toggle(item.key, false);
        break;
      case "Enter":
      case " ":
        if (item.kind === "section") toggle(item.key);
        else onOpen(item.tab);
        break;
      default:
        return;
    }
    e.preventDefault();
  };

  const row = (item: Item, level: number, children?: ReactNode) => {
    const isSection = item.kind === "section";
    const expanded = isSection ? !collapsed.has(item.key) : undefined;
    const selected = !isSection && item.tab.kind === "run" && `run:${item.tab.runId}` === activeKey;
    return (
      <div
        key={item.key}
        role="treeitem"
        aria-level={level}
        aria-expanded={expanded}
        aria-selected={isSection ? undefined : selected}
        aria-label={isSection ? `${item.label}, ${item.count}` : item.title}
        tabIndex={item.key === focus ? 0 : -1}
        ref={(el) => {
          if (el) refs.current.set(item.key, el);
          else refs.current.delete(item.key);
        }}
        onKeyDown={(e) => {
          if (e.target === e.currentTarget) onKeyDown(e, item);
        }}
        onClick={(e) => {
          if (e.target !== e.currentTarget && !(e.currentTarget.firstElementChild?.contains(e.target as Node) ?? false)) return;
          setFocusKey(item.key);
          if (isSection) toggle(item.key);
          else onOpen(item.tab);
        }}
        className="outline-none [&:focus-visible>div:first-child]:ring-1 [&:focus-visible>div:first-child]:ring-accent [&:focus-visible>div:first-child]:ring-inset"
      >
        <div
          className={cn(
            "flex h-[22px] cursor-pointer items-center gap-1.5 pr-2 text-[12px] select-none",
            selected ? "bg-blue-tint text-fg" : "text-fg hover:bg-blue-soft",
          )}
          style={{ paddingLeft: isSection ? 6 : 26 }}
        >
          {isSection ? (
            <>
              <ChevronRight className={cn("size-3.5 shrink-0 text-muted transition-transform", expanded && "rotate-90")} aria-hidden />
              <span className="flex-1 truncate text-[11px] font-semibold tracking-wide uppercase">{item.label}</span>
              <span className="tabular rounded-full bg-blue-soft px-1.5 font-mono text-[10px] text-muted">{item.count}</span>
            </>
          ) : (
            <>
              {item.icon}
              <span className="flex-1 truncate font-mono">{item.label}</span>
              <span className="tabular font-mono text-[11px] text-muted">{item.detail}</span>
            </>
          )}
        </div>
        {children}
      </div>
    );
  };

  return (
    <div role="tree" aria-label={`Campaign ${campaign.target}`} className="py-1">
      {sections.map((s) => {
        const sectionItem = visible.find((i) => i.key === s.key) as Item;
        const open = !collapsed.has(s.key);
        return row(
          sectionItem,
          1,
          open ? (
            <div role="group">
              {s.leaves.length ? (
                s.leaves.map((leaf) => row(leaf, 2))
              ) : (
                <div className="h-[22px] pl-[26px] text-[11px] leading-[22px] text-muted italic">
                  {s.key === "in-flight" ? "none running" : s.key === "measured" ? "none this round" : "no rounds yet"}
                </div>
              )}
            </div>
          ) : null,
        );
      })}
    </div>
  );
}
