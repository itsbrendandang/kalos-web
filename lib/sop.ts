/*
 * Pure rules for procedure drafts (the engine's /api/assist/sop routes). A
 * draft is written by the engine from campaign records only; the model is
 * used for wording changes alone, and every number stays what the record
 * says. Tested in __tests__/sop.test.ts.
 */

export type SopTemplate = "batch_recipe" | "media_prep" | "custom";

/** Exactly one of these picks what the draft is written from. */
export type SopSource = { run_ids: string[] } | { proposal_index: number[] } | { round: number };

export type SopRecordField = { section: string; field: string; value: string; source_id: string };
export type SopPlaceholder = { name: string; section: string; why: string };
export type SopFilled = { name: string; section: string; value: string; filled_by: string };

export type SopDraft = {
  draft_id: string;
  version: number;
  title: string;
  template: SopTemplate | (string & {});
  campaign_id: string;
  created_at: string;
  sha256?: string;
  /** The model that wrote this version's wording; null when no model touched it (v1 and every fill). */
  model: string | null;
  source_ids: string[];
  markdown: string;
  fields_from_record: SopRecordField[];
  placeholders: SopPlaceholder[];
  filled?: SopFilled[];
};

export type SopSummary = {
  draft_id: string;
  title: string;
  template: SopTemplate | (string & {});
  campaign_id: string;
  latest_version: number;
  created_at: string;
  updated_at: string;
  /** What the draft was written from. Absent on an engine that lists drafts without it. */
  source_ids?: string[];
};

export const SOP_TEMPLATES: { value: SopTemplate; label: string; description: string }[] = [
  { value: "batch_recipe", label: "Run a recipe", description: "The steps to set up and run one recipe, with its settings taken from your records." },
  { value: "media_prep", label: "Prepare media", description: "The steps to make up the media for a recipe, with the amounts taken from your records." },
  { value: "custom", label: "Blank", description: "A bare outline with the records attached, for a procedure of your own." },
];

export function templateLabel(template: string): string {
  return SOP_TEMPLATES.find((t) => t.value === template)?.label ?? template.replace(/_/g, " ");
}

/** The placeholder the engine writes for something only the lab can fill in. */
export const PLACEHOLDER_RE = /\[\[TO FILL: ([a-z0-9_]+)\]\]/g;

/** The placeholder's name in plain words: `acceptance_limit_titer` reads "acceptance limit titer". */
export function placeholderLabel(name: string): string {
  const words = name.replace(/_/g, " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** The header line every draft starts with. Always shown, never editable. */
export function draftHeader(markdown: string): string | null {
  const first = markdown.split("\n")[0]?.trim() ?? "";
  return first.startsWith(">") ? first.replace(/^>\s*/, "") : null;
}

/** The markdown without its header line, for the editor's rendered side. */
export function draftBody(markdown: string): string {
  const lines = markdown.split("\n");
  if (lines[0]?.trim().startsWith(">")) return lines.slice(1).join("\n").replace(/^\n+/, "");
  return markdown;
}

/** Where a record a draft quotes lives in the app. */
export function sopSourceHref(sourceId: string): string | null {
  const [kind, rest] = splitSourceId(sourceId);
  switch (kind) {
    case "run":
      return "/campaign/run";
    case "proposal":
      return "/campaign/plan";
    case "analysis":
      return "/campaign/learn";
    case "sheet":
      return /^[0-9a-f]{64}$/i.test(rest) ? `/data/sheet/${rest}` : "/data";
    case "round":
      return /^\d{1,6}$/.test(rest) ? `/data/round/${Number(rest) + 1}` : "/data";
    default:
      return null;
  }
}

export function sopSourceLabel(sourceId: string): string {
  const [kind, rest] = splitSourceId(sourceId);
  switch (kind) {
    case "run":
      return `Run ${rest.slice(0, 7)}`;
    case "proposal": {
      // The engine writes its own 0-based round; people count from 1 (displayRound in lib/campaign-stage.ts).
      const [round, index] = rest.split(".");
      return index != null && /^\d+$/.test(round) ? `Recipe ${Number(index) + 1} of round ${Number(round) + 1}` : `Recipe ${rest}`;
    }
    case "analysis":
      return `Model results: ${rest.replace(/_/g, " ")}`;
    case "sheet":
      return `Sheet ${rest.slice(0, 7)}`;
    case "round":
      return /^\d{1,6}$/.test(rest) ? `Round ${Number(rest) + 1}` : `Round ${rest}`;
    default:
      return sourceId;
  }
}

function splitSourceId(sourceId: string): [string, string] {
  const i = sourceId.indexOf(":");
  return i < 0 ? [sourceId, ""] : [sourceId.slice(0, i), sourceId.slice(i + 1)];
}

/**
 * Whether a question in the panel is really a request for a procedure, like
 * "write an SOP for round 2" or "draft a protocol for recipe 3". Returns the
 * source it names when it names one, so the draft dialog opens pre-filled.
 */
export function detectProcedureAsk(question: string): { round?: number; proposal?: number } | null {
  const q = question.trim();
  if (!/\b(sop|procedure|protocol|work instruction)s?\b/i.test(q)) return null;
  if (!/\b(write|draft|make|create|prepare|generate|produce|give me|need)\b/i.test(q)) return null;
  const round = /\bround\s+(\d{1,4})\b/i.exec(q);
  const proposal = /\b(?:recipe|proposal)\s+(\d{1,3})\b/i.exec(q);
  return { ...(round ? { round: Number(round[1]) } : {}), ...(proposal ? { proposal: Number(proposal[1]) - 1 } : {}) };
}

/** A single-line value the engine accepts for a placeholder, or the reason it would refuse it. */
export function checkFillValue(value: string): string | null {
  if (!value.trim()) return "Type a value first.";
  if (value.length > 500) return "Keep it under 500 characters.";
  if (/[\r\n]/.test(value)) return "One line only.";
  if (value.includes("[[") || value.includes("]]")) return "Square brackets are not allowed here.";
  return null;
}

// --- A small markdown reader for the rendered draft -------------------------
// Covers what the engine writes: headings, paragraphs, bullets, numbered
// steps, pipe tables and the header blockquote; inline bold, code and the
// [[TO FILL: name]] placeholders. Nothing is interpreted as HTML.

export type Inline = { kind: "text"; text: string } | { kind: "bold"; text: string } | { kind: "code"; text: string } | { kind: "placeholder"; name: string };

export type Block =
  | { kind: "heading"; level: 1 | 2 | 3; inline: Inline[] }
  | { kind: "paragraph"; inline: Inline[] }
  | { kind: "quote"; inline: Inline[] }
  | { kind: "list"; ordered: boolean; items: Inline[][] }
  | { kind: "table"; header: Inline[][]; rows: Inline[][][] };

export function parseInline(text: string): Inline[] {
  const out: Inline[] = [];
  const re = /\[\[TO FILL: ([a-z0-9_]+)\]\]|\*\*([^*]+)\*\*|`([^`]+)`/g;
  let last = 0;
  for (const m of text.matchAll(re)) {
    if (m.index! > last) out.push({ kind: "text", text: text.slice(last, m.index) });
    if (m[1] != null) out.push({ kind: "placeholder", name: m[1] });
    else if (m[2] != null) out.push({ kind: "bold", text: m[2] });
    else if (m[3] != null) out.push({ kind: "code", text: m[3] });
    last = m.index! + m[0].length;
  }
  if (last < text.length) out.push({ kind: "text", text: text.slice(last) });
  return out;
}

const splitRow = (line: string): string[] =>
  line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((c) => c.trim());

export function parseMarkdown(markdown: string): Block[] {
  const lines = markdown.replace(/\r\n?/g, "\n").split("\n");
  const blocks: Block[] = [];
  let i = 0;
  const isTableRow = (l: string) => /^\s*\|.*\|\s*$/.test(l);
  const isRule = (l: string) => /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(l);
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) {
      i++;
      continue;
    }
    const heading = /^(#{1,3})\s+(.*)$/.exec(line);
    if (heading) {
      blocks.push({ kind: "heading", level: heading[1].length as 1 | 2 | 3, inline: parseInline(heading[2].trim()) });
      i++;
      continue;
    }
    if (/^\s*>/.test(line)) {
      const text: string[] = [];
      while (i < lines.length && /^\s*>/.test(lines[i])) {
        text.push(lines[i].replace(/^\s*>\s?/, ""));
        i++;
      }
      blocks.push({ kind: "quote", inline: parseInline(text.join(" ")) });
      continue;
    }
    if (isTableRow(line) && i + 1 < lines.length && isRule(lines[i + 1])) {
      const header = splitRow(line).map(parseInline);
      i += 2;
      const rows: Inline[][][] = [];
      while (i < lines.length && isTableRow(lines[i])) {
        rows.push(splitRow(lines[i]).map(parseInline));
        i++;
      }
      blocks.push({ kind: "table", header, rows });
      continue;
    }
    const bullet = /^\s*[-*]\s+/;
    const number = /^\s*\d+[.)]\s+/;
    if (bullet.test(line) || number.test(line)) {
      const ordered = number.test(line);
      const re = ordered ? number : bullet;
      const items: Inline[][] = [];
      while (i < lines.length && re.test(lines[i])) {
        items.push(parseInline(lines[i].replace(re, "").trim()));
        i++;
      }
      blocks.push({ kind: "list", ordered, items });
      continue;
    }
    const text: string[] = [];
    while (i < lines.length && lines[i].trim() && !/^(#{1,3})\s/.test(lines[i]) && !/^\s*>/.test(lines[i]) && !bullet.test(lines[i]) && !number.test(lines[i]) && !isTableRow(lines[i])) {
      text.push(lines[i].trim());
      i++;
    }
    blocks.push({ kind: "paragraph", inline: parseInline(text.join(" ")) });
  }
  return blocks;
}

/** The names of the placeholders still open in a draft, in the order they appear. */
export function openPlaceholders(markdown: string): string[] {
  const seen = new Set<string>();
  for (const m of markdown.matchAll(PLACEHOLDER_RE)) seen.add(m[1]);
  return [...seen];
}

/** True when the engine's placeholder list and the markdown agree; false means the page shows the markdown's. */
export function placeholdersAgree(draft: Pick<SopDraft, "markdown" | "placeholders">): boolean {
  const inText = openPlaceholders(draft.markdown).sort();
  const listed = draft.placeholders.map((p) => p.name).sort();
  return inText.length === listed.length && inText.every((n, i) => n === listed[i]);
}

export function formatDraftDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}
