"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { Viewer } from "@/lib/viewer";

const ViewerContext = createContext<Viewer>({ kind: "unknown" });

/** Gives client components the viewer the root layout resolved on the server. */
export function ViewerProvider({ viewer, children }: { viewer: Viewer; children: ReactNode }) {
  return <ViewerContext.Provider value={viewer}>{children}</ViewerContext.Provider>;
}

export function useViewer(): Viewer {
  return useContext(ViewerContext);
}
