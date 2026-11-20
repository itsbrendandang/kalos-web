/*
 * Every page in the app, in one place: the sidebar, the mobile sheet, the
 * campaign stepper and per-page titles read from here, so a route is renamed
 * or added once. Labels are what people see. See docs/REDESIGN.md for which
 * engine capability backs each page.
 */

/** The engine's own 5-step campaign stage (kalos-engine campaign_stage.py). */
export type StageKey = "setup" | "plan" | "run" | "record" | "learn";

/** The three steps of a cycle the product is organized around. */
export type CycleKey = "harmonize" | "predict" | "validate";

/** A campaign sub-page: the overview (""), the three cycle steps, the report and the scale-up track. */
export type CampaignPage = "" | CycleKey | "report" | "scale-up";

export type RouteItem = { href: string; label: string; description: string };

export type CycleStep = {
  key: CycleKey;
  n: 1 | 2 | 3;
  label: string;
  description: string;
  /** The engine stages this step covers. */
  stages: readonly StageKey[];
};

/** Harmonize -> Predict -> Validate, repeated each round. */
export const CYCLE_STEPS: readonly CycleStep[] = [
  { key: "harmonize", n: 1, label: "Harmonize", description: "Upload prior runs, check the sheet, choose the target and see the explored design space.", stages: ["setup"] },
  { key: "predict", n: 2, label: "Predict", description: "Check how far the model can be trusted, then review and start the proposed batch.", stages: ["plan"] },
  { key: "validate", n: 3, label: "Validate", description: "Record measured results from the lab, compare them with the predictions, then learn and re-propose.", stages: ["run", "record", "learn"] },
];

/** Which cycle step an engine stage belongs to. */
export function cycleKeyFor(stage: StageKey): CycleKey {
  return CYCLE_STEPS.find((s) => s.stages.includes(stage))!.key;
}

/** The engine stages with their labels (the engine sends keys and states; the labels are ours). */
export const CAMPAIGN_STAGES = [
  { key: "setup", label: "Set up", description: "Upload a run sheet, check data quality and choose the target." },
  { key: "plan", label: "Plan", description: "Review and start the proposed batch." },
  { key: "run", label: "Run", description: "Runs in the lab, awaiting results." },
  { key: "record", label: "Record", description: "Enter measured results." },
  { key: "learn", label: "Learn", description: "Fold results into the model, then re-propose." },
] as const satisfies readonly { key: StageKey; label: string; description: string }[];

export const HOME_ROUTE: RouteItem = { href: "/", label: "Campaigns", description: "Every campaign, and where to start a new one." };
export const SCALE_UP_ROUTE: RouteItem = { href: "/scale-up", label: "Scale-up", description: "Predict-or-refuse readout for a larger scale, and each campaign's stage track." };
export const SETTINGS_ROUTE: RouteItem = { href: "/settings", label: "Settings", description: "Appearance, engine connection and optional integrations." };

/** `/campaigns/<id>` or one of its sub-pages. */
export function campaignHref(id: string, page: CampaignPage = ""): string {
  const base = `/campaigns/${encodeURIComponent(id)}`;
  return page ? `${base}/${page}` : base;
}

/** Where an engine stage's action lives: Validate holds run, record and learn (each with its own anchor). */
export function stageHref(id: string, stage: StageKey): string {
  const page = cycleKeyFor(stage);
  const anchor = stage === "record" ? "#record" : stage === "learn" ? "#learn" : "";
  return `${campaignHref(id, page)}${anchor}`;
}

export const CAMPAIGN_PAGE_LABEL: Record<CampaignPage, string> = {
  "": "Overview",
  harmonize: "Harmonize",
  predict: "Predict",
  validate: "Validate",
  report: "Report",
  "scale-up": "Scale-up track",
};

/** The campaign id and sub-page of a pathname, or null outside a campaign. */
export function parseCampaignPath(pathname: string): { id: string; page: CampaignPage } | null {
  const m = pathname.match(/^\/campaigns\/([^/]+)(?:\/([^/]+))?\/?$/);
  if (!m) return null;
  const page = (m[2] ?? "") as CampaignPage;
  if (!(page in CAMPAIGN_PAGE_LABEL)) return null;
  let id: string;
  try {
    id = decodeURIComponent(m[1]);
  } catch {
    return null;
  }
  return { id, page };
}

/** Which top-level section a pathname belongs to (sidebar highlight). */
export type SectionKey = "campaigns" | "scale-up" | "settings";

export function sectionFor(pathname: string): SectionKey {
  if (pathname.startsWith("/scale-up")) return "scale-up";
  if (pathname.startsWith("/settings")) return "settings";
  return "campaigns";
}
