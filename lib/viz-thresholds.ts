/*
 * Client-side PRESENTATION thresholds (VIZ_SPEC 3.5). These decide when a
 * chart says "not enough to draw yet" instead of drawing; they are not
 * statistics and never change an engine number. Engine thresholds (e.g. the
 * scale ladder's MIN_RESIDUALS) are quoted from the engine, not repeated here.
 */

/** Parity plot: fewer held-out pairs than this reads as insufficient. */
export const MIN_PARITY_POINTS = 5;
/** Calibration diagram: fewer nominal levels than this renders as a table. */
export const MIN_CALIBRATION_LEVELS = 3;
/** Calibration diagram: fewer held-out runs than this gets a "coarse" caption. */
export const COARSE_CALIBRATION_N = 20;
/** Parity plot: predictions spanning less than this share of the measured spread get the "clusters near the mean" note. */
export const FLAT_PREDICTION_RATIO = 0.25;
/** Parity plot: above this many points, outside-band glyphs stop being drawn (they stay in the Data table). */
export const DENSE_PARITY_POINTS = 400;
/** Progress chart: more runs than this in a round collapse to a min-max box. */
export const MAX_RUNS_PER_ROUND = 24;
/** Dumbbells: more runs than this paginate by round. */
export const MAX_DUMBBELL_RUNS = 50;
/** Marks are keyboard-reachable one by one up to this count; beyond it the Data table is the path. */
export const MAX_FOCUSABLE_MARKS = 60;
/** Setpoint matrix: features shown before "Show all". */
export const MAX_SETPOINT_FEATURES = 12;
