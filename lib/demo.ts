// Single source of truth for "is demo/mock data allowed to render" across the
// app. Default OFF: boards backed by lib/mock/* only show that data when this
// flag is explicitly set, so a viewer never mistakes fabricated runs for real
// ones. Read by the campaign surfaces, e.g. components/workbench/live-workbench.tsx.
export const DEMO_MODE = process.env.NEXT_PUBLIC_DEMO_MODE === "true";
