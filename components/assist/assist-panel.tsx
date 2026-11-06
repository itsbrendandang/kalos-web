"use client";

import Link from "next/link";
import { Dialog } from "@base-ui/react/dialog";
import { X } from "lucide-react";
import { AssistChat } from "@/components/assist/assist-chat";
import { useAssistPanel } from "@/hooks/use-assist";

/**
 * "Ask Kalos": a panel on the right, opened from the sidebar or ⌘J. The body
 * is the same as the Ask Kalos page (/agent); this is the version you open
 * without leaving the page you are on.
 */
export function AssistPanel() {
  const { open, setOpen } = useAssistPanel();
  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-50 bg-black/30 transition-opacity duration-150 data-ending-style:opacity-0 data-starting-style:opacity-0 dark:bg-black/60" />
        <Dialog.Popup
          aria-label="Ask Kalos"
          className="fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col border-l border-border bg-surface text-fg shadow-popover transition-transform duration-200 data-ending-style:translate-x-full data-starting-style:translate-x-full"
        >
          <div className="flex h-12 shrink-0 items-center gap-2 border-b border-border px-4">
            <Dialog.Title className="flex-1 text-heading text-fg">Ask Kalos</Dialog.Title>
            <Link href="/agent" onClick={() => setOpen(false)} className="text-caption text-fg-muted hover:text-fg">
              Open as a page
            </Link>
            <Dialog.Close aria-label="Close" className="grid size-8 place-items-center rounded-lg text-fg-muted hover:bg-fill-hover hover:text-fg">
              <X className="size-4" aria-hidden />
            </Dialog.Close>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-5">
            <AssistChat />
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
