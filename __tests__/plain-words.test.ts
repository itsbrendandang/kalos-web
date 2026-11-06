import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

/*
 * Plain words on the main surface. The reader is a lab scientist, so the words
 * below (statistics and software vocabulary, see docs/PLAIN-WORDS.md) may only
 * appear one click down: inside a <Disclosure>, the `detail` prop of <Verdict>,
 * the `method` prop of <ChartFrame>, a <TooltipContent>, or a module whose first
 * lines carry `// plain-words: disclosure-only`. Every other user-facing string
 * (JSX text, string and template literals that read as prose or labels) is
 * checked. Code-like strings (keys, class names, routes, comparisons, thrown
 * developer errors, console output) are skipped.
 */

export const BANNED_TERMS: { term: string; re: RegExp }[] = [
  { term: "held-out", re: /\bheld[- ]out\b/i },
  { term: "out-of-fold", re: /\bout[- ]of[- ]fold\b/i },
  { term: "cross-validation", re: /\bcross[- ]validat/i },
  { term: "Spearman", re: /\bspearman/i },
  { term: "rank correlation / rank agreement", re: /\brank (?:correlation|agreement)/i },
  { term: "correlation", re: /\bcorrelat/i },
  { term: "95% / CI / interval", re: /\b95\s?%|\bCI\b|\binterval\b/ },
  { term: "calibrated", re: /\bcalibrat/i },
  { term: "coverage", re: /\bcoverage\b/i },
  { term: "bin", re: /\bbins?\b/i },
  { term: "histogram", re: /\bhistogram/i },
  { term: "median", re: /\bmedian\b/i },
  { term: "sd / standard deviation", re: /\bsd\b|\(SD\)|\bstandard deviation/i },
  { term: "correlation ratio", re: /\bcorrelation ratio\b/i },
  { term: "surrogate", re: /\bsurrogate\b/i },
  { term: "acquisition", re: /\bacquisition\b/i },
  { term: "conformal", re: /\bconformal\b/i },
  { term: "posterior", re: /\bposterior\b/i },
  { term: "Explore / Exploit", re: /\bexplor(?:e|es|ed|ing|ation)\b|\bexploit/i },
  { term: "applicability domain", re: /\bapplicability\b/i },
  { term: "feasibility", re: /\bfeasib/i },
  { term: "significant", re: /\bsignifican/i },
  { term: "statistically", re: /\bstatistic/i },
  { term: "rho", re: /\brho\b/i },
  { term: "n =", re: /\bn\s?=/ },
  { term: "optimizer", re: /\boptimi[sz]er\b/i },
  { term: "incumbent", re: /\bincumbent\b/i },
  { term: "provenance", re: /\bprovenance\b/i },
  { term: "deterministic", re: /\bdeterministic\b/i },
  { term: "response surface", re: /\bresponse surface\b/i },
  { term: "sha / hash", re: /\bsha-?256\b|\bsha\b|\bhash(?:ed|es|ing)?\b/i },
  { term: "engine", re: /\bengine\b/i },
  { term: "payload", re: /\bpayload\b/i },
  { term: "role", re: /\broles?\b/i },
  { term: "schema", re: /\bschema\b/i },
  { term: "token", re: /\btokens?\b/i },
  { term: "setpoint", re: /\bsetpoints?\b/i },
  { term: "batch (say round)", re: /(?<!fed-)\bbatch(?:es)?\b/i },
  { term: "experiment (say run)", re: /\bexperiments?\b/i },
  { term: "dataset (say sheet)", re: /\bdata ?sets?\b/i },
  { term: "in flight (say in the lab)", re: /\bin[- ]flight\b/i },
  // DESIGN.md banned words
  { term: "validated", re: /\bvalidated\b/i },
  { term: "GMP", re: /\bGMP\b/ },
  { term: "Part 11", re: /\bPart 11\b/ },
  { term: "compliant", re: /\bcomplian/i },
  { term: "digital twin", re: /\bdigital twin\b/i },
  { term: "real-time", re: /\breal[- ]time\b/i },
  { term: "design space", re: /\bdesign space\b/i },
];

const ROOTS = ["app", "components", "lib", "hooks"];
const SKIP_PATH = [/^lib\/server\//, /^app\/api\//, /^lib\/mock\//, /\.test\.tsx?$/, /\.d\.ts$/];
const DISCLOSURE_TAGS = new Set(["Disclosure", "TooltipContent"]);
const DISCLOSURE_PROPS = new Set(["detail", "method"]);
const SKIP_ATTRS = new Set(["className", "href", "src", "id", "key", "name", "htmlFor", "data-testid", "viewBox", "d", "fill", "stroke", "dataKey", "xmlns", "rel", "target", "accept", "autoComplete", "inputMode", "pattern", "variant", "size", "tone", "as", "action", "transform", "textAnchor", "dominantBaseline", "x", "y", "cx", "cy", "r", "width", "height", "mode", "kind", "stage", "status", "state", "type", "role"]);
const SKIP_CALLS = new Set(["cn", "cva", "startsWith", "endsWith", "includes", "replace", "split", "join", "getItem", "setItem", "removeItem", "test", "match", "get", "set", "has", "delete", "querySelector", "addEventListener", "removeEventListener", "indexOf", "env", "warn", "error", "log", "debug", "info", "assert", "Error", "fetch", "redirect", "push"]);

/**
 * Files that still carry technical words on the surface. Each plain-words
 * commit removes its files from this list; the list must only ever shrink.
 * It is empty once the pass is complete.
 */
const PENDING_FILES = new Set<string>(
  readFileSync(join(__dirname, "fixtures", "plain-words-pending.txt"), "utf8")
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("#")),
);

function walk(dir: string, out: string[]): void {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.tsx?$/.test(e) && !SKIP_PATH.some((r) => r.test(p))) out.push(p);
  }
}

const CSS_TOKEN =
  /^(?:[a-z]+:)*(?:-?(?:bg|text|border|flex|grid|gap|p[xytblrse]?|m[xytblrse]?|w|h|min|max|rounded|items|justify|size|shrink|grow|top|left|right|bottom|z|overflow|whitespace|font|leading|tracking|cursor|select|transition|duration|ease|hover|focus|dark|sm|md|lg|xl|list|space|divide|ring|outline|shadow|opacity|col|row|order|self|place|content|aria|data|group|peer|fill|stroke|table|align|decoration|break|basis|animate|accent|line|pointer|scroll|snap|resize|object|aspect|columns|box|inset|translate|rotate|scale|origin|delay|will|backdrop|mix|caret|placeholder|from|to|via|supports|print|motion|has|where|not|first|last|odd|even|only|empty|disabled|enabled|checked|open|active|visited|sr|tabular)-[\w\-./[\]%()!]+|flex|grid|hidden|block|truncate|relative|absolute|sticky|fixed|glass|contents|inline|underline|italic|invisible|visible|collapse|isolate|uppercase|capitalize|antialiased|tabular-nums|sr-only|shrink-0|grow|static|inherit|none)$/;
const isCssLike = (t: string) => t === t.toLowerCase() && t.split(/\s+/).every((tok) => CSS_TOKEN.test(tok));

function looksLikeProse(t: string): boolean {
  const s = t.replace(/\s+/g, " ").trim();
  if (s.length < 3 || !/[A-Za-z]/.test(s)) return false;
  if (/^[a-z0-9_./:#?&=%-]+$/.test(s)) return false; // keys, routes, css values
  if (/^[A-Z][A-Z0-9_]+$/.test(s)) return false; // constants
  if (isCssLike(s)) return false;
  return /\s/.test(s) || /^[A-Z]/.test(s);
}

type Hit = { file: string; line: number; term: string; text: string };

function scan(file: string): Hit[] {
  const text = readFileSync(file, "utf8");
  if (/^\/\/ plain-words: disclosure-only/m.test(text.split("\n").slice(0, 5).join("\n"))) return [];
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, file.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const hits: Hit[] = [];
  const check = (n: ts.Node, s: string) => {
    if (!looksLikeProse(s)) return;
    for (const { term, re } of BANNED_TERMS) {
      if (re.test(s)) hits.push({ file, line: sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1, term, text: s.replace(/\s+/g, " ").trim().slice(0, 120) });
    }
  };
  const visit = (n: ts.Node, inside: boolean): void => {
    if (ts.isImportDeclaration(n) || ts.isExportDeclaration(n) || ts.isTypeNode(n) || ts.isTypeAliasDeclaration(n) || ts.isInterfaceDeclaration(n)) return;
    if (ts.isJsxElement(n) && DISCLOSURE_TAGS.has(n.openingElement.tagName.getText(sf))) {
      // The summary line of a closed disclosure is on the main surface; only its children are one click down.
      visit(n.openingElement, inside);
      n.children.forEach((c) => visit(c, true));
      return;
    }
    if (ts.isJsxAttribute(n)) {
      const name = n.name.getText(sf);
      if (SKIP_ATTRS.has(name)) return;
      if (DISCLOSURE_PROPS.has(name)) inside = true;
    }
    if (ts.isCallExpression(n)) {
      const callee = n.expression.getText(sf).split(".").pop() ?? "";
      if (SKIP_CALLS.has(callee)) return;
    }
    if (ts.isNewExpression(n) && /Error$/.test(n.expression.getText(sf))) return;
    if (ts.isThrowStatement(n)) return;
    if (ts.isPropertyAssignment(n)) {
      const name = n.name.getText(sf).replace(/["']/g, "");
      if (SKIP_ATTRS.has(name) || DISCLOSURE_PROPS.has(name)) {
        if (DISCLOSURE_PROPS.has(name)) ts.forEachChild(n, (c) => visit(c, true));
        return;
      }
    }
    if (!inside) {
      if (ts.isJsxText(n)) check(n, n.getText(sf));
      else if (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) {
        const p = n.parent;
        const skip =
          (ts.isBinaryExpression(p) && [ts.SyntaxKind.EqualsEqualsEqualsToken, ts.SyntaxKind.ExclamationEqualsEqualsToken].includes(p.operatorToken.kind)) ||
          ts.isCaseClause(p) ||
          ts.isElementAccessExpression(p) ||
          (ts.isPropertyAssignment(p) && p.name === n) ||
          ts.isLiteralTypeNode(p);
        if (!skip) check(n, n.text);
      } else if (ts.isTemplateExpression(n)) {
        check(n, [n.head.text, ...n.templateSpans.map((s) => s.literal.text)].join(" "));
      }
    }
    ts.forEachChild(n, (c) => visit(c, inside));
  };
  visit(sf, false);
  return hits;
}

describe("plain words on the main surface", () => {
  const files: string[] = [];
  for (const r of ROOTS) walk(r, files);

  it("keeps statistics and software vocabulary inside disclosures", () => {
    const hits = files.filter((f) => !PENDING_FILES.has(f)).flatMap(scan);
    const report = hits.map((h) => `${h.file}:${h.line}  [${h.term}]  ${h.text}`).join("\n");
    expect(hits, `\n${report}\n`).toEqual([]);
  });

  it("only lists files that still need the pass (the pending list only shrinks)", () => {
    for (const f of PENDING_FILES) expect(files, `${f} is listed as pending but does not exist`).toContain(f);
    const clean = [...PENDING_FILES].filter((f) => scan(f).length === 0);
    expect(clean, "these files are clean: remove them from __tests__/fixtures/plain-words-pending.txt").toEqual([]);
  });
});
