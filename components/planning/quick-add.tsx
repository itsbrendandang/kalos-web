"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** The shared "+ Add ..." affordance used by both the toolbar's "Add Task"
 *  and each column's "Add an item": a plain trigger that swaps for a
 *  title-only inline input on click. Enter submits, Escape or blur-with-
 *  empty-input cancels - deliberately no modal, per the "keep it
 *  lightweight" brief. */
export function QuickAdd({
  label,
  placeholder = "Task title",
  onAdd,
  triggerClassName,
  inputClassName,
}: {
  label: string;
  placeholder?: string;
  onAdd: (title: string) => void;
  triggerClassName?: string;
  inputClassName?: string;
}) {
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState("");

  function cancel() {
    setAdding(false);
    setTitle("");
  }

  function submit() {
    const trimmed = title.trim();
    if (trimmed) onAdd(trimmed);
    cancel();
  }

  if (!adding) {
    return (
      <Button
        type="button"
        variant={triggerClassName ? "ghost" : "accent"}
        size={triggerClassName ? "sm" : "default"}
        onClick={() => setAdding(true)}
        className={triggerClassName}
      >
        <Plus />
        {label}
      </Button>
    );
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      className="flex items-center gap-1.5"
    >
      <input
        autoFocus
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") cancel();
        }}
        onBlur={() => {
          if (!title.trim()) cancel();
        }}
        placeholder={placeholder}
        className={cn(
          "h-8 min-w-0 flex-1 rounded-[10px] border border-border bg-card px-2.5 text-[12.5px] text-fg outline-none focus:border-accent-hover",
          inputClassName,
        )}
      />
      <Button type="submit" size="sm">
        Add
      </Button>
      <Button type="button" variant="ghost" size="sm" onClick={cancel}>
        Cancel
      </Button>
    </form>
  );
}
