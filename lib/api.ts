// Client for the Kalos engine API (the FastAPI service in the kalos repo).
const API = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8050";

export type Proposal = {
  vals: number[];
  pred: number;
  std: number;
  mode: "explore" | "exploit";
  reason: string;
};

export type MultiProposal = {
  vals: number[];
  pred_titer: number;
  pred_purity: number;
  mode: "explore" | "exploit";
  reason: string;
};

export type SingleRun = {
  trajectory: { round: number; best: number; n: number }[];
  proposals: Proposal[];
  best_recipe: number[];
  best_value: number;
  optimum: number[];
};

export type MultiRun = {
  trajectory: { round: number; pareto: number; best_titer: number; best_purity: number }[];
  pareto: { titer: number; purity: number }[];
  all: { titer: number; purity: number }[];
  proposals: MultiProposal[];
};

export type AnalyzeResult = {
  n: number;
  d: number;
  target: string;
  group_col: string | null;
  targets: string[];
  features: string[];
  cv_spearman: number | null;
  best: number;
  drivers: { name: string; rho: number }[];
  proposal_features: string[];
  proposals: Proposal[];
  oof: [number, number][];
  error?: string;
};

async function unwrap<T>(r: Response): Promise<T> {
  if (!r.ok) {
    let detail = "";
    try {
      const body: unknown = await r.json();
      if (body && typeof body === "object" && "detail" in body) {
        const d = (body as { detail: unknown }).detail;
        if (typeof d === "string") detail = d;
      }
    } catch {
      try {
        detail = (await r.text()).slice(0, 200);
      } catch {
        detail = "";
      }
    }
    throw new Error(`Request failed (${r.status})${detail ? `: ${detail}` : ""}`);
  }
  return r.json() as Promise<T>;
}

export const runSingle = (): Promise<SingleRun> => fetch(`${API}/api/single`).then((r) => unwrap<SingleRun>(r));
export const runMulti = (): Promise<MultiRun> => fetch(`${API}/api/multi`).then((r) => unwrap<MultiRun>(r));

export async function runFile(file: File, target?: string): Promise<AnalyzeResult> {
  const fd = new FormData();
  fd.append("file", file);
  if (target) fd.append("target", target);
  return fetch(`${API}/api/run`, { method: "POST", body: fd }).then((r) => unwrap<AnalyzeResult>(r));
}

export { API };
