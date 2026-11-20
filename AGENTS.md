<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Kalos web: rules for agents and contributors

These rules sit alongside the Next.js block that `next dev` maintains in this file. They are non-negotiable; if a task conflicts with one, stop and ask.

## 1. More real (honesty)
- Every number on screen comes from the engine. The web never computes, rounds away or invents results. Mock or demo data is never shown as real.
- Measured data is drawn solid and predictions hollow or dashed, always with their interval and its coverage label (90% or 95%). The engine's caveat text is shown on every proposal interval.
- Refusals and `not_judged` are rendered with their reason and next action. Never hide them or fill the gap.
- Number formatting goes through lib/num.ts (precision set by the uncertainty). Every headline number and chart has a source.
- The UI only claims features the engine actually provides.
- LLM text (Ask, setup suggestions) is labelled, cites its runs, and never supplies numbers.

## 2. Security
- The browser never holds engine tokens. The server mints a short-lived EdDSA token per request in the same-origin /api/engine proxy.
- The proxy allowlist grows only deliberately; every route keeps its CSRF (Origin plus X-Kalos-CSRF), scope and tenant checks.
- Dev bypasses (KALOS_DEV_NO_AUTH, NEXT_PUBLIC_API_URL) are never committed. Dev servers using them bind to 127.0.0.1 only (`-H 127.0.0.1`).
- Never commit secrets, .env files or customer data.

## 3. Design
- Follow DESIGN_POLISH.md, VIZ_SPEC.md and VIZ_SPEC_V2.md. Charts use visx; no new chart libraries.
- No Bioqore marketing, brand assets or copied copy.

## 4. Workflow
- Work in your own worktree and branch. Before a PR: lint, tsc, test and build, all green.
- Screenshots are taken on synthetic or example data only.
- Before merge, an independent verifier (profile `verifier`) re-runs the PR's claims, checks these rules and probes the proxy (CSRF, scope, tenant). Unverified claims are removed or fixed.
- Never skip or delete tests or loosen checks without stating it and its reason in the PR.
- Post progress on the Linear issue at start, at major commits, when blocked and when done.
