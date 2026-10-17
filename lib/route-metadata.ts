import type { Metadata } from "next";
import { titleFor } from "@/lib/routes";

/** Suffix every page title carries; app/layout.tsx uses it as the title template. */
export const TITLE_SUFFIX = "Kalos";

/** The full document title for a pathname, e.g. "Plan · Kalos". */
export function documentTitle(pathname: string): string {
  return `${titleFor(pathname)} \u00b7 ${TITLE_SUFFIX}`;
}

/** Static metadata for a route's layout: the title comes from lib/routes.ts. */
export function routeMetadata(pathname: string): Metadata {
  return { title: { absolute: documentTitle(pathname) } };
}
