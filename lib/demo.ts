// Single source of truth for "is demo/mock data allowed to render" across the
// app. Default OFF: a surface backed by fabricated data only shows it when
// this flag is explicitly set, so a viewer never mistakes a simulated run for
// a real one. The mock-only boards this used to gate (the operations pipeline,
// the planning kanban, the vessel and plate screens, the data registry) have
// been retired outright rather than kept behind the flag; the remaining
// readers are the campaign workspace's adapter and Ask panel, where the flag
// picks between the engine's real campaign and lib/workspace/mock.ts.
export const DEMO_MODE = process.env.NEXT_PUBLIC_DEMO_MODE === "true";
