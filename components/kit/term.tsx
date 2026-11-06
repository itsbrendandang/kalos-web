"use client";

import type { ReactNode } from "react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { GLOSSARY, WORDS_LINE_ORDER, type GlossaryKey } from "@/lib/glossary";
import { cn } from "@/lib/utils";

/**
 * One of the core nouns with its meaning on hover and focus (lib/glossary.ts). The word itself is the
 * children, so a sentence can say "campaign" or "campaigns"; the definition is also the `title`, so it is
 * there without a pointer, and screen readers get it through aria-describedby.
 */
export function Term({ word, children, className }: { word: GlossaryKey; children?: ReactNode; className?: string }) {
  const g = GLOSSARY[word];
  const text = `${g.word}: ${g.meaning}.`;
  return (
    <Tooltip>
      <TooltipTrigger
        render={<span />}
        tabIndex={0}
        title={text}
        className={cn("cursor-help rounded-sm underline decoration-border-strong decoration-dotted underline-offset-4 hover:decoration-fg-muted", className)}
      >
        {children ?? g.word}
      </TooltipTrigger>
      <TooltipContent>{text}</TooltipContent>
    </Tooltip>
  );
}

/**
 * "What these words mean", once under the first heading of Home and Setup: the six core nouns in one
 * line, each with its definition, so no later page has to introduce them.
 */
export function WordsLine({ className }: { className?: string }) {
  return (
    <p className={cn("max-w-[90ch] text-caption text-fg-muted", className)}>
      <span className="text-fg">What these words mean.</span>{" "}
      {WORDS_LINE_ORDER.map((k, i) => {
        const g = GLOSSARY[k];
        const article = k === "model" ? "" : k === "raise" ? "to " : "a ";
        return (
          <span key={k}>
            {i === 0 ? article.replace(/^./, (c) => c.toUpperCase()) : article}
            <Term word={k} className="text-fg">
              {k === "model" ? (i === 0 ? "The model" : "the model") : g.word}
            </Term>{" "}
            {k === "raise" ? "means" : "is"} {g.meaning}
            {i < WORDS_LINE_ORDER.length - 1 ? "; " : "."}
          </span>
        );
      })}
    </p>
  );
}
