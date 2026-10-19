"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

export type TreeLeaf = {
  kind: "leaf";
  key: string;
  href: string;
  label: ReactNode;
  /** A short right-aligned value, e.g. a predicted titer. */
  detail?: ReactNode;
  icon?: ReactNode;
  /**
   * State the icon shows, announced after the visible text. The accessible
   * name is the visible label and detail first, then this (WCAG 2.5.3).
   */
  status?: string;
  /** Monospace only for code-like labels (run ids). */
  mono?: boolean;
};

export type TreeGroup = {
  kind: "group";
  key: string;
  label: string;
  leaves: TreeLeaf[];
  /** What an empty group says, e.g. "None running". */
  empty?: string;
};

export type TreeNode = TreeLeaf | TreeGroup;

type Row = { node: TreeNode; parent: string | null };

/**
 * The explorer's tree, following the ARIA tree pattern with one roving tab
 * stop: Up/Down move, Right opens a group or enters it, Left closes it or
 * goes to the parent, Home/End jump, Enter or Space opens a leaf. Leaves are
 * links (so middle-click and "open in new tab" work); the one matching the
 * current route is selected.
 */
export function ExplorerTree({ label, nodes, activeHref }: { label: string; nodes: TreeNode[]; activeHref: string }) {
  const router = useRouter();
  const uid = useId();
  const [closed, setClosed] = useState<Set<string>>(new Set());
  const [focusKey, setFocusKey] = useState<string | null>(null);
  const refs = useRef(new Map<string, HTMLElement>());

  const visible: Row[] = nodes.flatMap((n): Row[] =>
    n.kind === "group" ? [{ node: n, parent: null }, ...(closed.has(n.key) ? [] : n.leaves.map((l) => ({ node: l, parent: n.key })))] : [{ node: n, parent: null }],
  );
  const selectedKey = visible.find((r) => r.node.kind === "leaf" && r.node.href === activeHref)?.node.key;
  const focus = visible.some((r) => r.node.key === focusKey) ? focusKey : (selectedKey ?? visible[0]?.node.key);

  const setOpen = (key: string, open: boolean) =>
    setClosed((prev) => {
      const next = new Set(prev);
      if (open) next.delete(key);
      else next.add(key);
      return next;
    });

  const moveTo = (key: string | undefined) => {
    if (!key) return;
    setFocusKey(key);
    refs.current.get(key)?.focus();
  };

  const onKeyDown = (e: KeyboardEvent, row: Row, at: number) => {
    const { node } = row;
    switch (e.key) {
      case "ArrowDown":
        moveTo(visible[at + 1]?.node.key);
        break;
      case "ArrowUp":
        moveTo(visible[at - 1]?.node.key);
        break;
      case "Home":
        moveTo(visible[0]?.node.key);
        break;
      case "End":
        moveTo(visible[visible.length - 1]?.node.key);
        break;
      case "ArrowRight":
        if (node.kind === "group") {
          if (closed.has(node.key)) setOpen(node.key, true);
          else moveTo(visible[at + 1]?.parent === node.key ? visible[at + 1].node.key : undefined);
        }
        break;
      case "ArrowLeft":
        if (node.kind === "group") setOpen(node.key, false);
        else moveTo(row.parent ?? undefined);
        break;
      case "Enter":
      case " ":
        if (node.kind === "group") setOpen(node.key, closed.has(node.key));
        else router.push(node.href);
        break;
      default:
        return;
    }
    e.preventDefault();
  };

  const register = (key: string) => (el: HTMLElement | null) => {
    if (el) refs.current.set(key, el);
    else refs.current.delete(key);
  };

  const leaf = (n: TreeLeaf, level: number) => {
    const at = visible.findIndex((r) => r.node.key === n.key);
    const selected = n.key === selectedKey;
    return (
      <Link
        key={n.key}
        href={n.href}
        role="treeitem"
        aria-level={level}
        aria-selected={selected}
        aria-current={selected ? "page" : undefined}
        tabIndex={n.key === focus ? 0 : -1}
        ref={register(n.key)}
        onFocus={() => setFocusKey(n.key)}
        onKeyDown={(e) => onKeyDown(e, visible[at], at)}
        className={cn(
          "flex h-7 items-center gap-2 rounded-md pr-2 text-label font-normal text-fg focus-visible:outline-offset-[-2px]",
          level === 1 ? "pl-2" : "pl-7",
          selected ? "bg-accent-soft" : "hover:bg-border/60",
        )}
      >
        {n.icon}
        <span className={cn("min-w-0 truncate", n.detail != null ? "max-w-[75%] shrink-0" : "flex-1", n.mono && "font-mono text-code")}>{n.label}</span>
        {n.detail != null ? <span className="ml-auto min-w-0 truncate text-caption text-fg-muted tabular-nums">{n.detail}</span> : null}
        {n.status ? <span className="sr-only">, {n.status}</span> : null}
      </Link>
    );
  };

  return (
    <div role="tree" aria-label={label} className="flex flex-col gap-px px-2 py-2">
      {nodes.map((n) => {
        if (n.kind === "leaf") return leaf(n, 1);
        const at = visible.findIndex((r) => r.node.key === n.key);
        const open = !closed.has(n.key);
        const groupId = `${uid}-${n.key.replace(/[^\w-]/g, "_")}`;
        return (
          <div key={n.key} className="mt-2 first:mt-0">
            {/* The treeitem is the header row only, so its visible text is exactly
                its name; the group of leaves is owned via aria-owns instead of nested. */}
            <div
              role="treeitem"
              aria-level={1}
              aria-expanded={open}
              aria-selected={false}
              aria-owns={open ? groupId : undefined}
              tabIndex={n.key === focus ? 0 : -1}
              ref={register(n.key)}
              onFocus={() => setFocusKey(n.key)}
              onKeyDown={(e) => onKeyDown(e, visible[at], at)}
              onClick={() => {
                setFocusKey(n.key);
                setOpen(n.key, !open);
              }}
              className="flex h-7 cursor-pointer items-center gap-1.5 rounded-md px-1 text-caption font-medium text-fg-muted select-none hover:text-fg focus-visible:outline-offset-[-2px]"
            >
              <ChevronRight className={cn("size-3.5 shrink-0 transition-transform", open && "rotate-90")} aria-hidden />
              <span className="flex-1 truncate">{n.label}</span>
              <span className="tabular-nums">{n.leaves.length}</span>
            </div>
            {open ? (
              <div role="group" id={groupId} className="flex flex-col gap-px">
                {n.leaves.length ? n.leaves.map((l) => leaf(l, 2)) : <p className="h-7 pl-7 text-caption leading-7 text-fg-muted">{n.empty ?? "None"}</p>}
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
