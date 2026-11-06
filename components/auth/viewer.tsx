"use client";

import { createContext, useContext, useEffect, type ReactNode } from "react";
import { setAuditActor } from "@/lib/audit-store";
import { viewerLabel, type Viewer } from "@/lib/viewer";

const ViewerContext = createContext<Viewer>({ kind: "unknown" });

/** Gives client components the viewer the root layout resolved on the server. */
export function ViewerProvider({ viewer, children }: { viewer: Viewer; children: ReactNode }) {
  const label = viewerLabel(viewer);
  // The browser copy of the change log records changes under this name (lib/audit-store.ts).
  useEffect(() => setAuditActor(label), [label]);
  return <ViewerContext.Provider value={viewer}>{children}</ViewerContext.Provider>;
}

export function useViewer(): Viewer {
  return useContext(ViewerContext);
}
