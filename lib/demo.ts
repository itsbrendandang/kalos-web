// Single source of truth for "is demo/mock data allowed to render" across the
// app. Default OFF: boards backed by lib/mock/* only show that data when this
// flag is explicitly set, so a viewer never mistakes fabricated runs for real
// ones. See DESIGN.md-adjacent boards: components/operations/operations-view.tsx,
// components/planning/planning-board.tsx.
export const DEMO_MODE = process.env.NEXT_PUBLIC_DEMO_MODE === "true";
