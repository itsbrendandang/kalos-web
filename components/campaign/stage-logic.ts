/*
 * Pure rules for the Setup, Run and Record pages, kept out of the components
 * so they are unit tested directly (__tests__/stage-pages.test.ts).
 */

import type { CampaignRun } from "@/lib/api";
import { sortFindings, type ValidationFinding } from "@/lib/validation";

// --- Setup -------------------------------------------------------------------

export const MAX_SHOWN_FINDINGS = 3;

/** Worst findings first; at most `limit` shown, the rest only counted. */
export function capFindings(findings: ValidationFinding[], limit = MAX_SHOWN_FINDINGS) {
  const sorted = sortFindings(findings);
  return { shown: sorted.slice(0, limit), hidden: Math.max(0, sorted.length - limit) };
}

// --- Run ---------------------------------------------------------------------

export const RUN_PAGE_SIZE = 10;

export type RunSortKey = "id" | "pred" | "result" | "status";
export type RunSort = { key: RunSortKey; direction: "ascending" | "descending" } | null;

/** Header click cycles ascending, descending, then back to the engine's order. */
export function nextSort(sort: RunSort, key: RunSortKey): RunSort {
  if (sort?.key !== key) return { key, direction: "ascending" };
  return sort.direction === "ascending" ? { key, direction: "descending" } : null;
}

/** A missing measurement sorts last in both directions, never as zero. */
export function sortRuns(runs: CampaignRun[], sort: RunSort): CampaignRun[] {
  if (!sort) return runs;
  const sign = sort.direction === "ascending" ? 1 : -1;
  const value = (r: CampaignRun): number | string | null =>
    sort.key === "id" ? r.id : sort.key === "pred" ? r.pred : sort.key === "result" ? r.result : r.awaiting ? 0 : 1;
  return [...runs].sort((a, b) => {
    const [x, y] = [value(a), value(b)];
    if (x == null || y == null) return x == null ? (y == null ? 0 : 1) : -1;
    return x < y ? -sign : x > y ? sign : 0;
  });
}

/** Clamp a 0-based page into range (the run list can shrink under the reader). */
export function clampPage(page: number, total: number, pageSize = RUN_PAGE_SIZE): number {
  return Math.min(Math.max(0, page), Math.max(0, Math.ceil(total / pageSize) - 1));
}

/** The recipe columns to show inline: the analysis' top drivers present in the recipe, else the first few inputs. */
export function inlineRecipeKeys(recipe: Record<string, number>, drivers: readonly string[], limit = 3): string[] {
  const ranked = drivers.filter((d) => d in recipe);
  return (ranked.length > 0 ? ranked : Object.keys(recipe)).slice(0, limit);
}

// --- Record ------------------------------------------------------------------

export const SANITY_FACTOR = 5;

/** Why a value needs the scientist's confirmation, or null when it looks ordinary. */
export function sanityReason(value: number, best: number | null): string | null {
  if (value < 0) return "is negative";
  // A multiple of a non-positive best means nothing, so only a positive best arms the 5x check.
  if (best != null && best > 0 && value > SANITY_FACTOR * best) return `is more than ${SANITY_FACTOR}x the best measured so far`;
  return null;
}

/** An entered string as a finite number, or null when blank or not a number. */
export function parseEntry(text: string): number | null {
  if (text.trim() === "") return null;
  const n = Number(text);
  return Number.isFinite(n) ? n : null;
}

/**
 * The rows a save must write: an awaiting run with a valid entry, or a logged
 * run whose entry now differs from its logged value. Untouched and invalid
 * entries are left out.
 */
export function changedRows(runs: CampaignRun[], drafts: Readonly<Record<string, string>>): { id: string; value: number }[] {
  return runs.flatMap((r) => {
    const value = r.id in drafts ? parseEntry(drafts[r.id]) : null;
    return value != null && (r.awaiting || value !== r.result) ? [{ id: r.id, value }] : [];
  });
}
