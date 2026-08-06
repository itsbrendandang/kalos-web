import { cn } from "@/lib/utils";

// DEV-ONLY TOOL. Not a product surface.
//
// Renders every new campaign-workspace foundation token (canvas, node-stroke,
// action) plus the relevant existing tokens they sit alongside, in light and
// dark side by side at once - each half is forced into its mode via a local
// `.dark` wrapper (not the global <html> class), so both render
// simultaneously without a toggle. Also renders a type specimen at the exact
// sizes the redesign uses.
//
// Route lives at app/%5Ftokens (the URL-encoded form of app/_tokens) because
// Next.js treats a literal `_tokens` folder as a private, non-routable
// folder - see node_modules/next/dist/docs/01-app/01-getting-started/
// 02-project-structure.md, "Private folders" / "you can create URL segments
// that start with an underscore by prefixing the folder name with %5F".
//
// The hex values and contrast ratios below are not computed at runtime - they
// were measured with a throwaway WCAG contrast script against the real
// tokens in app/globals.css (not eyeballed) and are transcribed here as
// static data so this page has no color-math dependency. See DESIGN.md
// "Campaign-workspace foundation tokens" for the same numbers and the
// reasoning behind each dark value.

type Ratio = { against: string; ratio: number; note?: string };

type TokenSwatch = {
  hex: string;
  ratios?: Ratio[];
};

type Token = {
  name: string;
  cssVar: string;
  role: string;
  light: TokenSwatch;
  dark: TokenSwatch;
  isNew: boolean;
};

const TOKENS: Token[] = [
  {
    name: "canvas",
    cssVar: "--canvas",
    role: "New. Workspace backdrop behind white/card planes. Distinct from --bg on purpose.",
    isNew: true,
    light: {
      hex: "#eaeef5",
      ratios: [
        { against: "--bg (#f6f8fc)", ratio: 1.09 },
        { against: "--card (#ffffff)", ratio: 1.16 },
      ],
    },
    dark: {
      hex: "#030306",
      ratios: [
        { against: "--bg (#0a0a0a)", ratio: 1.04 },
        { against: "--card (#18181b)", ratio: 1.16, note: "retuned from #101012 (1.07) to match light's 1.16" },
      ],
    },
  },
  {
    name: "node-stroke",
    cssVar: "--node-stroke",
    role: "New. Graph node strokes and SOP node strokes (Map tab). Close to but not equal to --explore.",
    isNew: true,
    light: {
      hex: "#8690a2",
      ratios: [
        { against: "--card (#ffffff)", ratio: 3.22, note: "retuned from #98a2b3 (2.58) to clear the 3:1 non-text floor" },
        { against: "--bg (#f6f8fc)", ratio: 3.03 },
        { against: "--canvas (#eaeef5)", ratio: 2.77, note: "below 3:1 - no node line-art is drawn on --canvas" },
      ],
    },
    dark: {
      hex: "#98a2b3",
      ratios: [
        { against: "--card (#18181b)", ratio: 6.88 },
        { against: "--bg (#0a0a0a)", ratio: 7.69 },
        { against: "--canvas (#030306)", ratio: 8.0 },
      ],
    },
  },
  {
    name: "action",
    cssVar: "--action",
    role: "New. Filled-button/badge fill for the campaign workspace. Adopted as #343434, kept separate from --blue.",
    isNew: true,
    light: {
      hex: "#343434",
      ratios: [{ against: "white text", ratio: 12.45, note: "AA pass" }],
    },
    dark: {
      hex: "#65666c",
      ratios: [
        { against: "white text", ratio: 5.72, note: "AA pass" },
        { against: "--bg (#0a0a0a)", ratio: 3.46 },
        { against: "--card (#18181b)", ratio: 3.1 },
        { against: "--canvas (#030306)", ratio: 3.6 },
      ],
    },
  },
  {
    name: "activity-0 .. activity-4",
    cssVar: "--activity-0 … --activity-4",
    role: "New. Activity-strip ramp, quiet to busy. Five discrete buckets, not a gradient. Level 4 (the swatch) is exactly --green in each mode; levels 0-3 walk down from it - light #eef1f5 / #dbe7dd / #b3d1ba / #6da77f, dark #232327 / #16351f / #1b5c33 / #24894a.",
    isNew: true,
    light: {
      hex: "#1f7a34",
      ratios: [
        { against: "--card (#ffffff), level 0", ratio: 1.13 },
        { against: "--card (#ffffff), level 4", ratio: 5.4 },
      ],
    },
    dark: {
      hex: "#34c77a",
      ratios: [
        { against: "--card (#18181b), level 0", ratio: 1.13 },
        { against: "--card (#18181b), level 4", ratio: 8.1 },
      ],
    },
  },
  {
    name: "activity-future",
    cssVar: "--activity-future",
    role: "New. Dashed outline of a day that has not happened yet. Same value as --border in light; retuned in dark, where --border would vanish on the card.",
    isNew: true,
    light: { hex: "#d9e2f2", ratios: [{ against: "--card (#ffffff)", ratio: 1.3 }] },
    dark: { hex: "#2e2e33", ratios: [{ against: "--card (#18181b)", ratio: 1.31, note: "--border would be 1.10 here" }] },
  },
  { name: "bg", cssVar: "--bg", role: "Existing. Page background.", isNew: false, light: { hex: "#f6f8fc" }, dark: { hex: "#0a0a0a" } },
  { name: "card", cssVar: "--card", role: "Existing. Card / surface background.", isNew: false, light: { hex: "#ffffff" }, dark: { hex: "#18181b" } },
  { name: "border", cssVar: "--border", role: "Existing. Default hairline border.", isNew: false, light: { hex: "#d9e2f2" }, dark: { hex: "#212123" } },
  { name: "fg", cssVar: "--fg", role: "Existing. Primary text.", isNew: false, light: { hex: "#101828" }, dark: { hex: "#fafafa" } },
  { name: "muted", cssVar: "--muted", role: "Existing. Secondary text.", isNew: false, light: { hex: "#667085" }, dark: { hex: "#a1a1aa" } },
  { name: "blue / accent / primary", cssVar: "--blue", role: "Existing. Neutral chrome accent (not a hue). Left untouched by this pass.", isNew: false, light: { hex: "#171717" }, dark: { hex: "#fafafa" } },
  { name: "explore", cssVar: "--explore", role: "Existing. Exploratory/secondary tone. Visually close to node-stroke but a separate token.", isNew: false, light: { hex: "#9ca3af" }, dark: { hex: "#9ca3af" } },
  { name: "green", cssVar: "--green", role: "Existing. Success / round-best.", isNew: false, light: { hex: "#1f7a34" }, dark: { hex: "#34c77a" } },
  { name: "amber", cssVar: "--amber", role: "Existing. Warning. Kept as-is - #b45309 from the mock was rejected.", isNew: false, light: { hex: "#9a5b00" }, dark: { hex: "#e0a530" } },
  { name: "red", cssVar: "--red", role: "Existing. Fail / error.", isNew: false, light: { hex: "#c0392b" }, dark: { hex: "#f16354" } },
];

function HexSwatch({ hex, ratios }: { hex: string; ratios?: Ratio[] }) {
  return (
    <div className="flex items-center gap-3 rounded-[10px] border border-border bg-card p-2.5">
      {/* Intentional literal-hex exception, same one DESIGN.md already
          documents for components/voyager/linkage-tree.tsx: this component's
          entire job is to render the concrete computed color a token
          resolves to, so it cannot itself be styled through that token. */}
      <div className="size-10 shrink-0 rounded-[8px] border border-border" style={{ background: hex }} aria-hidden />
      <div className="min-w-0 flex-1">
        <div className="font-plex-mono text-[11px] font-semibold text-fg">{hex}</div>
        {ratios && ratios.length > 0 ? (
          <div className="mt-1 flex flex-col gap-0.5">
            {ratios.map((r) => (
              <div key={r.against} className="font-plex-mono text-[10px] leading-tight text-muted">
                {r.ratio.toFixed(2)}:1 vs {r.against}
                {r.note ? <span className="text-muted/80"> - {r.note}</span> : null}
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function TokenRow({ token }: { token: Token }) {
  return (
    <div className="grid grid-cols-1 gap-3 border-b border-border py-4 md:grid-cols-[220px_1fr_1fr] md:items-start">
      <div>
        <div className="flex items-center gap-2">
          <span className="font-plex-mono text-[12.5px] font-semibold text-fg">{token.cssVar}</span>
          {token.isNew ? (
            <span className="rounded-full bg-green-soft px-2 py-0.5 text-[10px] font-semibold text-green">new</span>
          ) : null}
        </div>
        <p className="mt-1 text-[11.5px] leading-snug text-muted">{token.role}</p>
      </div>
      <div>
        <div className="mb-1.5 text-[10px] font-semibold tracking-[0.09em] text-muted uppercase">Light</div>
        <HexSwatch hex={token.light.hex} ratios={token.light.ratios} />
      </div>
      {/* Forces this half into dark mode locally via a scoped .dark wrapper,
          independent of the real <html class="dark"> toggle, so both modes
          render at once on this one page. */}
      <div className="dark">
        <div className="mb-1.5 text-[10px] font-semibold tracking-[0.09em] text-muted uppercase">Dark</div>
        <div className="rounded-[10px] bg-bg p-2">
          <HexSwatch hex={token.dark.hex} ratios={token.dark.ratios} />
        </div>
      </div>
    </div>
  );
}

function SpecimenRow({
  sizeLabel,
  roleLabel,
  className,
  children,
}: {
  sizeLabel: string;
  roleLabel: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1 border-b border-border py-4 last:border-b-0">
      <div className="font-plex-mono text-[10.5px] text-muted">
        {sizeLabel} - {roleLabel}
      </div>
      <div className={cn("text-fg", className)}>{children}</div>
    </div>
  );
}

export default function TokensPreviewPage() {
  return (
    <div className="flex flex-col gap-10 pb-16">
      <div className="flex items-start gap-3 rounded-[12px] border border-dashed border-amber bg-amber-soft p-4">
        <div className="mt-0.5 size-2 shrink-0 rounded-full bg-amber" aria-hidden />
        <div>
          <div className="text-[13px] font-semibold text-amber">Development preview - not a product surface</div>
          <p className="mt-1 max-w-[70ch] text-[12px] leading-relaxed text-amber">
            This route (<span className="font-plex-mono">/_tokens</span>) exists only to check the campaign-workspace
            token and type foundation before anything is built on top of it. It is intentionally unlinked from the
            app nav. Do not treat anything on this page as a shipped design.
          </p>
        </div>
      </div>

      <section>
        <h1 className="font-head text-[19px] font-bold text-fg">Foundation tokens</h1>
        <p className="mt-1 text-[12.5px] text-muted">
          Every new campaign-workspace token, plus the existing tokens it sits alongside. Light and dark render
          simultaneously - the dark column is a locally-scoped <code className="font-plex-mono">.dark</code> wrapper,
          not the page&apos;s real theme.
        </p>
        <div className="mt-4">
          {TOKENS.map((t) => (
            <TokenRow key={t.cssVar} token={t} />
          ))}
        </div>
      </section>

      <section>
        <h2 className="font-head text-[17px] font-bold text-fg">Type specimen</h2>
        <p className="mt-1 text-[12.5px] text-muted">
          Satoshi, Newsreader, and IBM Plex Mono at the exact sizes the redesign uses.
        </p>
        <div className="mt-4">
          <SpecimenRow sizeLabel="36px" roleLabel="serif hero - verdict headline (Newsreader 600)" className="font-serif text-[36px] leading-[1.2] font-semibold tracking-[-0.015em]">
            The model ranks recipes reliably, but not their exact titer.
          </SpecimenRow>
          <SpecimenRow sizeLabel="16.5px" roleLabel="serif hero subtext (Newsreader 400)" className="font-serif text-[16.5px] leading-[1.6] text-muted">
            Read the predictions as an ordering, not a promise.
          </SpecimenRow>
          <SpecimenRow sizeLabel="22px" roleLabel="mono stat numeral (IBM Plex Mono 600, tabular)" className="tabular font-plex-mono text-[22px] leading-none font-semibold">
            7.3
          </SpecimenRow>
          <SpecimenRow sizeLabel="15px" roleLabel="UI - sticky header title (Satoshi 700)" className="font-sans text-[15px] font-bold tracking-[-0.015em]">
            CHO titer uplift
          </SpecimenRow>
          <SpecimenRow sizeLabel="13.5px" roleLabel="UI - active campaign row title (Satoshi 600)" className="font-sans text-[13.5px] font-semibold tracking-[-0.005em]">
            CHO titer uplift
          </SpecimenRow>
          <SpecimenRow sizeLabel="12.5px" roleLabel="UI - segmented tab / list row (Satoshi 400-600)" className="font-sans text-[12.5px]">
            Log · Map · Brief
          </SpecimenRow>
          <SpecimenRow sizeLabel="12px" roleLabel="UI - body / button label (Satoshi 400-600)" className="font-sans text-[12px]">
            Approve round 4
          </SpecimenRow>
          <SpecimenRow sizeLabel="11.5px" roleLabel="UI - muted subtitle / caption (Satoshi 400)" className="font-sans text-[11.5px] text-muted">
            Round 4 · awaiting you
          </SpecimenRow>
          <SpecimenRow sizeLabel="11px" roleLabel="mono meta - evidence chip (IBM Plex Mono 400)" className="font-plex-mono text-[11px] text-muted">
            glucose_gL
          </SpecimenRow>
          <SpecimenRow sizeLabel="10.5px" roleLabel="mono meta - timeline date / axis label (IBM Plex Mono 400)" className="font-plex-mono text-[10.5px] text-muted">
            21 JUL
          </SpecimenRow>
          <SpecimenRow sizeLabel="10px uppercase" roleLabel="eyebrow label, 0.09em tracking (Satoshi 600)" className="font-sans text-[10px] font-semibold tracking-[0.09em] text-muted uppercase">
            Campaign timeline
          </SpecimenRow>
        </div>
      </section>
    </div>
  );
}
