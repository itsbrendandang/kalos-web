/** "Lipase conc. (mg/L)" -> "Lipase conc."; the unit comes from `parseUnit`, so it is never printed twice. */
export const targetName = (target: string): string => target.replace(/\s*\([^)]*\)\s*$/, "");
