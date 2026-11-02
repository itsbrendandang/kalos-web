// Local-only chat about one reviewed experiment, answered by a model running on
// this device through Ollama. It refuses to run unless the app is in local
// (loopback) mode, so it cannot be reached as a public endpoint.
import type { NextRequest } from "next/server";
import { isLocalMode } from "@/lib/local-mode";
import { hostAllowed, originAllowed, readTextCapped } from "@/lib/server/local-guard";
import { ENGINE_CSRF_HEADER, ENGINE_CSRF_VALUE } from "@/lib/engine-csrf";

export const dynamic = "force-dynamic";

const OLLAMA = process.env.KALOS_LLM_URL ?? "http://127.0.0.1:11434";
const MODEL = process.env.KALOS_LLM_MODEL ?? "qwen2.5:7b";

const SYSTEM = `You help a scientist understand one experiment. You are given FACTS and FINDINGS that were computed from their data by fixed rules, plus their own notes.
Rules:
- Answer only from the FACTS, FINDINGS and NOTES. If they do not contain the answer, say "The data here does not show that" and say what would.
- Never invent numbers, wells, papers, authors, or citations. If asked for literature, say sources are not attached to this run.
- Say "suggests" or "is consistent with", never "proves". One run does not prove a cause.
- A step the scientist did to every well (for example never changing the medium) can still be the cause. Never clear them just because wells agree with each other; say the data points to something shared, and name what it could be from the FINDINGS.
- Keep it short: 3 to 6 sentences, plain language, no jargon without a word of explanation.
- When it helps, end with one concrete check the scientist can do.`;

type Msg = { role: "user" | "assistant"; content: string };

export async function POST(req: NextRequest): Promise<Response> {
  if (!isLocalMode()) return Response.json({ error: "Not available." }, { status: 404 });
  if (req.headers.get(ENGINE_CSRF_HEADER) !== ENGINE_CSRF_VALUE) return Response.json({ error: "Blocked." }, { status: 403 });
  const host = req.headers.get("host");
  if (!hostAllowed(host) || !originAllowed(req.headers.get("origin"), host)) return Response.json({ error: "Blocked." }, { status: 403 });

  const text = await readTextCapped(req, 256 * 1024);
  if (text === null) return Response.json({ error: "Too large." }, { status: 413 });
  let body: { messages?: (Msg | null)[]; context?: string };
  try {
    body = JSON.parse(text);
  } catch {
    return Response.json({ error: "Bad request." }, { status: 400 });
  }
  const messages = (Array.isArray(body?.messages) ? body.messages : []).filter((m): m is Msg => !!m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string").slice(-12).map((m) => ({ role: m.role, content: m.content.slice(0, 2000) }));
  const context = String(body?.context ?? "").slice(0, 20000);
  if (!messages.length || messages[messages.length - 1].role !== "user") return Response.json({ error: "Ask a question." }, { status: 400 });

  try {
    const r = await fetch(`${OLLAMA}/api/chat`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      signal: AbortSignal.timeout(120_000),
      body: JSON.stringify({ model: MODEL, stream: false, options: { temperature: 0.2 }, messages: [{ role: "system", content: `${SYSTEM}\n\n${context}` }, ...messages] }),
    });
    if (!r.ok) return Response.json({ error: `The local model answered with an error (${r.status}). Is "${MODEL}" installed?` }, { status: 502 });
    const j = (await r.json()) as { message?: { content?: string } };
    return Response.json({ reply: (j.message?.content ?? "").trim() || "The model gave no answer.", model: MODEL });
  } catch {
    return Response.json({ error: "No local model is running. Start Ollama and pull a model, then try again." }, { status: 503 });
  }
}
